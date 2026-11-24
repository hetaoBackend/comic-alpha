"""First-install regressions use empty generated spaces, never the author's vault."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app import app
from services.console_service import ConsoleService
from desktop.workspace_seed import write_seed, initialize_workspace

ROOT = Path(__file__).resolve().parents[2]

class StoreFirstRunTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'Empty Space'
        self.root.mkdir()
        shutil.copytree(ROOT/'ComicBrain/.agents', self.root/'.agents')
        shutil.copy2(ROOT/'ComicBrain/AGENTS.md', self.root/'AGENTS.md')
        write_seed(self.root)
        self.env = patch.dict(os.environ, {'COMICBRAIN_ROOT': str(self.root), 'COMIC_STORE':'0'})
        self.env.start(); self.addCleanup(self.env.stop)

    def test_first_story_accepts_no_rule_applications_only_when_catalog_empty(self):
        result = {'title':'原创验收', 'chapters':[{'title':'纸船', 'beats':['发现漏水','主动修补','成功送信']}], 'ruleApplications':[]}
        with patch.object(ConsoleService, 'ask', return_value=result):
            self.assertTrue(ConsoleService.plan({'idea':'温和原创纸船故事'})['contextHash'])
            (self.root/'wiki/创作原则/故事.md').write_text('# 因果清晰\n')
            from services.comicbrain_project_service import ComicBrainValidationError
            with self.assertRaises(ComicBrainValidationError):
                ConsoleService.plan({'idea':'温和原创纸船故事'})

    def test_first_series_can_register_in_real_generated_index(self):
        run = subprocess.run([sys.executable, str(ROOT/'ComicBrain/.agents/skills/comic-wiki/scripts/new_series.py'), '--root', str(self.root), '--id','qa-original','--title','原创验收'], capture_output=True,text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn('qa-original', (self.root/'wiki/系列/index.md').read_text())

    def test_old_empty_index_upgrade_preserves_all_other_files(self):
        registry = self.root/'wiki/系列/index.md'
        registry.write_text(registry.read_text().replace('\n\n<!-- SERIES_ROWS -->',''))
        sentinel = self.root/'production/sentinel.json'
        sentinel.parent.mkdir(); sentinel.write_text('{"keep":true}')
        initialize_workspace(ROOT/'ComicBrain', self.root)
        self.assertIn('<!-- SERIES_ROWS -->',registry.read_text())
        self.assertEqual(sentinel.read_text(),'{"keep":true}')
        registry.write_text('# 用户自定义索引\n')
        initialize_workspace(ROOT/'ComicBrain', self.root)
        self.assertEqual(registry.read_text(),'# 用户自定义索引\n')

    def test_series_provider_auth_error_is_actionable_and_never_leaks_body(self):
        with patch.object(ConsoleService, 'ask', side_effect=ValueError('Codex credential expired or unauthorized. secret-sentinel')):
            response = app.test_client().post('/api/console/plan', json={'idea':'匿名原创'},headers={'Origin':'http://localhost'})
        self.assertEqual(response.status_code,401)
        self.assertEqual(response.get_json()['code'],'provider_auth')
        self.assertNotIn('secret-sentinel',response.get_data(as_text=True))
        self.assertIn('创作设置',response.get_json()['error'])

    def test_sdk_failures_never_expose_provider_secrets(self):
        from provider_errors import provider_error_response
        for status,code in [(401,'provider_auth'),(403,'provider_auth'),(429,'provider_quota'),(400,'provider_configuration'),(503,'provider_unavailable')]:
            error = type('APIStatusError',(Exception,),{'__module__':'openai','status_code':status})('private response sentinel')
            payload,_ = provider_error_response(error)
            self.assertEqual(payload['code'],code)
            self.assertNotIn('sentinel',json.dumps(payload))
        self.assertIsNone(provider_error_response(FileNotFoundError('local file')))

    def test_first_series_save_uses_empty_space_without_patched_registry_or_rules(self):
        from services.canon_service import CanonService
        draft={'id':'draft-first','mode':'series','seriesId':'draft-new','seriesName':'原创验收','seriesBrief':'小猫帮助邻居修纸船。','title':'纸船','pages':[{'title':'纸船','rows':[{'height':'200px','panels':[{'text':'小猫主动用树叶修补纸船，送信成功。'}]}]}], 'chapters':[], 'images':{}, 'storyDirty':False,'coverBrief':'小猫托着修好的纸船。'}
        saved=ConsoleService.save_draft(draft['id'],draft,None)
        result={'summary':'小猫修好纸船并送信。','conflicts':[],'updates':[], 'ruleApplications':[], 'learning':{'classification':'无修改','reason':'没有人工改动。'},'retrospective':'第1页第1格用主动修补展示了选择与结果。'}
        with patch.object(ConsoleService,'ask',return_value=result):
            committed=CanonService.save({'draft_id':saved['id'],'revision':saved['revision']})
        sid=committed['draft']['seriesId']
        self.assertTrue(sid.startswith('series-'))
        self.assertTrue((self.root/'production'/sid/'ch001/storyboard.json').is_file())
        self.assertIn(sid,(self.root/'wiki/系列/index.md').read_text())
