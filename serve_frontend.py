#!/usr/bin/env python3
"""Serve only comic-alpha's public browser assets on localhost."""

from __future__ import annotations

import os
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlsplit
from backend.runtime_paths import resource_root, image_directory, workspace_id


REPOSITORY_ROOT = resource_root()
GENERATED_IMAGE_ROOT = image_directory()
PUBLIC_INDEX = (REPOSITORY_ROOT / "index.html").resolve()
PUBLIC_DIRECTORIES = tuple(
    path.resolve()
    for path in (
        REPOSITORY_ROOT / "frontend",
        REPOSITORY_ROOT / "assets",
        GENERATED_IMAGE_ROOT,
    )
)


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def resolve_public_file(request_target: str) -> Optional[Path]:
    """Resolve an HTTP target only when it belongs to the public allowlist."""
    request_path = unquote(urlsplit(request_target).path)
    if "\x00" in request_path:
        return None
    for prefix in ('/backend/static/images/', '/static/images/'):
        if request_path.startswith(prefix):
            filename = request_path[len(prefix):]
            candidate = (GENERATED_IMAGE_ROOT / filename).resolve()
            if filename and Path(filename).name == filename and candidate.parent == GENERATED_IMAGE_ROOT and candidate.is_file():
                return candidate
            return None
    if request_path in {"", "/"}:
        candidate = PUBLIC_INDEX
    else:
        candidate = (REPOSITORY_ROOT / request_path.lstrip("/")).resolve()

    if candidate == PUBLIC_INDEX and candidate.is_file():
        return candidate
    if candidate.is_file() and any(
        _is_within(candidate, public_root)
        for public_root in PUBLIC_DIRECTORIES
    ):
        return candidate
    return None


class PublicOnlyRequestHandler(SimpleHTTPRequestHandler):
    """Static handler that cannot traverse into ComicBrain or repository files."""

    def send_head(self):
        if urlsplit(self.path).path == '/runtime-config.js':
            from io import BytesIO
            api_url = getattr(self.server, 'api_base_url', None) or os.environ.get('COMIC_API_BASE_URL', 'http://localhost:5003/api')
            body = ('window.COMIC_RUNTIME = Object.freeze(' + json.dumps({'apiBaseUrl': api_url, 'workspaceId': workspace_id()}).replace('<', '\\u003c') + ');').encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            return BytesIO(body)
        public_file = resolve_public_file(self.path)
        if public_file is None:
            self.send_error(404, "Not found")
            return

        try:
            handle = public_file.open('rb')
        except OSError:
            self.send_error(404, 'Not found')
            return None
        self.send_response(200)
        self.send_header('Content-Type', self.guess_type(str(public_file)))
        self.send_header('Content-Length', str(os.fstat(handle.fileno()).st_size))
        self.send_header('Last-Modified', self.date_time_string(os.fstat(handle.fileno()).st_mtime))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        return handle

    def list_directory(self, path: str):
        self.send_error(404, "Not found")
        return None


def create_server(port: int = 8000, api_base_url: Optional[str] = None):
    handler = partial(
        PublicOnlyRequestHandler,
        directory=str(REPOSITORY_ROOT),
    )
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    server.api_base_url = api_base_url
    return server


def main() -> None:
    port = int(os.environ.get("FRONTEND_PORT", "8000"))
    server = create_server(port)
    print(f"Frontend available at http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
