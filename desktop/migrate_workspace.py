"""Relocate an existing workspace, verifying the copy before changing its pointer.

The original remains a recovery copy. This tool never rewrites comic content.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path


def fingerprint(filename):
    value = hashlib.sha256()
    with filename.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            value.update(chunk)
    return value.digest()


def migrate_workspace(source, destination, images, settings_file):
    source, destination, images = (Path(p).expanduser().resolve() for p in (source, destination, images))
    if destination.exists() or source in destination.parents or destination in source.parents:
        raise ValueError('迁移目标必须是尚不存在的独立文件夹。')
    if not (source / 'wiki/index.md').is_file() or not images.is_dir():
        raise ValueError('原工作区或图片目录不完整。')
    trees = [(source, destination)]
    if images != source / 'images':
        if (source / 'images').exists():
            raise ValueError('工作区已有图片目录，请先核对图片来源。')
        trees.append((images, destination / 'images'))
    for original, target in trees:
        if any(p.is_symlink() for p in original.rglob('*')):
            raise ValueError('工作区包含符号链接，请先确认链接资源再迁移。')
    settings_file = Path(settings_file)
    settings = json.loads(settings_file.read_text()) if settings_file.exists() else {}
    for original, target in trees:
        shutil.copytree(original, target)
        for filename in original.rglob('*'):
            if filename.is_file() and fingerprint(filename) != fingerprint(target / filename.relative_to(original)):
                raise ValueError(f'迁移校验失败：{filename.name}；原数据未改动。')
    manifest_file = destination / 'comicperfect.workspace.json'
    manifest = json.loads(manifest_file.read_text()) if manifest_file.exists() else {}
    manifest.update(version=1, id=manifest.get('id') or hashlib.sha256(str(source).encode()).hexdigest()[:20],
                    name=destination.name, images='images')
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    old, new = str(source), str(destination)
    settings.update(root=new, recentRoots=[new, *[p for p in settings.get('recentRoots', []) if p not in (old, new)]])
    settings['profiles'] = {**settings.get('profiles', {}), new: {'imageDir': str(destination / 'images')}}
    if old in settings.get('routes', {}):
        settings['routes'][new] = settings['routes'][old]
    settings_file.parent.mkdir(parents=True, exist_ok=True)
    if settings_file.exists():
        shutil.copy2(settings_file, settings_file.with_suffix('.json.before-migration'))
    temporary = settings_file.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(settings, ensure_ascii=False, indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(settings_file)
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('source', 'destination', 'images', 'settings'):
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    print(migrate_workspace(args.source, args.destination, args.images, args.settings))
