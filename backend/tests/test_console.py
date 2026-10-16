"""Console tests use temporary workspaces; never write to the creator's Wiki."""
import copy
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import app
from services.console_service import ConsoleService, atomic_json
from services.canon_service import CanonService
from services.comicbrain_project_service import ComicBrainConflictError, ComicBrainValidationError

class ConsoleTest(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory()
        self.root=Path(self.temporary.name)
        self.environment=patch.dict(os.environ,{'COMICBRAIN_ROOT':str(self.root)})
        self.environment.start()
        self.client=app.test_client()
        self.headers={'Origin':'http://localhost:8000'}
        self.series=self.root/'wiki/系列/test-测试'
        self.series.mkdir(parents=True)
        self.overview='---\nseries: test\nstatus: canonical\n---\n# 测试 · 系列总览\n\n## 一句话提案\n\n一个故事。\n'
        (self.series/'00-系列总览.md').write_text(self.overview)
        (self.root/'wiki/证据').mkdir()
        (self.root/'wiki/证据/剧情决策日志.md').write_text('# 决策日志\n')
        (self.root/'wiki/创作原则').mkdir()
        (self.root/'wiki/创作原则/01-故事.md').write_text('# 故事原则\n因果清晰。')
        (self.root/'wiki/创作偏好').mkdir()
        self.draft={'id':'draft-test','mode':'series','seriesId':'test','title':'草稿','pages':[{'title':'第一页','rows':[{'height':'200px','panels':[{'text':'看见问题。'}]}]}], 'chapters':[], 'images':{},'storyDirty':False}

    def tearDown(self):
        self.environment.stop()
        self.temporary.cleanup()

    def save(self):
        return ConsoleService.save_draft('draft-test',copy.deepcopy(self.draft),None)

    def test_local_origin_required_for_every_console_route(self):
        for method,path in [('get','/api/console/workspace'),('put','/api/console/drafts/draft-test'),('post','/api/console/plan'),('post','/api/console/canon/prepare'),('post','/api/console/canon/commit'),('post','/api/console/canon/save'),('post','/api/console/retrospective'),('put','/api/console/retrospective')]:
            response=getattr(self.client,method)(path,json={},headers={'Origin':'https://malicious.example'})
            self.assertEqual(response.status_code,403,path)

    def test_workspace_includes_wiki_series_without_production(self):
        response=self.client.get('/api/console/workspace',headers=self.headers)
        self.assertEqual(response.status_code,200)
        data=response.get_json()
        self.assertEqual(data['series'][0]['name'],'测试')
        self.assertEqual(len(data['principles']),1)
        self.assertEqual(data['projects'],[])

    def test_draft_save_is_noncanonical_and_cas_protected(self):
        before=(self.series/'00-系列总览.md').read_text()
        d=self.save()
        changed=copy.deepcopy(d);changed['title']='第二版';changed['canonDecision']='FORGED'
        saved=ConsoleService.save_draft(d['id'],changed,d['revision'])
        self.assertIsNone(saved['canonDecision'])
        with self.assertRaises(ComicBrainConflictError):ConsoleService.save_draft(d['id'],changed,d['revision'])
        self.assertEqual((self.series/'00-系列总览.md').read_text(),before)

    def test_draft_ids_and_symlinks_cannot_escape_workspace(self):
        with self.assertRaises(ComicBrainValidationError):ConsoleService.draft_path('../outside')
        outside=self.root.parent/'console-outside'
        (self.root/'production').symlink_to(outside,target_is_directory=True)
        with self.assertRaises(Exception):ConsoleService.draft_path('safe')

    def test_plan_requires_actual_chapters_and_rule_applications(self):
        data={'idea':'下一话','chapter_count':1,'series_id':'test'}
        with patch.object(ConsoleService,'ask',return_value={'chapters':[]}):
            with self.assertRaises(ComicBrainValidationError):ConsoleService.plan(data)
        result={'chapters':[{'title':'下一话','beats':['开场','选择','代价']}], 'ruleApplications':[{'documentId':'01-故事','rule':'故事原则','status':'采用','reason':'主角主动选择'}]}
        with patch.object(ConsoleService,'ask',return_value=result) as model:
            plan=ConsoleService.plan(data)
            self.assertTrue(plan['contextHash'])
            self.assertIn('故事原则',model.call_args.args[2])

    def proposal(self):
        d=self.save()
        token='a'*32
        proposal={'token':token,'draftId':d['id'],'draftRevision':d['revision'],'seriesId':'test','baseline':CanonService.hashes(),'decision':'DEC-TEST','summary':'定稿测试','changes':[{'path':'wiki/系列/test-测试/00-系列总览.md','content':self.overview+'\n已确认变更。\n'}],'evidence':'\n### DEC-TEST\n确认当前故事。\n'}
        atomic_json(ConsoleService.private_path(f'production/.console-proposals/{token}.json'),proposal)
        return token,proposal

    def test_next_chapter_can_be_designed_without_user_idea_and_reads_series_rules(self):
        (self.series/'05-系列偏好.md').write_text('# 系列偏好\n从《武林外传》选小片段学习冲突机制。')
        (self.series/'04-当前状态.md').write_text('# 当前状态\n主角刚偿还了朋友的人情。')
        result={'chapters':[{'title':'下一话','beats':['开场','选择','代价']}], 'ruleApplications':[
            {'documentId':'01-故事','status':'采用','reason':'主角选择有后果'},
            {'documentId':'05-系列偏好','status':'采用','reason':'以头衔与责任的错位制造冲突'}]}
        before={str(p):p.read_bytes() for p in (self.root/'wiki').rglob('*.md')}
        with patch.object(ConsoleService,'ask',return_value=result) as model:
            response=self.client.post('/api/console/plan',json={'series_id':'test','chapter_count':1},headers=self.headers)
        self.assertEqual(response.status_code,200,response.get_json())
        payload=json.loads(model.call_args.args[2])
        self.assertEqual(payload['planning_mode'],'automatic')
        self.assertEqual(payload['idea'],'')
        self.assertIn('武林外传',json.dumps(payload['context'],ensure_ascii=False))
        self.assertIn('偿还了朋友的人情',json.dumps(payload['context'],ensure_ascii=False))
        self.assertEqual({str(p):p.read_bytes() for p in (self.root/'wiki').rglob('*.md')},before)

    def test_explicit_classic_reference_is_sent_and_adaptation_is_returned(self):
        inspiration={'work':'武林外传','reference':'争抢临时头衔的小冲突','mechanism':'权力与责任错位','adaptation':'主角抢到值日队长，却必须自己收拾残局','sourceStatus':'机制启发'}
        result={'chapters':[{'title':'队长只有一天','beats':['抢头衔','推责任','收拾残局'],'inspiration':inspiration}], 'ruleApplications':[{'documentId':'01-故事','status':'采用','reason':'主动选择带来代价'}]}
        with patch.object(ConsoleService,'ask',return_value=result) as model:
            plan=ConsoleService.plan({'series_id':'test','idea':'主角争当队长','inspiration_reference':'武林外传','chapter_count':1})
        payload=json.loads(model.call_args.args[2])
        self.assertEqual(payload['planning_mode'],'directed')
        self.assertEqual(payload['inspiration_reference'],'武林外传')
        self.assertEqual(plan['chapters'][0]['inspiration'],inspiration)
        self.assertIn('不编造集数',model.call_args.args[1])
        del result['chapters'][0]['inspiration']
        with patch.object(ConsoleService,'ask',return_value=result):
            with self.assertRaises(ComicBrainValidationError):
                ConsoleService.plan({'series_id':'test','inspiration_reference':'武林外传'})

    def test_automatic_planning_requires_series_context_and_valid_reference(self):
        for data in [{'idea':''},{'series_id':'draft-new','idea':''}, {'series_id':'test','inspiration_reference':[]}, {'series_id':'test','inspiration_reference':'x'*4001}]:
            with patch.object(ConsoleService,'ask') as model:
                with self.assertRaises(ComicBrainValidationError):ConsoleService.plan(data)
                model.assert_not_called()

    def test_new_empty_workspace_can_plan_first_series_without_inventing_rules(self):
        (self.root/'wiki/创作原则/01-故事.md').unlink()
        result={'chapters':[{'title':'第一话','beats':['开场','选择','代价']}], 'ruleApplications':[]}
        with patch.object(ConsoleService,'ask',return_value=result):
            plan=ConsoleService.plan({'series_id':'draft-first','idea':'一群熟人在小馆里解决生活麻烦。'})
        self.assertEqual(plan['ruleApplications'],[])
        self.assertTrue(plan['contextHash'])

    def test_commit_is_explicit_and_idempotent_and_evidence_first(self):
        token,proposal=self.proposal()
        self.assertNotIn('已确认变更',(self.series/'00-系列总览.md').read_text())
        result=CanonService.commit(token)
        self.assertEqual(result['decision'],'DEC-TEST')
        self.assertIn('已确认变更',(self.series/'00-系列总览.md').read_text())
        CanonService.commit(token)
        log=(self.root/'wiki/证据/剧情决策日志.md').read_text()
        self.assertEqual(log.count('### DEC-TEST'),1)
        self.assertEqual(ConsoleService.get_draft('draft-test')['canonDecision'],'DEC-TEST')

    def test_changed_wiki_or_draft_blocks_commit(self):
        token,_=self.proposal()
        (self.series/'00-系列总览.md').write_text(self.overview+'\n外部修订。')
        with self.assertRaises(ComicBrainConflictError):CanonService.commit(token)
        self.assertNotIn('DEC-TEST',(self.root/'wiki/证据/剧情决策日志.md').read_text())

    def test_autosave_clears_canon_marker_only_when_story_changes(self):
        token,_=self.proposal();CanonService.commit(token)
        d=ConsoleService.get_draft('draft-test')
        d['step']=2
        d=ConsoleService.save_draft(d['id'],d,d['revision'])
        self.assertEqual(d['canonDecision'],'DEC-TEST')
        d['pages'][0]['rows'][0]['panels'][0]['text']='新的剧情'
        d=ConsoleService.save_draft(d['id'],d,d['revision'])
        self.assertIsNone(d['canonDecision'])

    def valid_workspace(self):
        import shutil
        agents=Path(__file__).resolve().parents[2]/'ComicBrain/.agents'
        shutil.copytree(agents,self.root/'.agents',ignore=shutil.ignore_patterns('__pycache__'))
        def document(identifier,kind,body,extra=''):
            return f'---\nid: {identifier}\ntype: {kind}\nstatus: canonical\nupdated: "2026-10-11"\n{extra}---\n\n{body}\n'
        (self.root/'AGENTS.md').write_text('# Agent rules')
        required=['index.md','wiki/index.md','wiki/证据/index.md','wiki/证据/用户反馈日志.md','wiki/系列/index.md','wiki/创作原则/index.md','wiki/创作偏好/index.md']
        for index,relative in enumerate(required):
            target=self.root/relative;target.parent.mkdir(parents=True,exist_ok=True)
            target.write_text(document(f'fixture-{index}','index','# Fixture'))
        (self.root/'wiki/证据/剧情决策日志.md').write_text(document('decisions','evidence','# 决策日志'))
        (self.root/'wiki/创作原则/01-故事.md').write_text(document('story-rule','principle','# 故事原则'))
        (self.series/'00-系列总览.md').write_text(document('test-overview','series-overview','# 测试系列', 'series: test\n'))
        (self.series/'index.md').write_text(document('test-index','series-hub','# 测试系列', 'series: test\n'))
        (self.series/'assets').mkdir()
        (self.series/'assets/index.md').write_text(document('test-assets','asset-index','# Assets','series: test\n'))
        return document

    def test_prepare_compiles_staged_chapter_without_writing_canon(self):
        document = self.valid_workspace()
        self.save()
        relative='wiki/系列/test-测试/剧情/卷-001/章节-001/'
        extra='series: test\nvolume: v001\nchapter: ch001\n'
        changes=[
            {'path':relative+'00-章节卡.md','content':document('test-ch001-card','chapter-card','# 测试章节\n## 规则应用记录\n### 已采用\n人物主动选择。\n### 不适用、覆盖与禁止误用\n无额外覆盖。',extra+'rule_context: reviewed\n')},
            {'path':relative+'01-漫画脚本.md','content':document('test-ch001-script','comic-script','# 测试章节 · 漫画脚本\n## PAGE 001\n### P001-F01\n- 画面：看见问题。\n- 对白：怎么办？',extra)},
            {'path':relative+'04-封面描述.md','content':document('test-ch001-cover','cover-description','# 测试封面\n标题：选择\n描述：主角看见问题的瞬间。',extra)}
        ]
        baseline=CanonService.hashes()
        with patch.object(ConsoleService,'ask',return_value={'summary':'确认这一章','chapter_id':'ch001','conflicts':[],'changes':changes}):
            result=CanonService.prepare({'draft_id':'draft-test'})
        self.assertEqual(CanonService.hashes(),baseline)
        self.assertFalse((self.series/'剧情').exists())
        proposal=json.loads(ConsoleService.private_path(f'production/.console-proposals/{result["token"]}.json').read_text())
        self.assertEqual(len(proposal['production']['package']['pages']),1)
        CanonService.commit(result['token'])
        self.assertTrue((self.root/'production/test/ch001/storyboard.json').is_file())
        self.assertIn('确认这一章',(self.root/'wiki/证据/剧情决策日志.md').read_text())

    def compact_result(self):
        return {'summary':'主角看见问题，决定面对。', 'learning':{'classification':'无修改','reason':'没有可核实的人工修改，无需调整原则。'}, 'retrospective':'第1页第1格清楚呈现了问题，下话应表现主动选择与代价。', 'conflicts':[], 'updates':[], 'ruleApplications':[{'documentId':'01-故事','status':'采用','reason':'第1页第1格呈现问题。'}]}

    def test_direct_save_serializes_authored_panels_without_images_and_adds_compact_retrospective(self):
        self.valid_workspace()
        self.draft.update(coverBrief='主角面对问题的独立封面。', images={'0':{'versions':[{'imageUrl':'data:image/png;base64,PRIVATE_IMAGE'}]}})
        d=self.save()
        rules=(self.root/'wiki/创作原则/01-故事.md').read_bytes()
        with patch.object(ConsoleService,'ask',return_value=self.compact_result()) as model:
            result=CanonService.save({'draft_id':d['id'],'revision':d['revision']})
            self.assertEqual(model.call_count,1)
            self.assertNotIn('PRIVATE_IMAGE',model.call_args.args[2])
            self.assertIn('看见问题。',model.call_args.args[2])
            again=CanonService.save({'draft_id':d['id'],'revision':result['draft']['revision']})
            self.assertTrue(again['already_saved'])
            self.assertEqual(model.call_count,1)
        chapter=self.series/'剧情/卷-001/章节-001'
        self.assertIn('看见问题。',(chapter/'01-漫画脚本.md').read_text())
        self.assertIn('主角看见问题',(chapter/'00-章节卡.md').read_text())
        self.assertTrue((chapter/'03-章节复盘.md').exists())
        self.assertEqual((self.root/'wiki/创作原则/01-故事.md').read_bytes(),rules)
        package=json.loads((self.root/'production/test/ch001/storyboard.json').read_text())
        self.assertIn('看见问题。',json.dumps(package,ensure_ascii=False))
        self.assertEqual(result['draft']['canonChapters']['0']['chapterId'],'ch001')
        self.assertIn('主角看见问题',json.dumps(ConsoleService.context('test'),ensure_ascii=False))
        # Editing an already saved chapter updates the same identity, never allocates a duplicate.
        d=result['draft'];d['pages'][0]['rows'][0]['panels'][0]['text']='主角做出新的选择。'
        d=ConsoleService.save_draft(d['id'],d,d['revision'])
        with patch.object(ConsoleService,'ask',return_value=self.compact_result()):
            result=CanonService.save({'draft_id':d['id'],'revision':d['revision']})
        self.assertEqual(result['draft']['canonChapters']['0']['chapterId'],'ch001')
        self.assertEqual(len(list(self.series.glob('剧情/*/*/01-漫画脚本.md'))),1)

    def test_new_series_save_keeps_creator_brief_and_initial_chapter(self):
        self.valid_workspace()
        registry=self.root/'wiki/系列/index.md'
        registry.write_text(registry.read_text()+'\n<!-- SERIES_ROWS -->\n')
        self.draft.update(seriesId='draft-new-series',seriesName='新系列',seriesBrief='小雨必须学会面对自己造成的麻烦。',coverBrief='小雨站在课桌前。')
        d=self.save()
        with patch.object(ConsoleService,'ask',return_value=self.compact_result()):
            result=CanonService.save({'draft_id':d['id'],'revision':d['revision']})
        sid=result['draft']['seriesId']
        self.assertTrue(sid.startswith('series-'))
        directory=ConsoleService.series_dirs()[sid]
        self.assertIn('小雨必须学会面对自己造成的麻烦。',(directory/'00-系列总览.md').read_text())
        self.assertEqual(result['draft']['canonChapters']['0']['chapterId'],'ch001')

    def test_direct_save_conflict_and_stale_draft_never_write(self):
        self.valid_workspace();self.draft['coverBrief']='独立封面';d=self.save();baseline=CanonService.hashes()
        conflict={**self.compact_result(),'conflicts':['人物还不知道这个秘密。']}
        with patch.object(ConsoleService,'ask',return_value=conflict):
            with self.assertRaises(ComicBrainConflictError):CanonService.save({'draft_id':d['id'],'revision':d['revision']})
        self.assertEqual(CanonService.hashes(),baseline)
        def concurrent(*args):
            fresh=ConsoleService.get_draft(d['id']);fresh['title']='另一窗口修订'
            ConsoleService.save_draft(fresh['id'],fresh,fresh['revision'])
            return self.compact_result()
        with patch.object(ConsoleService,'ask',side_effect=concurrent):
            with self.assertRaises(ComicBrainConflictError):CanonService.save({'draft_id':d['id'],'revision':d['revision']})
        self.assertEqual(CanonService.hashes(),baseline)

    def test_saving_imported_second_chapter_never_overwrites_first(self):
        self.valid_workspace();self.draft['coverBrief']='独立封面';d=self.save()
        with patch.object(ConsoleService,'ask',return_value=self.compact_result()):
            first=CanonService.save({'draft_id':d['id'],'revision':d['revision']})['draft']
            second=copy.deepcopy(self.draft);second.update(id='draft-second',title='第二话')
            second=ConsoleService.save_draft(second['id'],second,None)
            second=CanonService.save({'draft_id':second['id'],'revision':second['revision']})['draft']
        original=(self.series/'剧情/卷-001/章节-001/01-漫画脚本.md').read_bytes()
        self.assertEqual(second['canonChapters']['0']['chapterId'],'ch002')
        second['source']={'seriesId':'test','chapterId':'ch002','metadata':{}}
        second['pages'][0]['rows'][0]['panels'][0]['text']='第二话的人工修改。'
        second=ConsoleService.save_draft(second['id'],second,second['revision'])
        with patch.object(ConsoleService,'ask',return_value=self.compact_result()):
            result=CanonService.save({'draft_id':second['id'],'revision':second['revision']})['draft']
        self.assertEqual((self.series/'剧情/卷-001/章节-001/01-漫画脚本.md').read_bytes(),original)
        self.assertIn('第二话的人工修改。',(self.series/'剧情/卷-001/章节-002/01-漫画脚本.md').read_text())
        self.assertEqual(result['source']['metadata']['source']['chapter_id'],'ch002')
        self.assertEqual(result['source']['metadata']['pages'][0]['rows'][0]['panels'][0]['text'],'第二话的人工修改。')

    def test_human_edits_create_scoped_learning_and_retain_retrospective(self):
        self.valid_workspace();self.draft.update(coverBrief='独立封面',aiPages=copy.deepcopy(self.draft['pages']))
        self.draft['pages'][0]['rows'][0]['panels'][0]['text']='主角主动承认问题，并承担代价。'
        d=self.save();rules=(self.root/'wiki/创作原则/01-故事.md').read_bytes()
        result={**self.compact_result(),'learning':{'classification':'质量改进','reason':'第1页第1格从被动看见改为主动承担。','rule':'让主角的主动选择推动后果。','exception':'纯气氛开场可稍后呈现选择。','recommendation':'值得作为本系列候选经验，暂不泛化。'}}
        with patch.object(ConsoleService,'ask',return_value=result) as model:
            saved=CanonService.save({'draft_id':d['id'],'revision':d['revision']})['draft']
        payload=json.loads(model.call_args.args[2])
        self.assertEqual(payload['creator_feedback']['panelChanges'][0]['before'],'看见问题。')
        self.assertEqual(payload['creator_feedback']['panelChanges'][0]['after'],'主角主动承认问题，并承担代价。')
        self.assertTrue(payload['need_retrospective'])
        self.assertIn('candidate',(self.series/'05-系列偏好.md').read_text())
        self.assertIn('例外条件',(self.series/'05-系列偏好.md').read_text())
        self.assertIn('FB-',(self.root/'wiki/证据/用户反馈日志.md').read_text())
        self.assertEqual((self.root/'wiki/创作原则/01-故事.md').read_bytes(),rules)
        self.assertIn('候选经验',saved['learningReviews']['0']['effect'])
        self.assertTrue(saved['retrospectives']['0']['content'])

    def test_explicit_future_guidance_updates_series_requirements_not_global_rules(self):
        self.valid_workspace();self.draft.update(coverBrief='独立封面',futureGuidance='以后每话都让主角主动选择，并展示后果。')
        d=self.save();rules=(self.root/'wiki/创作原则/01-故事.md').read_bytes()
        result={**self.compact_result(),'learning':{'classification':'长期要求','reason':'用户明确要求以后每话沿用。','rule':'每话让主角主动选择并展示后果。','exception':'跨话铺垫可在后续章兑现。','recommendation':'更新本系列创作要求。'}}
        with patch.object(ConsoleService,'ask',return_value=result):
            saved=CanonService.save({'draft_id':d['id'],'revision':d['revision']})['draft']
        self.assertIn('stable',(self.series/'01-创作约束.md').read_text())
        self.assertIn('本系列',saved['learningReviews']['0']['effect'])
        self.assertEqual((self.root/'wiki/创作原则/01-故事.md').read_bytes(),rules)

    def test_missing_ai_original_does_not_invent_preference_and_manual_review_survives(self):
        self.valid_workspace();self.draft.update(coverBrief='独立封面',retrospectives={'0':{'content':'用户手工写的复盘。','manual':True,'basedOn':None}})
        d=self.save()
        result={**self.compact_result(),'retrospective':'不得覆盖用户正文','learning':{'classification':'质量改进','reason':'可能有改进，但没有原稿可核实。','rule':'不要被臆造的反馈泛化。','exception':'例外。'}}
        with patch.object(ConsoleService,'ask',return_value=result) as model:
            saved=CanonService.save({'draft_id':d['id'],'revision':d['revision']})['draft']
        payload=json.loads(model.call_args.args[2])
        self.assertFalse(payload['need_retrospective'])
        self.assertFalse(payload['creator_feedback']['baselineAvailable'])
        self.assertFalse((self.series/'05-系列偏好.md').exists())
        self.assertEqual(saved['retrospectives']['0']['content'],'用户手工写的复盘。')
        self.assertIn('用户手工写的复盘',(self.series/'剧情/卷-001/章节-001/03-章节复盘.md').read_text())

    def test_compact_ai_cannot_change_principles_or_file_identity(self):
        self.valid_workspace();self.draft['coverBrief']='独立封面';d=self.save();baseline=CanonService.hashes()
        for update in [
            {'path':'wiki/创作原则/01-故事.md','old':'故事原则','new':'新原则'},
            {'path':'wiki/系列/test-测试/00-系列总览.md','old':'series: test','new':'series: other'},
            {'path':[],'old':'x','new':'y'},
        ]:
            with patch.object(ConsoleService,'ask',return_value={**self.compact_result(),'updates':[update]}):
                with self.assertRaises(ComicBrainValidationError):CanonService.save({'draft_id':d['id'],'revision':d['revision']})
            self.assertEqual(CanonService.hashes(),baseline)

    def test_retrospective_is_optional_editable_and_cannot_mutate_story(self):
        from services.series_memory_service import SeriesMemoryService
        self.valid_workspace();self.draft['coverBrief']='独立封面';d=self.save()
        with patch.object(ConsoleService,'ask',return_value=self.compact_result()):
            saved=CanonService.save({'draft_id':d['id'],'revision':d['revision']})['draft']
        baseline=CanonService.hashes()
        with patch.object(ConsoleService,'ask',return_value={'content':'第1页第1格：问题清楚，可补充选择的代价。'}):
            review=SeriesMemoryService.retrospective({'draft_id':d['id'],'direction':'检查代价'})
        self.assertEqual(CanonService.hashes(),baseline)
        review['content']='手工调整：保留当前节奏，下话补充后果。'
        saved['retrospectives']={'0':review}
        saved=ConsoleService.save_draft(saved['id'],saved,saved['revision'])
        with patch.object(ConsoleService,'ask') as model:
            result=SeriesMemoryService.save_retrospective({'draft_id':saved['id'],'revision':saved['revision']})
            model.assert_not_called()
        self.assertEqual(result['draft']['canonDecision'],saved['canonDecision'])
        self.assertEqual(result['draft']['pages'],saved['pages'])
        changed=[key for key,value in CanonService.hashes().items() if baseline.get(key)!=value]
        self.assertEqual(set(changed),{'wiki/证据/剧情决策日志.md','wiki/系列/test-测试/剧情/卷-001/章节-001/03-章节复盘.md'})
        fresh=result['draft'];fresh['retrospectives']['0']['basedOn']='stale'
        fresh=ConsoleService.save_draft(fresh['id'],fresh,fresh['revision'])
        with self.assertRaises(ComicBrainConflictError):SeriesMemoryService.save_retrospective({'draft_id':fresh['id'],'revision':fresh['revision']})

    def test_invalid_confirmation_never_changes_wiki(self):
        for token in ['../other','','not-a-token']:
            with self.assertRaises(ComicBrainValidationError):CanonService.commit(token)
        self.assertEqual((self.series/'00-系列总览.md').read_text(),self.overview)

    def test_series_document_titles_keep_their_distinct_purpose(self):
        for name in ['01-创作约束','02-故事主线','04-当前状态']:
            (self.series/(name+'.md')).write_text('# 测试系列 · '+name[3:]+'\n正文')
        docs=ConsoleService.documents(self.series.relative_to(self.root).as_posix())
        self.assertEqual([doc['title'] for doc in docs], ['系列总览','创作约束','故事主线','当前状态'])
        self.assertTrue(all(doc['group']=='系列设定' for doc in docs))

    def test_imported_storyboard_revision_uses_current_pages_without_requiring_a_plot(self):
        self.draft['pages']=self.draft['pages']*12
        self.draft.update({'source':{'seriesId':'test','chapterId':'ch001'},'pageCount':12,'revisionText':'缩短对白'})
        self.save()
        with patch('services.comic_service.ComicService') as service:
            service.return_value.generate_comic_script.return_value=self.draft['pages']
            result=ConsoleService.storyboard({'draft_id':'draft-test','revise':True})
            prompt=service.return_value.generate_comic_script.call_args.args[0]
        self.assertIn('缩短对白',prompt)
        self.assertIn('previous_pages',prompt)
        self.assertEqual(result,self.draft['pages'])

if __name__=='__main__':unittest.main()
