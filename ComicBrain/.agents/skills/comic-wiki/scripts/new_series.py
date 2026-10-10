#!/usr/bin/env python3
"""Create a ComicBrain series from the skill's bundled skeleton."""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from datetime import date
from pathlib import Path


SERIES_ID = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$")


def workspace_root() -> Path:
    return Path(__file__).resolve().parents[4]


def safe_title(title: str) -> str:
    cleaned = re.sub(r"[\\/:\x00]", "-", title).strip().strip(".")
    if not cleaned or cleaned in {".", ".."}:
        raise ValueError("title must contain a safe directory name")
    return cleaned


def replace_placeholders(root: Path, values: dict[str, str]) -> None:
    for path in root.rglob("*.md"):
        text = path.read_text(encoding="utf-8")
        for key, value in values.items():
            text = text.replace("{{" + key + "}}", value)
        path.write_text(text, encoding="utf-8")


def register_series(registry: Path, series_id: str, title: str, rel_entry: str) -> None:
    text = registry.read_text(encoding="utf-8")
    marker = "<!-- SERIES_ROWS -->"
    if marker not in text:
        raise RuntimeError(f"missing {marker} in {registry}")
    display_title = title if title.startswith("《") and title.endswith("》") else f"《{title}》"
    row = f'| {series_id} | {display_title} | 待定义 | 筹备 | 尚未开始 | [[{rel_entry}/index|进入]] |\n'
    registry.write_text(text.replace(marker, row + marker, 1), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--id", required=True, help="stable lowercase kebab-case series ID")
    parser.add_argument("--title", required=True, help="human-facing series title")
    parser.add_argument("--volume-title", default="第一卷")
    parser.add_argument("--chapter-title", default="未命名章节")
    parser.add_argument("--root", type=Path, default=workspace_root())
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not SERIES_ID.fullmatch(args.id):
        parser.error("--id must be 1-32 lowercase ASCII letters/digits with internal hyphens")

    try:
        title_dir = safe_title(args.title)
    except ValueError as exc:
        parser.error(str(exc))

    root = args.root.resolve()
    skeleton = Path(__file__).resolve().parents[1] / "assets" / "series-skeleton"
    destination = root / "wiki" / "系列" / f"{args.id}-{title_dir}"
    registry = root / "wiki" / "系列" / "index.md"

    if not skeleton.is_dir():
        parser.error(f"series skeleton not found: {skeleton}")
    if not registry.is_file():
        parser.error(f"series registry not found: {registry}")
    if destination.exists():
        parser.error(f"destination already exists: {destination}")

    if args.dry_run:
        print(destination)
        return 0

    shutil.copytree(skeleton, destination)
    replace_placeholders(
        destination,
        {
            "系列ID": args.id,
            "系列标题": args.title,
            "日期": date.today().isoformat(),
            "第一卷标题": args.volume_title,
            "章节标题": args.chapter_title,
            "主角": "待定主角",
            "独特处境": "待定处境",
            "核心行动": "采取关键行动",
            "核心代价": "将失去重要事物",
        },
    )
    rel_entry = destination.relative_to(root).as_posix()
    register_series(registry, args.id, args.title, rel_entry)
    print(destination)
    return 0


if __name__ == "__main__":
    sys.exit(main())
