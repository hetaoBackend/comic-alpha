import base64
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import app
from services.series_character_service import SeriesCharacterService as Characters
from services.comicbrain_project_service import ComicBrainValidationError, ComicBrainConflictError

class SeriesCharactersTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.env = patch.dict(os.environ, {'COMICBRAIN_ROOT': str(self.root), 'COMIC_IMAGE_DIR': str(self.root/'images')})
        self.env.start()
        image = io.BytesIO()
        Image.new('RGB', (8, 12), 'green').save(image, 'PNG')
        self.raw = image.getvalue()
        self.url = 'data:image/png;base64,' + base64.b64encode(self.raw).decode()
    def tearDown(self):
        self.env.stop(); self.temp.cleanup()
    def test_series_isolation_upload_reload_matching_and_conflict(self):
        initial = Characters.get('alpha')
        data = {'revision': initial['revision'], 'characters': [{'id':'c001', 'name':'小云', 'references':[self.url]}]}
        saved = Characters.save('alpha', data)
        self.assertEqual(Characters.get('beta')['characters'], [])
        self.assertEqual(Characters.get('alpha'), saved)
        refs = Characters.references('alpha', {'text':'小云走进教室'})
        self.assertEqual(len(refs), 1)
        self.assertTrue(Path(refs[0][1]).is_file())
        self.assertEqual(Characters.references('alpha', '另一位人物'), [])
        with self.assertRaises(ComicBrainConflictError): Characters.save('alpha', data)
        saved['characters'][0]['name'] = '新小云'
        renamed = Characters.save('alpha', saved)
        self.assertEqual(Characters.references('alpha', '小云出现')[0][0], '新小云')
        self.assertFalse((self.root/'wiki').exists())
    def test_invalid_images_and_unsafe_paths_are_rejected(self):
        for ref in ['data:image/png;base64,YmFk', '/static/images/../secret.png', 'https://example.com/image.png']:
            with self.assertRaises(ComicBrainValidationError):
                Characters.save('alpha', {'revision':1,'characters':[{'id':'c001','name':'小云','references':[ref]}]})
        with self.assertRaises(ComicBrainValidationError): Characters.get('../secret')
    def test_local_api_and_shared_lineup_labels(self):
        client = app.test_client()
        path = '/api/console/series/alpha/characters'
        self.assertEqual(client.get(path, headers={'Origin':'https://evil.example'}).status_code,403)
        initial=client.get(path,headers={'Origin':'comicperfect://app'}, environ_overrides={'comic.desktop_ipc':True}).get_json()
        rows=[{'id':'c001','name':'小云','references':[self.url]}, {'id':'c002','name':'小满','references':[self.url]}]
        Characters.save('alpha', {**initial,'characters':rows})
        refs=Characters.references('alpha','小云与小满同框')
        self.assertEqual(len(refs),1)
        self.assertEqual(refs[0][0],'小云、小满')

    def test_draft_and_imported_page_generation_use_saved_series_references(self):
        Characters.save('alpha', {'revision':1,'characters':[{'id':'c001','name':'小云','references':[self.url]}]})
        from services.console_service import ConsoleService
        from controllers.image_controller import _load_comicbrain_image_context
        draft={'id':'draft-alpha','seriesId':'alpha','mode':'series','pages':[], 'title':'测试'}
        with patch.object(ConsoleService, 'get_draft', return_value=draft):
            refs, project=ConsoleService.image_context('draft-alpha', {'text':'小云出现'})
        self.assertEqual(refs[0][0],'小云')
        with app.test_request_context('/api/generate-image', environ_base={'REMOTE_ADDR':'127.0.0.1'}), patch('controllers.image_controller.is_trusted_local_request', return_value=True), patch('controllers.image_controller.ComicBrainProjectService.get_project', return_value={}), patch('controllers.image_controller.ComicBrainProjectService.require_matching_revision'), patch('controllers.image_controller.ComicBrainProjectService.resolve_character_references', return_value=[]):
            refs, project, error=_load_comicbrain_image_context({'comicbrain_source':{'series_id':'alpha','chapter_id':'ch001'}}, {'text':'小云出现'})
        self.assertIsNone(error)
        self.assertEqual(refs[0][0],'小云')
