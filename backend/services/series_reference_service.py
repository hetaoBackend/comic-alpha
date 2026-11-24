"""A creator-owned reference brief, stored with the series preferences."""
import json
import re
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from services.console_service import ConsoleService as Console, LOCK, digest, metadata, now
from services.comicbrain_project_service import ComicBrainConflictError, ComicBrainNotFoundError, ComicBrainValidationError


class SeriesReferenceService:
    @staticmethod
    def clean(value):
        if not isinstance(value, dict):
            raise ComicBrainValidationError('请填写有效的系列长期参考')
        result = {}
        for key, limit in [('work', 200), ('brief', 4000)]:
            text = value.get(key, '')
            if not isinstance(text, str) or len(text) > limit:
                raise ComicBrainValidationError(f'系列长期参考的{key}应为最多 {limit} 字的文字')
            result[key] = text.strip()
        result['work'] = result['work'].strip('《》').strip()
        result['mode'] = value.get('mode', 'plot')
        if not isinstance(result['mode'], str) or result['mode'] not in {'plot', 'tone'}:
            raise ComicBrainValidationError('请选择参考基调或每话改编具体剧情')
        from services.reference_scene_service import ReferenceSceneService
        storyline = value.get('storyline', [])
        if not isinstance(storyline, list) or len(storyline) > 24:
            raise ComicBrainValidationError('系列脉络最多保留 24 个片段')
        if storyline and not result['work']:
            raise ComicBrainValidationError('请先填写系列脉络的参考作品')
        result['storyline'] = [ReferenceSceneService.clean_scene(scene, result['work']) for scene in storyline]
        if len({s['id'] for s in result['storyline']}) != len(result['storyline']):
            raise ComicBrainValidationError('系列脉络包含重复片段，请移除重复项')
        return result

    @classmethod
    def from_document(cls, text):
        header = re.match(r'\A---\n(.*?)\n---', text, re.S)
        match = re.search(r'^series_reference: (.+)$', header.group(1), re.M) if header else None
        if match:
            try:
                return cls.clean(json.loads(match.group(1)))
            except (ValueError, TypeError) as error:
                raise ComicBrainValidationError('系列长期参考资料无法读取，请检查系列偏好') from error
        return None

    @classmethod
    def get(cls, sid):
        directory = Console.series_dirs().get(sid)
        if not directory:
            raise ComicBrainNotFoundError('没有找到这个系列')
        path = Console.private_path((directory/'05-系列偏好.md').relative_to(Console.private_path('')).as_posix())
        text = path.read_text(encoding='utf-8') if path.exists() else ''
        value = cls.from_document(text)
        if value is None:
            inherited = Console.inspiration_requirements([{'id': '05-系列偏好', 'content': text}])
            value = {'work': inherited[0]['works'][0], 'mode': 'plot' if inherited[0]['specificScene'] else 'tone', 'brief': inherited[0]['rule']} if inherited else {'work': '', 'mode': 'plot', 'brief': ''}
        from services.reference_scene_service import ReferenceSceneService
        cards = []
        for card in directory.glob('剧情/*/*/00-章节卡.md'):
            safe = Console.private_path(card.relative_to(Console.private_path('')).as_posix())
            cards.append({'content':safe.read_text(encoding='utf-8')})
        from services.deletion_service import DeletionService
        skipped = sorted({entry['referenceId'] for entry in DeletionService.state().get('referenceIds', []) if entry['seriesId'] == sid})
        return {**value, 'revision': digest(text), 'usedReferenceIds':sorted(ReferenceSceneService.used_ids(cards)), 'skippedReferenceIds':skipped}

    @classmethod
    def compose(cls, original, sid, value, decision, date):
        value = cls.clean(value)
        from services.creative_assistant_service import CreativeAssistantService
        if not original:
            original = f'---\nid: "{sid}-preferences"\ntype: preference-list\nseries: "{sid}"\nstatus: canonical\nupdated: "{date}"\ndecision_ids: []\n---\n\n# 系列偏好\n'
        # Preserve all other preferences and their metadata; replace only our section.
        if not re.match(r'\A---\n.*?\n---\n', original, re.S):
            raise ComicBrainValidationError('系列偏好缺少有效元数据，请先修复后保存')
        _, body = original.split('\n---\n', 1)
        body = re.sub(r'\n## 系列长期参考\n[\s\S]*?(?=\n## |\Z)', '', body).rstrip()
        headers, lines = [], []
        for line in body.splitlines():
            cells = [cell.strip() for cell in line.strip().strip('|').split('|')] if line.strip().startswith('|') else []
            if '可执行规则' in cells and '状态' in cells:
                headers = cells
            elif not cells:
                headers = []
            row = dict(zip(headers, cells))
            if row.get('状态') == 'stable' and re.search('标杆|借鉴|参考', row.get('类别', '')):
                cells[headers.index('状态')] = 'rejected'
                if '反例条件' in headers:
                    cells[headers.index('反例条件')] = f'已由系列长期参考替代，见 {decision}'
                line = '| ' + ' | '.join(cells) + ' |'
            lines.append(line)
        body = '\n'.join(lines)
        mode = '每话选原作具体片段再改编' if value['mode'] == 'plot' else '参考基调与人物互动，剧情可原创'
        body += '\n\n## 系列长期参考\n\n'
        body += f'- 参考作品：{value["work"] or "未指定；后续剧情自主设计"}\n- 参考方式：{mode}\n- 借鉴重点：{value["brief"] or "由系列人物、任务和场景重新设计，不照搬台词"}\n- 范围：仅本系列\n- 状态：stable\n- 置信度：高（创作者直接设置）\n- 证据：{decision}\n- 反例条件：本话明确指定其他参考时仅覆盖本话；用户修改系列设定时替代本项\n'
        body += '\n### 系列脉络（待创作计划）\n\n这些片段仅是后续改编的顺序，不代表本系列剧情已经发生；片段用完后由 AI 自动选择新片段。\n'
        for n, scene in enumerate(value['storyline'], 1):
            body += f'\n{n}. {scene["title"]} · {scene["sourceStatus"]}\n   - 原作片段：{scene["reference"]}\n   - 改编方向：{scene["adaptationHint"]}\n   - 片段 ID：{scene["id"]}\n'
        composed = CreativeAssistantService.compose(original, body.strip(), decision, decision, date, [])
        composed = composed.rsplit('\n\n## 本次调整依据', 1)[0] + '\n'
        composed = re.sub(r'^status:.*$', 'status: canonical', composed, count=1, flags=re.M)
        # The structured value is authoritative over older free-text benchmark mentions.
        composed = re.sub(r'^series_reference:.*\n?', '', composed, flags=re.M)
        return composed.replace('\n---\n', '\nseries_reference: ' + json.dumps(value, ensure_ascii=False) + '\n---\n', 1)

    @classmethod
    def save(cls, sid, data):
        value = cls.clean(data)
        directory = Console.series_dirs().get(sid)
        if not directory:
            raise ComicBrainNotFoundError('没有找到这个系列')
        if metadata((directory/'00-系列总览.md').read_text(encoding='utf-8'), 'status') in {'deprecated', 'archived'}:
            raise ComicBrainValidationError('已停用系列不能修改长期参考')
        path = Console.private_path((directory/'05-系列偏好.md').relative_to(Console.private_path('')).as_posix())
        with LOCK:
            current = cls.get(sid)
            if data.get('revision') != current['revision']:
                raise ComicBrainConflictError('系列参考已在其他窗口更新，请重新载入后修改')
            original = path.read_text(encoding='utf-8') if path.exists() else ''
            date = datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d')
            decision = 'DEC-' + date.replace('-', '') + '-' + uuid.uuid4().hex[:8].upper()
            content = cls.compose(original, sid, value, decision, date)
            evidence = Console.private_path('wiki/证据/剧情决策日志.md')
            with evidence.open('a', encoding='utf-8') as handle:
                handle.write(f'\n\n### {decision} · 系列长期参考\n\n- 时间：{now()}\n- 系列：{sid}\n- 用户操作：点击保存系列长期参考，授权后续每话自动使用。\n- 原设定：{json.dumps(current, ensure_ascii=False)}\n- 新设定：{json.dumps(value, ensure_ascii=False)}\n- 范围：仅本系列；不改写既有章节。\n')
            from services.creative_assistant_service import CreativeAssistantService
            try:
                CreativeAssistantService.atomic_text(path, content)
            except Exception:
                with evidence.open('a', encoding='utf-8') as handle:
                    handle.write(f'\n- {decision} 写入失败，未生效。\n')
                raise
            return cls.get(sid)
