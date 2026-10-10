#!/usr/bin/env python3
"""Serve only comic-alpha's public browser assets on localhost."""

from __future__ import annotations

import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import quote, unquote, urlsplit


REPOSITORY_ROOT = Path(__file__).resolve().parent
PUBLIC_INDEX = (REPOSITORY_ROOT / "index.html").resolve()
PUBLIC_DIRECTORIES = tuple(
    path.resolve()
    for path in (
        REPOSITORY_ROOT / "frontend",
        REPOSITORY_ROOT / "assets",
        REPOSITORY_ROOT / "backend" / "static" / "images",
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

    def _serve_public_file(self, head_only: bool) -> None:
        public_file = resolve_public_file(self.path)
        if public_file is None:
            self.send_error(404, "Not found")
            return

        original_path = self.path
        relative_path = public_file.relative_to(REPOSITORY_ROOT).as_posix()
        self.path = "/" + quote(relative_path, safe="/")
        try:
            if head_only:
                super().do_HEAD()
            else:
                super().do_GET()
        finally:
            self.path = original_path

    def do_GET(self) -> None:
        self._serve_public_file(head_only=False)

    def do_HEAD(self) -> None:
        self._serve_public_file(head_only=True)

    def list_directory(self, path: str):
        self.send_error(404, "Not found")
        return None


def main() -> None:
    port = int(os.environ.get("FRONTEND_PORT", "8000"))
    handler = partial(
        PublicOnlyRequestHandler,
        directory=str(REPOSITORY_ROOT),
    )
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"Frontend available at http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
