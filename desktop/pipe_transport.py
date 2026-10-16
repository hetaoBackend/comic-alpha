"""Inherited stdin/stdout transport. No socket is created by the desktop host."""
import base64
import json
import mimetypes
import signal
import sys
import threading
from urllib.parse import urlsplit

MAX_FRAME = 128 * 1024 * 1024


def dispatch(app, message):
    from serve_frontend import resolve_public_file
    from runtime_paths import workspace_id
    target = message['path']
    parsed = urlsplit(target)
    if parsed.scheme or parsed.netloc or not target.startswith('/') or '\x00' in target:
        raise ValueError('Invalid desktop path')
    method = message['method'].upper()
    if method not in {'GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'}:
        raise ValueError('Invalid desktop method')
    headers = message.get('headers', [])
    origin = next((value for name, value in headers if name.lower() == 'origin'), None)
    if origin not in (None, 'comicperfect://app'):
        return 403, [('Content-Type', 'text/plain')], b'Untrusted origin'
    body = base64.b64decode(message.get('body', ''), validate=True)
    if parsed.path.startswith('/api/'):
        # Invoke the same WSGI application directly, without an HTTP server.
        with app.test_client() as client:
            response = client.open(target, method=method, headers=headers, data=body,
                base_url='http://desktop.invalid', environ_overrides={
                    'REMOTE_ADDR': '127.0.0.1', 'comic.desktop_ipc': True})
            try:
                return response.status_code, list(response.headers), response.get_data()
            finally:
                response.close()
    if method not in {'GET', 'HEAD'}:
        return 405, [], b''
    if parsed.path == '/runtime-config.js':
        config = {'apiBaseUrl': 'comicperfect://app/api', 'workspaceId': workspace_id()}
        data = ('window.COMIC_RUNTIME = Object.freeze(' + json.dumps(config).replace('<', '\\u003c') + ');').encode()
        return 200, [('Content-Type', 'application/javascript; charset=utf-8'), ('Cache-Control', 'no-store')], data
    file = resolve_public_file(target)
    if file is None:
        return 404, [('Content-Type', 'text/plain')], b'Not found'
    data = b'' if method == 'HEAD' else file.read_bytes()
    return 200, [('Content-Type', mimetypes.guess_type(str(file))[0] or 'application/octet-stream'),
                 ('Cache-Control', 'no-cache')], data


def run_pipe(app):
    output = sys.stdout
    # Provider and library prints are diagnostics, never protocol frames.
    sys.stdout = sys.stderr
    write_lock = threading.Lock()
    slots = threading.BoundedSemaphore(16)

    def write(value):
        with write_lock:
            output.write('COMIC_DESKTOP_RESPONSE ' + json.dumps(value, separators=(',', ':')) + '\n')
            output.flush()

    def handle(message):
        try:
            try:
                status, headers, body = dispatch(app, message)
            except Exception:
                app.logger.exception('Desktop request failed')
                status, headers, body = 500, [('Content-Type', 'application/json')], b'{"error":"Desktop request failed"}'
            write({'id': message['id'], 'status': status, 'headers': headers,
                   'body': base64.b64encode(body).decode('ascii')})
        finally:
            slots.release()

    def stop(*_):
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    output.write('COMIC_DESKTOP_READY {"url":"comicperfect://app/"}\n')
    output.flush()
    while True:
        line = sys.stdin.buffer.readline(MAX_FRAME + 1)
        if not line:
            return
        if len(line) > MAX_FRAME:
            raise ValueError('Desktop frame too large')
        message = json.loads(line)
        if not isinstance(message.get('id'), str) or len(message['id']) > 64:
            raise ValueError('Invalid desktop request ID')
        slots.acquire()
        threading.Thread(target=handle, args=(message,), daemon=True).start()
