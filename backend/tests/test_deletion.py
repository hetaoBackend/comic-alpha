"""Permanent deletion runs solely in temporary fixtures."""
import copy
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch
import test_console as fixtures

from services.console_service import ConsoleService as Console, atomic_json
from services.canon_service import CanonService
from services.deletion_service import DeletionService as Delete
from services.comicbrain_project_service import ComicBrainConflictError, ComicBrainValidationError


class DeletionTest(unittest.TestCase):
    tearDown = fixtures.ConsoleTest.tearDown
    save = fixtures.ConsoleTest.save
    compact_result = fixtures.ConsoleTest.compact_result

    def setUp(self):
        fixtures.ConsoleTest.setUp(self)
        self.document = fixtures.ConsoleTest.valid_workspace(self)
        self.images = self.root/'images'
        self.images.mkdir()
        self.environment_images = patch.dict(os.environ, {'COMIC_IMAGE_DIR':str(self.images)})
        self.environment_images.start()
        self.addCleanup(self.environment_images.stop)

    def prepare(self, target):
        def clean(data, system, prompt):
            payload = json.loads(prompt)
            return {'documents':[{'path':p, 'content':'\n'.join(line for line in c.split('\n') if 'DELETED_EVENT' not in line)} for p,c in payload['shared_documents'].items()]}
        with patch.object(Console, 'ask', side_effect=clean):
            return Delete.prepare({'target':target})

    def commit(self, proposal):
        return Delete.commit({'token':proposal['token'], 'confirmed':True})

    def chapter(self):
        self.draft['coverBrief'] = '独立封面'
        draft = self.save()
        result = self.compact_result()
        result['summary'] = 'DELETED_EVENT：捡到一个独有道具。'
        with patch.object(Console, 'ask', return_value=result):
            saved = CanonService.save({'draft_id':draft['id'], 'revision':draft['revision']})['draft']
        (self.series/'04-当前状态.md').write_text(self.document('test-state','state-snapshot','# 当前状态\n\nDELETED_EVENT 道具在主角手里。\n\n无伤势。','series: test\n'))
        return saved

    def test_draft_deletion_removes_files_history_and_exclusive_images_but_preserves_shared(self):
        self.draft['images'] = {'0':{'versions':[{'imageUrl':'/static/images/alone.png'}, {'imageUrl':'/backend/static/images/shared.png'}]}}
        draft = self.save()
        other = copy.deepcopy(self.draft)
        other.update(id='draft-other', images={'0':{'versions':[{'imageUrl':'/static/images/shared.png'}]}})
        Console.save_draft(other['id'], other, None)
        for name in ['alone.png', 'shared.png']:
            (self.images/name).write_bytes(b'fixture')
        atomic_json(Console.private_path('production/.assistant/x.json'), {'target':{'draft_id':draft['id']}, 'plot':'DELETED_EVENT'})
        before = (self.series/'00-系列总览.md').read_bytes()
        proposal = self.prepare({'kind':'draft','draft_id':draft['id']})
        self.assertTrue(Console.draft_path(draft['id']).exists())
        result = self.commit(proposal)
        self.assertFalse(Console.draft_path(draft['id']).exists())
        self.assertFalse((self.images/'alone.png').exists())
        self.assertTrue((self.images/'shared.png').exists())
        self.assertFalse(Console.private_path('production/.assistant/x.json').exists())
        self.assertEqual((self.series/'00-系列总览.md').read_bytes(), before)
        self.assertEqual([d['id'] for d in result['drafts']], ['draft-other'])
        with self.assertRaises(ComicBrainConflictError): Console.save_draft(draft['id'], draft, draft['revision'])

    def test_chapter_deletion_clears_derived_memory_and_production_and_prevents_resurrection(self):
        saved = self.chapter()
        target = {'kind':'chapter','series_id':'test','chapter_id':'ch001'}
        proposal = self.prepare(target)
        self.commit(proposal)
        self.assertFalse((self.root/'production/test/ch001').exists())
        self.assertFalse(list(self.series.glob('剧情/*/*/00-章节卡.md')))
        self.assertNotIn('DELETED_EVENT', json.dumps(Console.context('test'), ensure_ascii=False))
        self.assertIn('无伤势', (self.series/'04-当前状态.md').read_text())
        for p in (self.root/'production').rglob('*.json'):
            self.assertNotIn('DELETED_EVENT', p.read_text(), str(p))
        with self.assertRaises(ComicBrainConflictError): Console.save_draft(saved['id'], saved, saved['revision'])
        self.assertTrue(self.series.exists())

    def test_series_deletion_keeps_other_series_and_global_rules(self):
        saved = self.chapter()
        other = self.root/'wiki/系列/other-保留'
        other.mkdir()
        (other/'00-系列总览.md').write_text(self.document('other-overview','series-overview','# 保留系列','series: other\n'))
        rules = (self.root/'wiki/创作原则/01-故事.md').read_bytes()
        result = self.commit(self.prepare({'kind':'series','series_id':'test'}))
        self.assertFalse(self.series.exists())
        self.assertFalse((self.root/'production/test').exists())
        self.assertTrue(other.exists())
        self.assertEqual((self.root/'wiki/创作原则/01-故事.md').read_bytes(), rules)
        self.assertEqual(result['drafts'], [])
        self.assertIn('test', result['deletions']['seriesIds'])
        from services.series_character_service import SeriesCharacterService
        from services.comicbrain_project_service import ComicBrainProjectService
        with self.assertRaises(ComicBrainConflictError): SeriesCharacterService.get('test')
        with self.assertRaises(ComicBrainConflictError): ComicBrainProjectService.record_page_render('test', 'ch001', {}, '/static/images/late.png', project={})
        self.assertFalse(Console.private_path('production/.characters/test.json').exists())

    def test_multi_chapter_draft_retains_unrelated_planned_chapters(self):
        draft = {'id':'multi','seriesId':'test','chapterIndex':0,'chapters':[{'title':'删掉','pages':[{}]}, {'title':'保留','pages':[], 'images':{'0':{}}}], 'canonChapters':{'0':{'chapterId':'ch001'},'1':{'chapterId':'ch002'}}, 'retrospectives':{'0':{'content':'删掉'},'1':{'content':'保留'}}, 'pages':[{}], 'title':'删掉', 'social':{'text':'删掉'}}
        retained = Delete.prune_chapter(draft, 'test','ch001')
        self.assertEqual(retained['title'], '保留')
        self.assertEqual(retained['canonChapters']['0']['chapterId'], 'ch002')
        self.assertEqual(retained['retrospectives']['0']['content'], '保留')
        self.assertNotIn('social', retained)
        self.assertNotIn('删掉', json.dumps(retained, ensure_ascii=False))

    def test_confirmation_conflict_and_scope_guards(self):
        saved = self.save()
        p = self.prepare({'kind':'draft','draft_id':saved['id']})
        with self.assertRaises(ComicBrainValidationError): Delete.commit({'token':p['token']})
        modified = copy.deepcopy(saved); modified['title'] = '新修改'
        Console.save_draft(saved['id'], modified, saved['revision'])
        with self.assertRaises(ComicBrainConflictError): self.commit(p)
        for target in [{'kind':'draft','draft_id':'../outside'}, {'kind':'series','series_id':'../outside'}]:
            with self.assertRaises(ComicBrainValidationError): Delete.prepare({'target':target})
        for endpoint in ['prepare','commit']:
            self.assertEqual(self.client.post('/api/console/delete/'+endpoint, json={}, headers={'Origin':'https://outside.example'}).status_code, 403)

    def test_cleanup_failure_leaves_everything_intact(self):
        saved = self.chapter()
        before = Delete.snapshot()
        with patch.object(Console, 'ask', return_value={'documents':[]}):
            with self.assertRaises(ComicBrainValidationError):
                Delete.prepare({'target':{'kind':'chapter','series_id':'test','chapter_id':'ch001'}})
        self.assertEqual(Delete.snapshot(), before)
        self.assertTrue(Console.draft_path(saved['id']).exists())

    def test_inflight_image_finishing_after_deletion_is_discarded(self):
        saved = self.save()
        owner = Delete.image_owner({'console_owner_draft_id':saved['id'], 'console_owner_revision':saved['revision']})
        self.commit(self.prepare({'kind':'draft','draft_id':saved['id']}))
        late = self.images/'late.png'
        late.write_bytes(b'late generated result')
        with self.assertRaises(ComicBrainConflictError): Delete.finish_image(owner, '/static/images/late.png')
        self.assertFalse(late.exists())

    def test_generated_image_not_yet_autosaved_is_still_deleted_with_its_owner(self):
        saved = self.save()
        owner = Delete.image_owner({'console_owner_draft_id':saved['id']})
        image = self.images/'unsaved.png'
        image.write_bytes(b'new result')
        Delete.finish_image(owner, '/static/images/unsaved.png')
        self.commit(self.prepare({'kind':'draft','draft_id':saved['id']}))
        self.assertFalse(image.exists())
        self.assertFalse(list(Console.private_path('production/.image-results').glob('*.json')))

    def test_filesystem_failure_rolls_back_content_and_deletion_ledger(self):
        saved = self.save()
        p = self.prepare({'kind':'draft','draft_id':saved['id']})
        real_unlink = Path.unlink
        def fail(path, *args, **kwargs):
            if path == Console.draft_path(saved['id']):
                raise OSError('fixture failure')
            return real_unlink(path, *args, **kwargs)
        with patch.object(Path,'unlink',fail):
            with self.assertRaises(OSError): self.commit(p)
        self.assertTrue(Console.draft_path(saved['id']).exists())
        self.assertNotIn(saved['id'], Delete.state()['draftIds'])
