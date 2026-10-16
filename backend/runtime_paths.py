"""Resource and writable paths shared by browser and bundled desktop runtimes."""
import os
import sys
from pathlib import Path


def resource_root() -> Path:
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS) / 'app-content'
    return Path(__file__).resolve().parent.parent


def image_directory() -> Path:
    configured = os.environ.get('COMIC_IMAGE_DIR')
    return Path(configured).expanduser().resolve() if configured else resource_root() / 'backend/static/images'


def workspace_directory() -> Path:
    configured = os.environ.get('COMICBRAIN_ROOT')
    return Path(configured).expanduser().resolve() if configured else resource_root() / 'ComicBrain'


def workspace_id() -> str:
    import hashlib
    return hashlib.sha256(str(workspace_directory()).encode('utf-8')).hexdigest()[:20]


def generated_image_path(url: str) -> Path:
    """Resolve only a generated filename, never an arbitrary local path."""
    from urllib.parse import unquote, urlsplit
    path = unquote(urlsplit(url).path)
    for prefix in ('/backend/static/images/', '/static/images/'):
        if path.startswith(prefix):
            filename = path[len(prefix):]
            candidate = (image_directory() / filename).resolve()
            if filename and Path(filename).name == filename and candidate.parent == image_directory().resolve():
                return candidate
    raise ValueError('Invalid generated image URL')
