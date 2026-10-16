"""Desktop service entry point, also frozen as a standalone Python runtime."""
from __future__ import annotations

import mimetypes
import os
import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if not getattr(sys, 'frozen', False):
    sys.path[:0] = [str(ROOT / 'backend'), str(ROOT)]


def initialize_mime_types():
    # App Sandbox does not grant /etc/apache2/mime.types. Python's built-in
    # mappings cover our public assets without reading host configuration.
    mimetypes.knownfiles = []
    mimetypes.init(files=[])


def main():
    initialize_mime_types()
    # Canon/continuity services launch their workspace scripts with sys.executable.
    # A frozen runtime must retain this behavior without requiring system Python.
    if len(sys.argv) > 1 and sys.argv[1].endswith('.py'):
        script = Path(sys.argv[1]).resolve()
        # Continuity checks also run inside a staged temporary workspace.
        allowed = {'check_wiki.py', 'new_series.py', 'export_comic_alpha.py'}
        if script.name not in allowed or '.agents/skills/comic-wiki/scripts' not in script.as_posix():
            raise ValueError('Unsupported workspace script')
        if os.environ.get('COMIC_STORE') == '1':
            # Workspace files are user data, never executable updates to the
            # store app. Run the signed copy with the caller's --root argument.
            from runtime_paths import resource_root
            script = resource_root() / 'ComicBrain/.agents/skills/comic-wiki/scripts' / script.name
            if '--root' not in sys.argv[2:]:
                raise ValueError('Store tools require an explicit data workspace')
        sys.argv = sys.argv[1:]
        sys.argv[0] = str(script)
        runpy.run_path(str(script), run_name='__main__')
        return

    if getattr(sys, 'frozen', False):
        from runtime_paths import resource_root
        from workspace_seed import initialize_workspace
        initialize_workspace(resource_root() / 'ComicBrain', Path(os.environ['COMICBRAIN_ROOT']))

    from app import app
    from runtime_paths import image_directory
    from desktop.pipe_transport import run_pipe

    image_directory().mkdir(parents=True, exist_ok=True)
    run_pipe(app)


if __name__ == '__main__':
    main()
