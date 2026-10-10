#!/usr/bin/env python3
"""Run deterministic structural checks for the ComicBrain Markdown wiki."""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path


ALLOWED_STATUS = {"canonical", "draft", "deprecated", "archived"}
REQUIRED = [
    "AGENTS.md",
    "index.md",
    "wiki/index.md",
    "wiki/证据/index.md",
    "wiki/证据/剧情决策日志.md",
    "wiki/证据/用户反馈日志.md",
    "wiki/系列/index.md",
    "wiki/创作原则/index.md",
    "wiki/创作偏好/index.md",
    ".agents/skills/comic-wiki/assets/series-skeleton/index.md",
    ".agents/skills/comic-wiki/references/creation-rule-protocol.md",
    ".agents/skills/comic-feedback/SKILL.md",
]
LINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]")
COVER_TITLE_RE = re.compile(r"^标题\s*[：:]\s*(.+?)\s*$", re.MULTILINE)
COVER_DESCRIPTION_RE = re.compile(r"^描述\s*[：:]\s*(.+?)\s*$", re.MULTILINE)
RULE_AUDIT_START_DATE = "2026-08-07"
RULE_SECTION_MARKERS = (
    "## 规则应用记录",
    "### 已采用",
    "### 不适用、覆盖与禁止误用",
)


def requires_rule_audit(data: dict[str, str]) -> bool:
    if data.get("creation_stage") == "skeleton":
        return False
    updated = data.get("updated", "")
    return bool(updated and "{{" not in updated and updated >= RULE_AUDIT_START_DATE)


def validate_rule_audit(
    path: Path,
    data: dict[str, str],
    text: str,
    root: Path,
    errors: list[str],
) -> None:
    rel = path.relative_to(root)
    if data.get("rule_context") != "reviewed":
        errors.append(f"missing rule_context: reviewed for creative artifact: {rel}")
    for marker in RULE_SECTION_MARKERS:
        if marker not in text:
            errors.append(f"missing {marker!r} for creative artifact: {rel}")
    if "待完整读取全局原则" in text:
        errors.append(f"unfinished rule application record: {rel}")


def workspace_root() -> Path:
    return Path(__file__).resolve().parents[4]


def frontmatter(text: str) -> dict[str, str] | None:
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---\n", 4)
    if end < 0:
        return None
    data: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if ":" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip().strip("\"'")
    return data


def link_exists(root: Path, source: Path, target: str, by_stem: dict[str, list[Path]]) -> bool:
    target = target.strip().replace("\\", "/")
    if not target or "{{" in target:
        return True
    raw = Path(target.lstrip("/"))
    candidates = [root / raw, source.parent / raw]
    for candidate in candidates:
        if candidate.is_file() or candidate.with_suffix(".md").is_file():
            return True
    return bool(by_stem.get(raw.name))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=workspace_root())
    args = parser.parse_args()
    root = args.root.resolve()
    errors: list[str] = []
    warnings: list[str] = []

    for rel in REQUIRED:
        if not (root / rel).is_file():
            errors.append(f"missing required file: {rel}")

    markdown = sorted(root.rglob("*.md"))
    by_stem: dict[str, list[Path]] = defaultdict(list)
    for path in markdown:
        if ".agents" not in path.relative_to(root).parts:
            by_stem[path.stem].append(path)

    ids: dict[str, Path] = {}
    chapter_scripts: list[tuple[Path, dict[str, str]]] = []
    cover_descriptions: list[tuple[Path, dict[str, str]]] = []
    chapter_cards: dict[Path, tuple[dict[str, str], str]] = {}
    for path in markdown:
        rel = path.relative_to(root)
        if ".agents" in rel.parts:
            continue
        text = path.read_text(encoding="utf-8")
        data = frontmatter(text)
        requires_meta = rel.name != "AGENTS.md"

        if requires_meta and data is None:
            errors.append(f"missing or malformed frontmatter: {rel}")
        if data is not None:
            for key in ("id", "type", "status", "updated"):
                if not data.get(key):
                    errors.append(f"frontmatter missing {key}: {rel}")
            status = data.get("status")
            if status and status not in ALLOWED_STATUS:
                errors.append(f"invalid status {status!r}: {rel}")
            page_id = data.get("id")
            if page_id:
                if page_id in ids:
                    errors.append(f"duplicate id {page_id!r}: {ids[page_id].relative_to(root)} and {rel}")
                else:
                    ids[page_id] = path
            page_type = data.get("type")
            if page_type == "comic-script":
                chapter_scripts.append((path, data))
            elif page_type == "cover-description":
                cover_descriptions.append((path, data))
            elif page_type == "chapter-card":
                chapter_cards[path] = (data, text)
                if requires_rule_audit(data):
                    validate_rule_audit(path, data, text, root, errors)
            elif page_type == "character" and requires_rule_audit(data):
                validate_rule_audit(path, data, text, root, errors)

        for target in LINK_RE.findall(text):
            if not link_exists(root, path, target, by_stem):
                errors.append(f"broken wikilink [[{target}]] in {rel}")

    for script_path, script_data in chapter_scripts:
        cover_path = script_path.with_name("04-封面描述.md")
        script_rel = script_path.relative_to(root)
        if not cover_path.is_file():
            errors.append(
                f"missing synchronized cover description for {script_rel}: "
                f"{cover_path.relative_to(root)}"
            )
            continue
        if requires_rule_audit(script_data):
            card_path = script_path.with_name("00-章节卡.md")
            card_entry = chapter_cards.get(card_path)
            if card_entry is None:
                errors.append(
                    f"updated comic script requires chapter rule audit: "
                    f"{script_rel}"
                )
            else:
                card_data, card_text = card_entry
                validate_rule_audit(
                    card_path, card_data, card_text, root, errors
                )
        cover_text = cover_path.read_text(encoding="utf-8")
        cover_data = frontmatter(cover_text)
        if cover_data is None:
            continue
        if cover_data.get("type") != "cover-description":
            errors.append(
                f"invalid cover description type in "
                f"{cover_path.relative_to(root)}"
            )
        for field in ("series", "volume", "chapter", "status"):
            if cover_data.get(field) != script_data.get(field):
                errors.append(
                    f"cover description {field} does not match script: "
                    f"{cover_path.relative_to(root)}"
                )
        end = cover_text.find("\n---\n", 4)
        body = cover_text[end + 5 :] if end >= 0 else ""
        if len(COVER_TITLE_RE.findall(body)) != 1:
            errors.append(
                f"cover description requires exactly one 标题 field: "
                f"{cover_path.relative_to(root)}"
            )
        if len(COVER_DESCRIPTION_RE.findall(body)) != 1:
            errors.append(
                f"cover description requires exactly one 描述 field: "
                f"{cover_path.relative_to(root)}"
            )

    for cover_path, _ in cover_descriptions:
        script_path = cover_path.with_name("01-漫画脚本.md")
        if not script_path.is_file():
            errors.append(
                f"orphan cover description without comic script: "
                f"{cover_path.relative_to(root)}"
            )

    for stem, paths in sorted(by_stem.items()):
        active = [p for p in paths if ".agents" not in p.relative_to(root).parts]
        if len(active) > 1 and stem != "index":
            warnings.append(f"ambiguous basename {stem!r}: {len(active)} active files; prefer path-qualified links")

    for item in errors:
        print(f"ERROR: {item}")
    for item in warnings:
        print(f"WARN: {item}")
    print(f"checked {len(markdown)} Markdown files; {len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
