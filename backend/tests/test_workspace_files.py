import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / 'backend')]
from desktop.migrate_workspace import migrate_workspace
from runtime_paths import workspace_directory, workspace_id, image_directory, pin_workspace


class WorkspaceFilesTest(unittest.TestCase):
    def test_running_services_keep_their_folder_when_desktop_default_changes(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary).resolve()
            settings = base / 'workspace.json'
            settings.write_text(json.dumps({'root': str(base / 'first')}))
            with patch.dict(os.environ, {'COMIC_WORKSPACE_CONFIG': str(settings), 'COMICBRAIN_ROOT': '', 'COMIC_IMAGE_DIR': ''}):
                pin_workspace()
                settings.write_text(json.dumps({'root': str(base / 'second')}))
                self.assertEqual(workspace_directory(), base / 'first')
                self.assertEqual(image_directory(), base / 'first/images')

    def test_migration_preserves_drafts_images_and_cache_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary).resolve()
            source, images, target = (base / p for p in ['old', 'old-images', '桌面工作区'])
            (source / 'wiki').mkdir(parents=True)
            (source / 'wiki/index.md').write_text('# 创作资料')
            (source / 'production').mkdir()
            (source / 'production/draft.json').write_text('{"id":"draft-original"}')
            images.mkdir()
            (images / 'page.png').write_bytes(b'original image')
            settings = base / 'workspace.json'
            settings.write_text(json.dumps({'root': str(source), 'routes': {str(source): '#draft/original'}}))
            old_id = hashlib.sha256(str(source).encode()).hexdigest()[:20]
            migrate_workspace(source, target, images, settings)
            with patch.dict(os.environ, {'COMIC_WORKSPACE_CONFIG': str(settings), 'COMICBRAIN_ROOT': '', 'COMIC_IMAGE_DIR': ''}):
                self.assertEqual(workspace_directory(), target)
                self.assertEqual(workspace_id(), old_id)
                self.assertEqual(image_directory(), target / 'images')
            self.assertEqual((target / 'production/draft.json').read_bytes(), (source / 'production/draft.json').read_bytes())
            self.assertEqual((target / 'images/page.png').read_bytes(), b'original image')
            self.assertEqual(json.loads(settings.read_text())['routes'][str(target)], '#draft/original')
            self.assertTrue(source.exists())
            self.assertTrue(settings.with_suffix('.json.before-migration').exists())
            with self.assertRaises(ValueError):
                migrate_workspace(source, target, images, settings)

    def test_moving_a_folder_preserves_identity_and_resolves_relative_images(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve() / 'first'
            root.mkdir()
            (root / 'comicperfect.workspace.json').write_text(json.dumps({'version': 1, 'id': 'stable-id', 'images': 'images'}))
            target = root.rename(root.with_name('renamed'))
            with patch.dict(os.environ, {'COMICBRAIN_ROOT': str(target), 'COMIC_IMAGE_DIR': ''}):
                self.assertEqual(workspace_id(), 'stable-id')
                self.assertEqual(image_directory(), target / 'images')

