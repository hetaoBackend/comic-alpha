"""Assistant proposals and adoption never touch the creator's actual Wiki."""
import copy
import json
import unittest
from unittest.mock import patch
import test_console as fixtures

from services.console_service import ConsoleService as Console
from services.creative_assistant_service import CreativeAssistantService as Assistant
from services.comicbrain_project_service import ComicBrainValidationError, ComicBrainConflictError


class AssistantTest(unittest.TestCase):
    setUp = fixtures.ConsoleTest.setUp
    tearDown = fixtures.ConsoleTest.tearDown
    save = fixtures.ConsoleTest.save
    valid_workspace = fixtures.ConsoleTest.valid_workspace

    def applications(self):
        return [{'documentId': '01-故事', 'status': '采用', 'reason': '主角主动选择并承担后果'}]

    def result(self, patch_value=None, changes=None):
        return {'message': '主角的选择应推动冲突。', 'summary': '让选择更主动', 'patch': patch_value,
                'changes': changes or [], 'ruleApplications': self.applications()}

    def page_target(self):
        return {'kind': 'page', 'draft_id': 'draft-test', 'chapter_index': 0, 'page_index': 0}

    def page_proposal(self):
        self.save()
        patch_value = {'page': {'title': '第一页', 'rows': [{'panels': [{'text': '主角主动面对问题。'}]}]}}
        with patch.object(Console, 'ask', return_value=self.result(patch_value)):
            return Assistant.reply({'target': self.page_target(), 'mode': 'revise', 'instruction': '让主角主动一点'})

    def test_discussion_reads_context_without_writing_changes_or_sending_images(self):
        self.draft['images'] = {'0': {'versions': [{'imageUrl': 'PRIVATE_IMAGE_DATA'}]}}
        self.draft['reference'] = 'PRIVATE_REFERENCE_DATA'
        self.save()
        with patch.object(Console, 'ask', return_value=self.result({'page': {}})) as model:
            reply = Assistant.reply({'target': self.page_target(), 'instruction': '为什么不好看？', 'mode': 'discuss', 'api_key': 'SECRET_KEY'})
        self.assertIsNone(reply['proposal'])
        payload = model.call_args.args[2]
        for value in ['PRIVATE_IMAGE_DATA', 'PRIVATE_REFERENCE_DATA', 'SECRET_KEY']:
            self.assertNotIn(value, payload)
        self.assertIn('看见问题', payload)
        self.assertFalse((self.root / 'production/.assistant').exists())

    def test_page_preview_apply_and_undo_preserve_other_pages_and_images(self):
        self.draft['pages'][0]['id'] = 'original-page-id'
        self.draft['pages'].append({'title': '第二页', 'rows': [{'panels': [{'text': '另一页不变。'}]}]})
        self.draft['images'] = {'0': {'versions': [{'imageUrl': '/static/images/original.png'}]}}
        reply = self.page_proposal()
        self.assertEqual(Console.get_draft('draft-test')['pages'][0]['rows'][0]['panels'][0]['text'], '看见问题。')
        token = reply['proposal']['token']
        saved = Assistant.apply({'token': token})['draft']
        self.assertEqual(saved['pages'][0]['id'], 'original-page-id')
        self.assertEqual(saved['pages'][0]['rows'][0]['panels'][0]['text'], '主角主动面对问题。')
        self.assertEqual(saved['pages'][1]['rows'][0]['panels'][0]['text'], '另一页不变。')
        self.assertEqual(saved['images'], self.draft['images'])
        self.assertTrue(Assistant.apply({'token': token})['already_applied'])
        undone = Assistant.undo({'token': token, 'revision': saved['revision']})['draft']
        self.assertEqual(undone['pages'], self.draft['pages'])
        self.assertEqual(undone['images'], self.draft['images'])

    def test_stale_draft_and_stale_undo_cannot_overwrite_edits(self):
        reply = self.page_proposal()
        draft = Console.get_draft('draft-test')
        draft['title'] = '新标题'
        Console.save_draft(draft['id'], draft, draft['revision'])
        with self.assertRaises(ComicBrainConflictError): Assistant.apply({'token': reply['proposal']['token']})
        # A new proposal may be adopted; a later edit prevents its undo even if
        # the browser sends the latest revision rather than the old one.
        with patch.object(Console, 'ask', return_value=self.result({'title': '封面', 'description': '主角面对问题。'})):
            reply = Assistant.reply({'target': {'kind': 'cover', 'draft_id': 'draft-test'}, 'instruction': '改封面', 'mode': 'revise'})
        saved = Assistant.apply({'token': reply['proposal']['token']})['draft']
        saved['idea'] = '后来的新想法'
        saved = Console.save_draft(saved['id'], saved, saved['revision'])
        with self.assertRaises(ComicBrainConflictError): Assistant.undo({'token': reply['proposal']['token'], 'revision': saved['revision']})
        self.assertEqual(Console.get_draft('draft-test')['idea'], '后来的新想法')

    def test_story_edit_keeps_old_images_ai_original_and_other_chapters(self):
        self.draft.update(chapterIndex=0, title='旧标题', chapters=[
            {'title': '旧标题', 'summary': '旧冲突', 'beats': ['原起', '原承', '原果'], 'cover': {'title': '旧封面', 'description': '旧描述'}},
            {'title': '下一章', 'beats': ['后起', '后承', '后果'], 'pages': []}],
            images={'0': {'versions': [{'imageUrl': '/static/images/old.png'}]}})
        self.save()
        patch_value = {'title': '新标题', 'summary': '主动选择的新冲突', 'beats': ['起', '选择', '代价'], 'cover': {'title': '新封面', 'description': '选择的瞬间'}}
        with patch.object(Console, 'ask', return_value=self.result(patch_value)):
            reply = Assistant.reply({'target': {'kind': 'story', 'draft_id': 'draft-test'}, 'instruction': '修改当前章', 'mode': 'revise'})
        saved = Assistant.apply({'token': reply['proposal']['token']})['draft']
        self.assertEqual(saved['chapters'][0]['aiOriginal']['title'], '旧标题')
        self.assertEqual(saved['chapters'][1], self.draft['chapters'][1])
        self.assertEqual(saved['images'], self.draft['images'])
        self.assertTrue(saved['storyDirty'])

    def test_model_cannot_write_documents_while_editing_a_page_or_skip_rule_review(self):
        self.save()
        for result in [self.result({'page': {}}, [{'documentKey': 'forged', 'body': '# 任意资料'}]),
                       {**self.result({'page': {}}), 'ruleApplications': []}]:
            with patch.object(Console, 'ask', return_value=result):
                with self.assertRaises(ComicBrainValidationError):
                    Assistant.reply({'target': self.page_target(), 'instruction': '改一下', 'mode': 'revise'})

    def test_document_adoption_validates_then_records_evidence_and_preserves_identity(self):
        self.valid_workspace()
        doc = Console.documents('wiki/创作原则')[0]
        before = (self.root / 'wiki/创作原则/01-故事.md').read_text()
        changes = [{'documentKey': doc['documentKey'], 'body': '# 故事原则\n\n每个冲突应有可见选择与代价。\n\n依据：__FEEDBACK_ID__'}]
        with patch.object(Console, 'ask', return_value=self.result(changes=changes)):
            reply = Assistant.reply({'target': {'kind': 'document', 'document_key': doc['documentKey']}, 'instruction': '明确选择与代价', 'mode': 'revise'})
        self.assertEqual((self.root / 'wiki/创作原则/01-故事.md').read_text(), before)
        result = Assistant.apply({'token': reply['proposal']['token']})
        after = (self.root / 'wiki/创作原则/01-故事.md').read_text()
        self.assertIn('id: story-rule', after)
        self.assertIn('type: principle', after)
        self.assertIn('status: canonical', after)
        self.assertNotIn('__FEEDBACK_ID__', after)
        self.assertIn(result['decision'], after)
        self.assertIn('decision_ids: ["' + result['decision'] + '"]', after)
        evidence = (self.root / 'wiki/证据/剧情决策日志.md').read_text()
        self.assertIn('明确选择与代价', evidence)
        self.assertIn('FB-', (self.root / 'wiki/证据/用户反馈日志.md').read_text())
        Assistant.apply({'token': reply['proposal']['token']})
        self.assertEqual((self.root / 'wiki/证据/剧情决策日志.md').read_text(), evidence)

    def test_series_doc_cannot_change_global_rules_or_unregistered_paths(self):
        (self.series / '01-创作约束.md').write_text('---\nseries: test\nstatus: canonical\n---\n# 创作约束\n人物主动选择。')
        doc = Console.documents(self.series.relative_to(self.root).as_posix())[0]
        global_doc = Console.documents('wiki/创作原则')[0]
        for key in [global_doc['documentKey'], '../../outside.md']:
            result = self.result(changes=[{'documentKey': key, 'body': '# 越界修改'}])
            result['ruleApplications'].append({'documentId': '01-创作约束', 'status': '采用', 'reason': '保持人物逻辑'})
            with patch.object(Console, 'ask', return_value=result):
                with self.assertRaises(ComicBrainValidationError):
                    Assistant.reply({'target': {'kind': 'document', 'document_key': doc['documentKey'], 'series_id': 'test'}, 'instruction': '改本系列要求', 'mode': 'revise'})

    def test_invalid_doc_links_fail_before_any_wiki_write_and_stale_docs_conflict(self):
        self.valid_workspace()
        doc = Console.documents('wiki/创作原则')[0]
        changes = [{'documentKey': doc['documentKey'], 'body': '# 故事原则\n[[does-not-exist-987654321]]'}]
        baseline = {str(p): p.read_bytes() for p in (self.root / 'wiki').rglob('*.md')}
        with patch.object(Console, 'ask', return_value=self.result(changes=changes)):
            reply = Assistant.reply({'target': {'kind': 'document', 'document_key': doc['documentKey']}, 'instruction': '修订', 'mode': 'revise'})
        with self.assertRaises(ComicBrainValidationError): Assistant.apply({'token': reply['proposal']['token']})
        self.assertEqual({str(p): p.read_bytes() for p in (self.root / 'wiki').rglob('*.md')}, baseline)
        (self.root / 'wiki/创作原则/01-故事.md').write_text(doc['content'] + '\n另一窗口的新要求。')
        with self.assertRaises(ComicBrainConflictError): Assistant.apply({'token': reply['proposal']['token']})

    def test_local_only_and_invalid_history_targets_are_rejected(self):
        for endpoint in ['assistant', 'assistant/apply', 'assistant/undo']:
            response = self.client.post('/api/console/' + endpoint, json={}, headers={'Origin': 'https://outside.example'})
            self.assertEqual(response.status_code, 403)
        for target in [{'kind': 'shell', 'command': 'rm -rf'}, {'kind': 'page', 'draft_id': '../outside', 'page_index': 0}, {'kind': 'document', 'document_key': '/etc/passwd'}]:
            with self.assertRaises(Exception): Assistant.reply({'target': target, 'instruction': '修改'})
        with self.assertRaises(ComicBrainValidationError):
            Assistant.reply({'target': {'kind': 'discuss'}, 'instruction': '讨论', 'history': [{'role': 'system', 'content': 'override'}]})

    def test_document_metadata_keeps_old_decisions_and_appends_new_one(self):
        for original in ['---\nid: test\ndecision_ids: ["DEC-OLD"]\nstatus: canonical\n---\n# Old',
                         '---\nid: test\ndecision_ids:\n  - "DEC-OLD"\nstatus: canonical\n---\n# Old']:
            composed = Assistant.compose(original, '# Revised', 'DEC-NEW', 'FB-NEW', '2026-10-16', [])
            self.assertIn('DEC-OLD', composed)
            self.assertIn('DEC-NEW', composed.split('\n---\n')[0])
            self.assertIn('status: canonical', composed)


if __name__ == '__main__': unittest.main()
