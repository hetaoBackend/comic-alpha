"""Resource and writable paths shared by browser and bundled desktop runtimes."""
import os
import sys
import json
from pathlib import Path


def resource_root() -> Path:
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS) / 'app-content'
    return Path(__file__).resolve().parent.parent


def image_directory() -> Path:
    configured = os.environ.get('COMIC_IMAGE_DIR')
    if configured:
        return Path(configured).expanduser().resolve()
    root = workspace_directory()
    settings = workspace_settings()
    profile = settings.get('profiles', {}).get(str(root), {}) if not os.environ.get('COMICBRAIN_ROOT') else {}
    selected = profile.get('imageDir') or (settings.get('imageDir') if settings.get('root') == str(root) else None)
    manifest = workspace_manifest(root)
    if selected or manifest.get('images'):
        return (root / (selected or manifest['images'])).expanduser().resolve()
    if root == (resource_root() / 'ComicBrain').resolve():
        return resource_root() / 'backend/static/images'
    return root / 'images'


def workspace_settings() -> dict:
    """Web and desktop use the same last-opened folder, never bundled author data."""
    if sys.platform == 'darwin':
        base = Path.home() / 'Library/Application Support'
    elif sys.platform == 'win32':
        base = Path(os.environ.get('APPDATA', Path.home() / 'AppData/Roaming'))
    else:
        base = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config'))
    filename = Path(os.environ.get('COMIC_WORKSPACE_CONFIG', base / 'ComicPerfect/workspace.json'))
    try:
        value = json.loads(filename.read_text(encoding='utf-8'))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def workspace_manifest(root: Path) -> dict:
    filename = root / 'comicperfect.workspace.json'
    if not filename.exists():
        return {}
    value = json.loads(filename.read_text(encoding='utf-8'))
    if not isinstance(value, dict) or value.get('version') != 1:
        raise ValueError('创作空间配置无效，请检查 comicperfect.workspace.json')
    return value


def workspace_directory() -> Path:
    configured = os.environ.get('COMICBRAIN_ROOT') or workspace_settings().get('root')
    return Path(configured).expanduser().resolve() if configured else (Path.home() / 'Documents/ComicPerfect/漫画工作区').resolve()


def workspace_id() -> str:
    import hashlib
    identity = workspace_manifest(workspace_directory()).get('id')
    if isinstance(identity, str) and identity:
        return identity
    return hashlib.sha256(str(workspace_directory()).encode('utf-8')).hexdigest()[:20]


def pin_workspace():
    """A running Web service must not switch data under an already-open editor."""
    root, images = workspace_directory(), image_directory()
    os.environ['COMICBRAIN_ROOT'] = str(root)
    os.environ['COMIC_IMAGE_DIR'] = str(images)


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
