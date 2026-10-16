"""Series-scoped rendering identities. Never writes character canon or scripts."""
import base64
import hashlib
import io
import json
import re
from pathlib import Path
from PIL import Image
from runtime_paths import image_directory, generated_image_path
from workspace_lock import WorkspaceLock
from services.comicbrain_project_service import ComicBrainProjectService as Bridge, ComicBrainValidationError, ComicBrainConflictError

LOCK = WorkspaceLock('series-characters')

class SeriesCharacterService:
    @classmethod
    def config_path(cls, sid):
        if not isinstance(sid, str) or not Bridge.PROJECT_ID_PATTERN.fullmatch(sid):
            raise ComicBrainValidationError('系列标识无效')
        from services.console_service import ConsoleService
        return ConsoleService.private_path('production/.characters/' + sid + '.json')

    @staticmethod
    def publish(raw):
        # Expose a content-addressed copy, never a private workspace path.
        with Image.open(io.BytesIO(raw)) as image:
            if image.width * image.height > 40_000_000:
                raise ComicBrainValidationError('参考图尺寸过大，请缩小后上传')
            image.load()
            output = io.BytesIO()
            image.convert('RGB').save(output, format='PNG')
        data = output.getvalue()
        filename = 'character-' + hashlib.sha256(data).hexdigest() + '.png'
        directory = image_directory()
        directory.mkdir(parents=True, exist_ok=True)
        target = directory / filename
        if not target.exists():
            import os, tempfile
            fd, temporary = tempfile.mkstemp(dir=directory, prefix='.character-')
            try:
                with os.fdopen(fd, 'wb') as handle: handle.write(data)
                os.replace(temporary, target)
            finally:
                if os.path.exists(temporary): os.unlink(temporary)
        return '/static/images/' + filename

    @classmethod
    def defaults(cls, sid):
        from services.console_service import ConsoleService
        directory = ConsoleService.series_dirs().get(sid)
        if not directory or not (directory / "人物").is_dir(): return []
        exporter = ConsoleService.exporter()
        names = exporter.load_profile_names(directory)
        # Confirmed visual sources can predate their narrative character profile.
        for columns in exporter.asset_rows(directory):
            if columns[6] in exporter.CANONICAL_ASSET_STATUSES and columns[6] != 'canonical-lineup-source':
                match = re.search(r'(?:^|/)人物/(c\d{3})/', columns[2].strip('`'))
                if match: names.setdefault(match.group(1), columns[1])
        refs = exporter.load_canonical_asset_references(Bridge.comicbrain_root(), directory, names)
        result, published = [], {}
        for cid, name in names.items():
            urls = []
            for reference in refs.get(cid, []):
                file = (Bridge.comicbrain_root() / reference['path']).resolve()
                Bridge._ensure_within(file, Bridge.comicbrain_root().resolve(), '人物参考图超出创作空间')
                if file not in published: published[file] = cls.publish(file.read_bytes())
                urls.append(published[file])
            result.append({'id': cid, 'name': name, 'aliases': [name], 'references': list(dict.fromkeys(urls))})
        return result

    @classmethod
    def get(cls, sid):
        from services.console_service import atomic_json
        path = cls.config_path(sid)
        with LOCK:
            if not path.exists():
                value = {'revision': 1, 'characters': cls.defaults(sid)}
                atomic_json(path, value)
            return json.loads(path.read_text(encoding='utf-8'))

    @classmethod
    def save(cls, sid, data):
        from services.console_service import atomic_json
        path = cls.config_path(sid)
        with LOCK:
            current = cls.get(sid)
            if data.get('revision') != current['revision']:
                raise ComicBrainConflictError('人物设定已在其他窗口更新，请重新载入后再保存')
            rows = data.get('characters')
            if not isinstance(rows, list) or len(rows) > 50:
                raise ComicBrainValidationError('每个系列最多设置 50 位人物')
            clean, ids, names = [], set(), set()
            for row in rows:
                if not isinstance(row, dict): raise ComicBrainValidationError('人物设定无效')
                cid, name = row.get('id'), row.get('name')
                if not isinstance(cid, str) or not re.fullmatch(r'[\w-]{1,80}', cid) or cid in ids:
                    raise ComicBrainValidationError('人物标识无效或重复')
                if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80 or name.strip() in names:
                    raise ComicBrainValidationError('人物名字不能为空、重复或超过 80 字')
                refs = row.get('references', [])
                if not isinstance(refs, list) or len(refs) > 8:
                    raise ComicBrainValidationError('每位人物最多设置 8 张参考图')
                urls = []
                for value in refs:
                    if not isinstance(value, str): raise ComicBrainValidationError('参考图无效')
                    if value.startswith('data:image/'):
                        if len(value) > 16_000_000: raise ComicBrainValidationError('单张参考图请小于 10 MB')
                        try: raw = base64.b64decode(value.split(',', 1)[1], validate=True); url = cls.publish(raw)
                        except Exception as error: raise ComicBrainValidationError('无法读取参考图，请上传 PNG、JPG 或 WebP 图片') from error
                    else:
                        try:
                            file = generated_image_path(value)
                            if not file.is_file(): raise ValueError()
                            url = '/static/images/' + file.name
                        except ValueError as error: raise ComicBrainValidationError('参考图不存在，请重新上传') from error
                    urls.append(url)
                previous = next((c for c in current['characters'] if c['id'] == cid), {})
                aliases = list(dict.fromkeys([name.strip(), *previous.get('aliases', []), previous.get('name', name.strip())]))
                clean.append({'id':cid, 'name':name.strip(), 'aliases':aliases, 'references':list(dict.fromkeys(urls))})
                ids.add(cid); names.add(name.strip())
            result = {'revision':current['revision'] + 1, 'characters':clean}
            atomic_json(path, result)
            return result

    @classmethod
    def references(cls, sid, selection=None):
        text = json.dumps(selection, ensure_ascii=False).lower() if selection is not None else None
        labels = {}
        for c in cls.get(sid)['characters']:
            if text is not None and not any(alias.lower() in text for alias in c['aliases']): continue
            for url in c['references']:
                file = generated_image_path(url)
                if not file.is_file(): raise ComicBrainValidationError('人物参考图缺失，请在人物设定中重新上传：' + c['name'])
                labels.setdefault(str(file), []).append(c['name'])
        return [('、'.join(dict.fromkeys(names)), file) for file, names in labels.items()]
