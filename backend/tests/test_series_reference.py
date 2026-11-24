"""Long-term reference settings use isolated workspaces, never the creator's data."""
import copy
import json
import unittest
from unittest.mock import patch
import test_console as fixtures
from services.console_service import ConsoleService as Console
from services.series_reference_service import SeriesReferenceService as Reference
from services.comicbrain_project_service import ComicBrainConflictError, ComicBrainValidationError


class ReferenceTest(unittest.TestCase):
    setUp = fixtures.ConsoleTest.setUp
    tearDown = fixtures.ConsoleTest.tearDown
    valid_workspace = fixtures.ConsoleTest.valid_workspace

    def config(self, **changes):
        return {'work': '家有儿女', 'mode': 'plot', 'brief': '亲子日常、代际误会、温暖收尾', **changes}

    def test_setting_survives_reload_replaces_legacy_and_preserves_other_preferences(self):
        fixtures.ConsoleTest.reference_preference(self)
        path = self.series/'05-系列偏好.md'
        path.write_text('---\nid: test-prefs\ntype: preference-list\nstatus: canonical\nseries: test\nupdated: "2026-10-18"\ndecision_ids: []\n---\n' + path.read_text() + '\n## 其他要求\n每页两行。\n')
        initial = Reference.get('test')
        self.assertEqual(initial['work'], '武林外传')
        saved = Reference.save('test', {**self.config(), 'revision': initial['revision']})
        self.assertEqual(Reference.get('test'), saved)
        self.assertIn('每页两行', path.read_text())
        self.assertIn('rejected', path.read_text())
        self.assertIn('家有儿女', (self.root/'wiki/证据/剧情决策日志.md').read_text())
        requirements = Console.inspiration_requirements(Console.context('test'))
        self.assertEqual(requirements[0]['works'], ['家有儿女'])
        self.assertTrue(requirements[0]['specificScene'])
        with self.assertRaises(ComicBrainConflictError): Reference.save('test', {**self.config(), 'revision': initial['revision']})
        disabled = Reference.save('test', {**self.config(work=''), 'revision': saved['revision']})
        self.assertEqual(disabled['work'], '')
        self.assertEqual(Console.inspiration_requirements(Console.context('test')), [])

    def test_first_draft_planning_and_later_series_planning_share_requirements(self):
        result = fixtures.ConsoleTest.reference_plan(self)
        result['chapters'][0]['inspiration']['work'] = '家有儿女'
        result['ruleApplications'] = result['ruleApplications'][:1]
        with patch.object(Console, 'ask', return_value=result) as model:
            Console.plan({'series_id':'draft-new', 'idea':'家庭日常', 'series_reference':self.config()})
        self.assertEqual(json.loads(model.call_args.args[2])['required_inspirations'][0]['works'], ['家有儿女'])
        result['chapters'][0]['inspiration']['sourceStatus'] = '机制启发'
        with patch.object(Console, 'ask', return_value=result):
            with self.assertRaises(ComicBrainValidationError):
                Console.plan({'series_id':'draft-new', 'idea':'家庭日常', 'series_reference':self.config()})
        # Tone mode deliberately allows an original story with mechanism attribution.
        with patch.object(Console, 'ask', return_value=result):
            Console.plan({'series_id':'draft-new', 'idea':'家庭日常', 'series_reference':self.config(mode='tone')})

    def test_episode_override_and_other_series_do_not_change_saved_default(self):
        initial = Reference.get('test')
        Reference.save('test', {**self.config(), 'revision':initial['revision']})
        before = (self.series/'05-系列偏好.md').read_bytes()
        requirements = Console.inspiration_requirements(Console.context('test'), '参考《武林外传》')
        self.assertEqual(requirements[0]['works'], ['武林外传'])
        self.assertEqual((self.series/'05-系列偏好.md').read_bytes(), before)
        self.assertEqual(Console.inspiration_requirements(Console.context()), [])
        self.assertEqual(Reference.get('test')['work'], '家有儿女')

    def test_settings_endpoint_is_local_scoped_and_validated(self):
        endpoint = '/api/console/series/test/reference'
        self.assertEqual(self.client.put(endpoint, json=self.config(), headers={'Origin':'https://outside.example'}).status_code, 403)
        initial = self.client.get(endpoint, headers=self.headers).get_json()
        response = self.client.put(endpoint, json={**self.config(), 'revision': initial['revision']}, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.get_json())
        for bad in [{'work':[]}, self.config(mode='unknown'), self.config(work='x'*201)]:
            with self.assertRaises(ComicBrainValidationError): Reference.clean(bad)
        workspace = Console.workspace()
        self.assertEqual(workspace['series'][0]['referenceSettings']['work'], '家有儿女')
