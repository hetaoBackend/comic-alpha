"""Exercise the real desktop process without calling paid generation providers."""
import json
import os
import selectors
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from runtime_paths import generated_image_path, image_directory
from unittest.mock import patch


class DesktopRuntimeTest(unittest.TestCase):
    def test_mime_types_work_without_access_to_host_configuration(self):
        import builtins
        import mimetypes
        from desktop.server import initialize_mime_types
        original_open = builtins.open
        def sandbox_open(filename, *args, **kwargs):
            if str(filename).startswith('/etc/'):
                raise PermissionError('App Sandbox')
            return original_open(filename, *args, **kwargs)
        with patch.object(mimetypes, 'knownfiles', ['/etc/apache2/mime.types']), patch('builtins.open', sandbox_open):
            initialize_mime_types()
            self.assertEqual(mimetypes.guess_type('index.html')[0], 'text/html')
            self.assertEqual(mimetypes.guess_type('page.png')[0], 'image/png')
            self.assertTrue(mimetypes.guess_type('app.js')[0].endswith('javascript'))

    def test_image_paths_use_writable_directory_and_reject_traversal(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'COMIC_IMAGE_DIR': directory}):
            self.assertEqual(image_directory(), Path(directory).resolve())
            self.assertEqual(generated_image_path('/backend/static/images/page.png'), Path(directory).resolve() / 'page.png')
            for value in ['/backend/static/images/../secret', '/static/images/%2e%2e%2fsecret', '/etc/passwd']:
                with self.assertRaises(ValueError):
                    generated_image_path(value)

    def test_pipe_runtime_has_no_bind_or_listen_and_preserves_private_boundary(self):
        import base64
        with tempfile.TemporaryDirectory() as directory:
            image_dir = Path(directory) / 'images'
            image_dir.mkdir()
            (image_dir / 'smoke.png').write_bytes(bytes([0, 255, 13, 10]))
            env = {**os.environ, 'COMIC_IMAGE_DIR': str(image_dir),
                   'COMICBRAIN_ROOT': str(Path(directory) / 'ComicBrain')}
            # Fail the real source process if any code attempts to bind/listen.
            guard = "import socket,runpy,sys; sys.path[:0]=[sys.argv[2],sys.argv[3]]; fail=lambda *a,**k: (_ for _ in ()).throw(AssertionError('desktop opened a listening socket')); socket.socket.bind=fail; socket.socket.listen=fail; entry=sys.argv[1]; sys.argv=[entry]; runpy.run_path(entry,run_name='__main__')"
            executable = os.environ.get('COMIC_TEST_SERVER_EXECUTABLE')
            command = [executable] if executable else [sys.executable, '-c', guard, str(ROOT / 'desktop/server.py'), str(ROOT), str(ROOT / 'backend')]
            with tempfile.TemporaryFile(mode='w+') as errors:
                process = subprocess.Popen(command, env=env, cwd=directory, stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE, stderr=errors, text=True)
                try:
                    selector = selectors.DefaultSelector()
                    selector.register(process.stdout, selectors.EVENT_READ)
                    self.assertTrue(selector.select(45), 'Desktop pipe did not start')
                    line = process.stdout.readline()
                    selector.close()
                    errors.seek(0)
                    self.assertEqual(line.strip(), 'COMIC_DESKTOP_READY {"url":"comicperfect://app/"}', errors.read())
                    def request(target, method='GET', body=b'', origin='comicperfect://app'):
                        message = {'id': target, 'path': target, 'method': method,
                            'headers': [['Origin', origin], ['Content-Type', 'application/json']],
                            'body': base64.b64encode(body).decode()}
                        process.stdin.write(json.dumps(message) + '\n'); process.stdin.flush()
                        line = process.stdout.readline()
                        self.assertTrue(line.startswith('COMIC_DESKTOP_RESPONSE '), line)
                        result = json.loads(line.split(' ', 1)[1])
                        self.assertEqual(result['id'], target)
                        return result['status'], dict(result['headers']), base64.b64decode(result['body'])
                    status, _, page = request('/')
                    self.assertEqual(status, 200); self.assertIn(b'ComicPerfect', page)
                    status, headers, script = request('/runtime-config.js')
                    self.assertEqual(headers['Cache-Control'], 'no-store')
                    self.assertIn(b'comicperfect://app/api', script)
                    self.assertEqual(request('/api/health')[0], 200)
                    for prefix in ['/backend/static/images/', '/static/images/']:
                        self.assertEqual(request(prefix + 'smoke.png')[2], bytes([0,255,13,10]))
                    for target in ['/ComicBrain/AGENTS.md', '/.env', '/desktop/main.cjs', '/backend/app.py', '/frontend/%2e%2e/ComicBrain/AGENTS.md']:
                        self.assertEqual(request(target)[0], 404)
                    self.assertEqual(request('/api/console/workspace', origin='https://outside.example')[0], 403)
                    self.assertEqual(request('/api/console/workspace', origin='null')[0], 403)
                    self.assertEqual(request('/api/health', method='HEAD')[2], b'')
                    if executable:
                        workspace = Path(env['COMICBRAIN_ROOT'])
                        checked = subprocess.run([executable, str(workspace / '.agents/skills/comic-wiki/scripts/check_wiki.py'), '--root', str(workspace)], env=env, capture_output=True, text=True, timeout=30)
                        self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
                finally:
                    process.terminate()
                    process.wait(timeout=8)
                    process.stdout.close(); process.stdin.close()
                self.assertEqual(process.returncode, 0)


if __name__ == '__main__':
    unittest.main()
