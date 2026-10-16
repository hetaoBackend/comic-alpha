"""Create an empty, navigable workspace without copying any author's knowledge."""
from datetime import date
from pathlib import Path
import shutil


PAGES = {
    'index.md': ('workspace-index', '创作空间', '[[wiki/index|打开创作资料]]'),
    'wiki/index.md': ('wiki-index', '创作资料', '[[wiki/系列/index|系列]]\n\n[[wiki/创作原则/index|创作原则]]\n\n[[wiki/创作偏好/index|创作偏好]]\n\n[[wiki/证据/index|证据]]'),
    'wiki/系列/index.md': ('series-index', '系列', '尚未创建系列。'),
    'wiki/创作原则/index.md': ('principles-index', '创作原则', '尚未添加创作原则。'),
    'wiki/创作偏好/index.md': ('preferences-index', '创作偏好', '尚未记录创作偏好。'),
    'wiki/证据/index.md': ('evidence-index', '证据', '[[wiki/证据/剧情决策日志|剧情决策日志]]\n\n[[wiki/证据/用户反馈日志|用户反馈日志]]'),
    'wiki/证据/剧情决策日志.md': ('decision-log', '剧情决策日志', ''),
    'wiki/证据/用户反馈日志.md': ('feedback-log', '用户反馈日志', ''),
}


def write_seed(root: Path):
    for relative, (page_id, title, body) in PAGES.items():
        destination = root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            destination.write_text(f'---\nid: {page_id}\ntype: index\nstatus: draft\nupdated: {date.today().isoformat()}\n---\n\n# {title}\n\n{body}\n', encoding='utf-8')


def initialize_workspace(source: Path, destination: Path):
    """Only first installation seeds an empty workspace; existing vaults stay intact."""
    if destination.exists():
        return
    shutil.copytree(source, destination)
