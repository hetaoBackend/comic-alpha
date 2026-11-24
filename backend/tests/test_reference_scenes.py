"""Source discovery and story planning use disposable workspaces and fake search."""
import copy
import json
import unittest
from unittest.mock import Mock, patch
import requests
import test_console as fixtures

from services.console_service import ConsoleService as Console
from services.reference_scene_service import ReferenceSceneService as Scenes
from services.series_reference_service import SeriesReferenceService as Reference
from services.comicbrain_project_service import ComicBrainValidationError


class SceneTest(unittest.TestCase):
    setUp = fixtures.ConsoleTest.setUp
    tearDown = fixtures.ConsoleTest.tearDown

    def scene(self, suffix='甲'):
        return Scenes.clean_scene({'title':'测试片段'+suffix,'reference':'用于结构测试的原作冲突'+suffix,
            'mechanism':'选择推动升级','adaptationHint':'换成本系列任务与道具',
            'sourceStatus':'模型记忆待核实','sourceScene':{'characters':'原作人物'+suffix,'setup':'原作具体处境', 'choice':'人物主动选择', 'result':'原作可见结果'}}, '参考作品')

    @staticmethod
    def scope():
        return {'unit':'local_moment','locations':1,'timeJumps':0,'requiresEpisodeContext':False,'dialogueHeavy':False}

    def test_discovery_refills_to_ten_after_rejecting_long_arcs_and_duplicates(self):
        small = [{**self.scene(str(i)), 'scope':self.scope()} for i in range(10)]
        arc = {**self.scene('整集'), 'scope':{**self.scope(),'locations':3}}
        verbose = {**self.scene('冗长'), 'scope':self.scope(), 'reference':'长'*66}
        with patch.object(Scenes,'search_public',return_value=[]) as retrieval, patch.object(Console,'ask',side_effect=[
            {'candidates':[arc,verbose,small[0],small[0],small[1]]},
            {'candidates':small[2:]},
        ]) as model:
            result=Scenes.search({'work':'参考作品'})
        self.assertEqual(len(result['candidates']),10)
        self.assertEqual(len({c['id'] for c in result['candidates']}),10)
        followup=json.loads(model.call_args_list[1].args[2])
        self.assertEqual(followup['candidate_count'],8)
        self.assertEqual(len(followup['rejected_candidates']),2)
        self.assertEqual(len(followup['accepted_candidates']),2)
        self.assertEqual(retrieval.call_count,2)
        self.assertIn('借还',retrieval.call_args.args[1])

    def test_shortfall_is_bounded_and_legacy_storyline_keeps_full_source(self):
        legacy={**self.scene(),'reference':'原作事实'*60}
        self.assertEqual(Scenes.clean_scene(legacy,'参考作品')['reference'],legacy['reference'])
        scene={**self.scene(),'scope':self.scope()}
        with patch.object(Scenes,'search_public',return_value=[]), patch.object(Console,'ask',return_value={'candidates':[scene]}) as model:
            result=Scenes.search({'work':'参考作品'})
        self.assertEqual(model.call_count,3)
        self.assertEqual(len(result['candidates']),1)
        self.assertIn('1/10',result['notice'])

    def config(self):
        return {'work':'参考作品','mode':'plot','brief':'保持小冲突','storyline':[self.scene(),self.scene('乙')]}

    def test_failed_attribution_is_repaired_automatically_without_user_supplying_a_scene(self):
        fixtures.ConsoleTest.reference_preference(self)
        good = fixtures.ConsoleTest.reference_plan(self)
        bad = copy.deepcopy(good)
        bad['chapters'][0]['inspiration']['sourceStatus'] = '机制启发'
        bad['chapters'][0]['inspiration'].pop('sourceScene')
        with patch.object(Console,'ask',side_effect=[bad,good]) as model:
            result = Console.plan({'series_id':'test'})
        self.assertEqual(model.call_count,2)
        self.assertIn('sourceScene',result['chapters'][0]['inspiration'])
        repair = json.loads(model.call_args_list[1].args[2])['repair']
        self.assertIn('不要让用户补全',repair['instruction'])
        self.assertEqual(json.loads(model.call_args_list[0].args[2])['idea'],'')

    def test_automatic_discovery_precedes_writing_and_source_metadata_is_server_owned(self):
        self.source_selection.stop()
        chosen=self.scene()
        result=fixtures.ConsoleTest.reference_plan(self)
        result['ruleApplications']=result['ruleApplications'][:1]
        result['chapters'][0]['inspiration']={'work':'参考作品','mechanism':'具体升级','adaptation':'本话人物承担新的任务'}
        with patch.object(Scenes,'search',return_value={'candidates':[chosen]}) as search, patch.object(Console,'ask',return_value=result) as model:
            plan=Console.plan({'series_id':'draft-new','idea':'独立校园小事','series_reference':{'work':'参考作品','mode':'plot','brief':''}})
        search.assert_called_once()
        self.assertEqual(json.loads(model.call_args.args[2])['selected_reference_scenes'][0]['id'],chosen['id'])
        self.assertEqual(plan['chapters'][0]['inspiration']['referenceId'],chosen['id'])
        self.assertEqual(plan['chapters'][0]['inspiration']['sourceStatus'],'模型记忆待核实')
        self.assertEqual(plan['chapters'][0]['inspiration']['sourceScene'],chosen['sourceScene'])

    def test_character_name_arrays_are_normalized_and_deleted_reference_ids_are_skipped(self):
        raw=self.scene()
        raw['sourceScene']['characters']=['原作甲','原作乙']
        scene=Scenes.clean_scene(raw,'参考作品')
        self.assertEqual(scene['sourceScene']['characters'],'原作甲、原作乙')
        from services.console_service import atomic_json
        atomic_json(Console.private_path('production/.console-deletions.json'),{'draftIds':[],'seriesIds':[],'chapters':[], 'referenceIds':[{'seriesId':'test','referenceId':scene['id']}]})
        requirements=[{'storyline':[scene,self.scene('乙')]}]
        selected=Scenes.select(requirements,[],1,series_id='test')
        self.assertEqual(selected[0]['title'],'测试片段乙')

    def test_stored_storyline_is_selected_in_order_skipping_only_confirmed_usage(self):
        config = self.config()
        initial = Reference.get('test')
        Reference.save('test',{**config,'revision':initial['revision']})
        self.assertEqual(len(Reference.get('test')['storyline']),2)
        first, second = config['storyline']
        card = self.series/'剧情/卷-001/章节-001/00-章节卡.md'
        card.parent.mkdir(parents=True)
        card.write_text('---\nid: used\ntype: chapter-card\nstatus: draft\nseries: test\nchapter: ch001\n---\n# 草稿\n- 脉络片段 ID：'+first['id']+'\n')
        docs = Console.context('test')
        requirements = Console.inspiration_requirements(docs)
        self.assertEqual(Scenes.select(requirements,docs,1)[0]['id'],first['id'])
        card.write_text(card.read_text().replace('status: draft','status: canonical'))
        docs = Console.context('test')
        self.assertEqual(Scenes.select(requirements,docs,1)[0]['id'],second['id'])
        self.assertEqual(Scenes.select(requirements,docs,1,[{'inspiration':{'referenceId':first['id']}}])[0]['id'],first['id'])
        self.assertEqual(Reference.get('test')['usedReferenceIds'],[first['id']])

    def test_planning_uses_the_chosen_scene_and_preserves_its_provenance(self):
        initial = Reference.get('test')
        config = self.config()
        Reference.save('test',{**config,'revision':initial['revision']})
        chosen = config['storyline'][0]
        result = fixtures.ConsoleTest.reference_plan(self)
        result['chapters'][0]['inspiration'] = {**chosen,'adaptation':'本话自己的任务、选择和结果','referenceId':chosen['id']}
        with patch.object(Console,'ask',return_value=result) as model:
            plan = Console.plan({'series_id':'test'})
        self.assertEqual(json.loads(model.call_args.args[2])['selected_reference_scenes'][0]['id'],chosen['id'])
        self.assertEqual(plan['chapters'][0]['inspiration']['sourceScene'],chosen['sourceScene'])
        result['chapters'][0]['inspiration']['referenceId']='incorrect'
        with patch.object(Console,'ask',return_value=result):
            with self.assertRaises(ComicBrainValidationError): Console.plan({'series_id':'test'})

    def test_search_uses_public_work_and_keywords_and_only_cites_returned_links(self):
        source = {'id':'S1','title':'参考作品剧情介绍','url':'https://example.com/episode','excerpt':'公开介绍'}
        scene = {**self.scene(), 'scope':self.scope(), 'sourceIds':['S1']}
        with patch.object(Scenes,'search_public',return_value=[source]) as search, patch.object(Console,'ask',return_value={'candidates':[scene]}) as model:
            result = Scenes.search({'work':'参考作品','candidate_count':1,'keywords':'误会','private_series_brief':'PRIVATE_CONTEXT'})
        search.assert_called_once_with('参考作品','误会')
        self.assertEqual(result['candidates'][0]['sources'][0]['url'],source['url'])
        self.assertEqual(result['candidates'][0]['sourceStatus'],'搜索摘要待核实')
        self.assertNotIn('PRIVATE_CONTEXT',model.call_args.args[2])
        scene['sourceIds']=['invented']
        scene['sources']=[{'url':'https://fabricated.example','title':'编造链接'}]
        with patch.object(Scenes,'search_public',return_value=[source]), patch.object(Console,'ask',return_value={'candidates':[scene]}):
            result=Scenes.search({'work':'参考作品','candidate_count':1})
        self.assertEqual(result['candidates'][0]['sources'],[])
        self.assertEqual(result['candidates'][0]['sourceStatus'],'模型记忆待核实')

    def test_search_failure_is_an_honest_memory_fallback_and_does_not_save_a_series(self):
        before={p:p.read_bytes() for p in self.root.rglob('*.md')}
        with patch.object(Scenes,'search_public',side_effect=requests.Timeout()), patch.object(Console,'ask',return_value={'candidates':[{**self.scene(),'scope':self.scope()}]}):
            result=Scenes.search({'work':'参考作品','candidate_count':1})
        self.assertIn('暂不可用',result['notice'])
        self.assertEqual(result['candidates'][0]['sourceStatus'],'模型记忆待核实')
        self.assertEqual({p:p.read_bytes() for p in self.root.rglob('*.md')},before)

    def test_official_episode_metadata_provides_scene_leads_without_executing_scripts(self):
        response=Mock(status_code=200)
        response.iter_content.return_value=[("var episodes=[{'title':'参考作品 第2集','brief':'人物围绕借还物品的一场小波折','img':'x','url':'https://tv.cctv.com/episode2.shtml'},"
            "{'title':'其他作品','brief':'无关','url':'https://tv.cctv.com/other.shtml'}];").encode()]
        official={'url':'https://tv.cctv.com/series.shtml'}
        with patch('services.reference_scene_service.requests.get',return_value=response) as request:
            episodes=Scenes.episode_sources([official],'参考作品','借还')
        self.assertEqual(len(episodes),1)
        self.assertIn('借还',episodes[0]['excerpt'])
        self.assertFalse(request.call_args.kwargs['allow_redirects'])
        response.close.assert_called_once()
        with patch('services.reference_scene_service.requests.get') as request:
            self.assertEqual(Scenes.episode_sources([{'url':'https://tv.cctv.com.evil.example/story'}],'参考作品',''),[])
        request.assert_not_called()

    def test_rss_results_are_filtered_and_search_endpoint_is_local_only(self):
        response=Mock()
        response.iter_content.return_value=['<rss><channel><item><title>参考作品 剧情</title><link>https://example.com/story</link><description>公开摘要</description></item><item><title>无关结果</title><link>https://example.com/other</link></item></channel></rss>'.encode()]
        with patch('services.reference_scene_service.requests.get',return_value=response) as request:
            results=Scenes.search_public('参考作品','误会')
        self.assertEqual(len(results),1)
        self.assertIn('误会',request.call_args.kwargs['params']['q'])
        for url in ['file:///etc/passwd','http://localhost/story','http://127.0.0.1/story','javascript:alert(1)']:
            self.assertFalse(Scenes.public_url(url))
        self.assertEqual(self.client.post('/api/console/reference/search',json={'work':'参考作品'},headers={'Origin':'https://outside.example'}).status_code,403)
