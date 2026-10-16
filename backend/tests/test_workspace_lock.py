import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from services.console_service import ConsoleService


class WorkspaceConcurrencyTest(unittest.TestCase):
    def test_web_and_desktop_cannot_both_commit_the_same_draft_revision(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'COMICBRAIN_ROOT': directory}):
            initial = ConsoleService.save_draft('concurrent-test', {'id': 'concurrent-test', 'mode': 'single'}, None)
            code = '''
import sys
from services.console_service import ConsoleService
from services.comicbrain_project_service import ComicBrainConflictError
print('ready', flush=True)
sys.stdin.readline()
try:
    ConsoleService.save_draft('concurrent-test', {'id': 'concurrent-test', 'mode': 'single', 'title': sys.argv[2]}, sys.argv[1])
    print('saved', flush=True)
except ComicBrainConflictError:
    print('conflict', flush=True)
'''
            env = {**os.environ, 'PYTHONPATH': str(BACKEND)}
            children = [subprocess.Popen([sys.executable, '-c', code, initial['revision'], name], env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for name in ('web', 'desktop')]
            try:
                for child in children:
                    self.assertEqual(child.stdout.readline().strip(), 'ready')
                for child in children:
                    child.stdin.write('\n')
                    child.stdin.flush()
                outputs = [child.communicate(timeout=30)[0].strip() for child in children]
                self.assertCountEqual(outputs, ['saved', 'conflict'])
                self.assertIn(ConsoleService.get_draft('concurrent-test')['title'], ['web', 'desktop'])
            finally:
                for child in children:
                    if child.poll() is None:
                        child.kill()
                    child.wait()


if __name__ == '__main__':
    unittest.main()
