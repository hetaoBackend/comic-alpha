#!/usr/bin/env python3
"""Compile a ComicBrain chapter script into a comic-alpha production package."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SAFE_ID_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
MOBILE_CANVAS_WIDTH = 1024
MOBILE_CANVAS_HEIGHT = 1536
MOBILE_CANVAS_ASPECT_RATIO = "2:3"
PAGE_RE = re.compile(
    r"^##\s+(?P<token>IMG[-_ ]?\d+|PAGE(?:[-_ ]|\s)+\d+)"
    r"(?:\s*[｜|:：]\s*(?P<title>.+?))?\s*$",
    re.IGNORECASE,
)
IMAGE_PANEL_RE = re.compile(
    r"^###\s+画面\s*(?P<label>[A-Za-z0-9]+)(?P<suffix>.*?)\s*$"
)
TEMPLATE_PANEL_RE = re.compile(
    r"^###\s+(?P<token>P\d{1,4}[-_]F\d{1,3})(?P<suffix>.*?)\s*$",
    re.IGNORECASE,
)
GENERIC_PANEL_RE = re.compile(
    r"^###\s+PANEL(?:[-_ ]|\s)+(?P<number>\d+)(?P<suffix>.*?)\s*$",
    re.IGNORECASE,
)
WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
PRONOUN_CONTEXT_RE = re.compile(
    r"(?:^|[，。；：、\s])(?:他|她|他们|她们|两人|二人)(?:[，。；：、\s]|$)"
)
COVER_TITLE_RE = re.compile(r"^标题\s*[：:]\s*(.+?)\s*$", re.MULTILINE)
COVER_DESCRIPTION_RE = re.compile(
    r"^描述\s*[：:]\s*(.+?)\s*$",
    re.MULTILINE,
)
CANONICAL_ASSET_STATUSES = {
    "canonical-image-source",
    "canonical-lineup-source",
}


@dataclass(frozen=True)
class Character:
    character_id: str
    name: str
    references: tuple[dict[str, str], ...]


@dataclass(frozen=True)
class PanelBlock:
    panel_id: str
    label: str
    body_lines: tuple[str, ...]
    line_number: int
    is_cover: bool


def workspace_root() -> Path:
    return Path(__file__).resolve().parents[4]


def parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Parse the small YAML subset used by ComicBrain frontmatter."""
    if not text.startswith("---\n"):
        raise ValueError("missing frontmatter")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise ValueError("malformed frontmatter")

    metadata: dict[str, Any] = {}
    for line in text[4:end].splitlines():
        if ":" not in line or line.lstrip().startswith("#"):
            continue
        key, raw_value = line.split(":", 1)
        value = raw_value.strip()
        if not value:
            parsed: Any = ""
        elif value.startswith("[") and value.endswith("]"):
            try:
                parsed = json.loads(value.replace("'", '"'))
            except json.JSONDecodeError:
                parsed = value
        elif (
            len(value) >= 2
            and value[0] == value[-1]
            and value[0] in {'"', "'"}
        ):
            parsed = value[1:-1]
        else:
            parsed = value
        metadata[key.strip()] = parsed
    return metadata, text[end + 5 :]


def frontmatter_line_offset(text: str) -> int:
    """Return the number of source lines preceding the parsed Markdown body."""
    if not text.startswith("---\n"):
        raise ValueError("missing frontmatter")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise ValueError("malformed frontmatter")
    return text[: end + 5].count("\n")


def safe_identifier(value: str, option: str) -> str:
    value = value.strip()
    if not SAFE_ID_RE.fullmatch(value):
        raise ValueError(
            f"{option} must use lowercase ASCII letters, digits, and internal hyphens"
        )
    return value


def find_series_dir(root: Path, series_id: str) -> Path:
    registry = root / "wiki" / "系列"
    matches: list[Path] = []
    for path in sorted(item for item in registry.iterdir() if item.is_dir()):
        index_path = path / "index.md"
        if not index_path.is_file():
            continue
        try:
            metadata, _ = parse_frontmatter(
                index_path.read_text(encoding="utf-8")
            )
        except ValueError:
            continue
        if metadata.get("series") == series_id:
            matches.append(path)
    if not matches:
        raise FileNotFoundError(f"series not found: {series_id}")
    if len(matches) > 1:
        names = ", ".join(path.name for path in matches)
        raise RuntimeError(f"series id is ambiguous: {names}")
    return matches[0]


def find_chapter_script(
    root: Path, series_dir: Path, series_id: str, chapter_id: str
) -> tuple[Path, dict[str, Any], str]:
    matches: list[tuple[Path, dict[str, Any], str]] = []
    for path in sorted((series_dir / "剧情").rglob("01-漫画脚本.md")):
        text = path.read_text(encoding="utf-8")
        try:
            metadata, body = parse_frontmatter(text)
        except ValueError:
            continue
        if (
            metadata.get("type") == "comic-script"
            and metadata.get("series") == series_id
            and metadata.get("chapter") == chapter_id
        ):
            matches.append((path, metadata, body))

    if not matches:
        raise FileNotFoundError(
            f"comic script not found for {series_id}/{chapter_id}"
        )
    if len(matches) > 1:
        names = ", ".join(
            path.relative_to(root).as_posix() for path, _, _ in matches
        )
        raise RuntimeError(f"multiple comic scripts matched: {names}")
    return matches[0]


def parse_cover_fields(body: str) -> tuple[str, str]:
    title_matches = COVER_TITLE_RE.findall(body)
    description_matches = COVER_DESCRIPTION_RE.findall(body)
    if len(title_matches) != 1:
        raise ValueError(
            "cover description requires exactly one non-empty 标题 field"
        )
    if len(description_matches) != 1:
        raise ValueError(
            "cover description requires exactly one non-empty 描述 field"
        )
    title = visible_markdown(title_matches[0])
    brief = visible_markdown(description_matches[0])
    if not title:
        raise ValueError("cover description title is empty")
    if not brief:
        raise ValueError("cover description brief is empty")
    return title, brief


def load_cover_description(
    root: Path,
    script_path: Path,
    script_metadata: dict[str, Any],
) -> dict[str, Any]:
    cover_path = script_path.with_name("04-封面描述.md")
    if not cover_path.is_file():
        raise FileNotFoundError(
            f"cover description not found beside script: {cover_path}"
        )

    cover_bytes = cover_path.read_bytes()
    cover_text = cover_bytes.decode("utf-8")
    metadata, body = parse_frontmatter(cover_text)
    if metadata.get("type") != "cover-description":
        raise ValueError("04-封面描述.md must use type: cover-description")
    for field in ("series", "volume", "chapter", "status"):
        if metadata.get(field) != script_metadata.get(field):
            raise ValueError(
                f"cover description {field} does not match comic script"
            )
    title, brief = parse_cover_fields(body)
    return {
        "mode": "chapter-cover-description",
        "title": title,
        "brief": brief,
        "source": {
            "id": metadata.get("id", ""),
            "file": cover_path.relative_to(root).as_posix(),
            "hash": hashlib.sha256(cover_bytes).hexdigest(),
            "updated_at": metadata.get("updated", ""),
        },
    }


def visible_markdown(text: str) -> str:
    """Keep authored wording while resolving Obsidian links to visible labels."""

    def replace_wikilink(match: re.Match[str]) -> str:
        target, label = match.groups()
        if label:
            return label.strip()
        return Path(target.strip()).name

    text = WIKILINK_RE.sub(replace_wikilink, text)
    text = HTML_COMMENT_RE.sub("", text)
    lines = [line.rstrip() for line in text.splitlines()]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()

    compact: list[str] = []
    previous_blank = False
    for line in lines:
        blank = not line.strip()
        if blank and previous_blank:
            continue
        compact.append(line)
        previous_blank = blank
    return "\n".join(compact).strip()


def markdown_h1(body: str) -> str:
    for line in body.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    raise ValueError("script is missing an H1 title")


def chapter_title(body: str) -> str:
    title = markdown_h1(body)
    return re.sub(r"\s*[·｜|]\s*漫画脚本\s*$", "", title).strip()


def series_title(series_dir: Path) -> str:
    index_path = series_dir / "index.md"
    _, body = parse_frontmatter(index_path.read_text(encoding="utf-8"))
    return markdown_h1(body)


def canonical_page_id(token: str) -> str:
    upper = token.upper().replace("_", "-")
    number_match = re.search(r"\d+", upper)
    if not number_match:
        raise ValueError(f"page heading has no numeric id: {token}")
    number = int(number_match.group())
    if upper.startswith("IMG"):
        return f"IMG-{number:02d}"
    return f"PAGE-{number:03d}"


def canonical_panel_id(
    page_id: str, heading: str, fallback_index: int
) -> tuple[str, str, bool]:
    match = IMAGE_PANEL_RE.match(heading)
    if match:
        label = match.group("label").upper()
        suffix = match.group("suffix").strip()
        return f"{page_id}-{label}", f"画面 {label}{suffix}", "封面" in suffix

    match = TEMPLATE_PANEL_RE.match(heading)
    if match:
        token = match.group("token").upper().replace("_", "-")
        suffix = match.group("suffix").strip()
        return token, f"{token}{suffix}", "封面" in suffix

    match = GENERIC_PANEL_RE.match(heading)
    if match:
        number = int(match.group("number"))
        suffix = match.group("suffix").strip()
        return (
            f"{page_id}-P{number:02d}",
            f"PANEL {number}{suffix}",
            "封面" in suffix,
        )

    return (
        f"{page_id}-P{fallback_index:02d}",
        heading.removeprefix("###").strip(),
        "封面" in heading,
    )


def asset_rows(series_dir: Path) -> list[tuple[str, ...]]:
    asset_index = series_dir / "assets" / "index.md"
    rows: list[tuple[str, ...]] = []
    for line in asset_index.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            continue
        columns = tuple(
            part.strip() for part in line.strip().strip("|").split("|")
        )
        if len(columns) == 7:
            rows.append(columns)
    return rows


def load_profile_names(series_dir: Path) -> dict[str, str]:
    """Load exportable character identities without promoting draft profiles.

    A canonical profile is always exportable. A draft profile is also
    exportable when its H1 name has an explicitly confirmed image source in
    the asset registry. Only the profile ID and H1 name are consumed here;
    draft narrative fields never enter the production package.
    """
    names: dict[str, str] = {}
    canonical_asset_subjects = {
        columns[1]
        for columns in asset_rows(series_dir)
        if columns[6] in CANONICAL_ASSET_STATUSES
    }
    for path in sorted((series_dir / "人物").glob("c*.md")):
        metadata, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        character_id = str(metadata.get("character_id", "")).strip()
        name = markdown_h1(body)
        if not re.fullmatch(r"c\d{3}", character_id):
            continue
        if (
            metadata.get("status") != "canonical"
            and name not in canonical_asset_subjects
        ):
            continue
        names[character_id] = name
    return names


def load_canonical_asset_references(
    root: Path, series_dir: Path, names: dict[str, str]
) -> dict[str, list[dict[str, str]]]:
    references: dict[str, list[dict[str, str]]] = {
        character_id: [] for character_id in names
    }
    shared: list[dict[str, str]] = []
    ids_by_name = {name: character_id for character_id, name in names.items()}

    for columns in asset_rows(series_dir):
        asset_id, subject, asset_path, _, version, _, canon_status = columns
        asset_path = asset_path.strip("`")
        if canon_status not in CANONICAL_ASSET_STATUSES:
            continue
        relative_path = (
            series_dir.relative_to(root) / "assets" / Path(asset_path)
        ).as_posix()
        absolute_path = root / relative_path
        if not absolute_path.is_file():
            raise FileNotFoundError(
                f"canonical asset is registered but missing: {relative_path}"
            )
        item = {
            "asset_id": asset_id,
            "path": relative_path,
            "kind": canon_status,
            "version": version,
            "sha256": hashlib.sha256(absolute_path.read_bytes()).hexdigest(),
        }
        if canon_status == "canonical-lineup-source":
            shared.append(item)
            continue
        character_id = ids_by_name.get(subject)
        if character_id:
            references[character_id].append(item)

    for character_id in references:
        references[character_id].extend(shared)
    return references


def load_characters(
    root: Path, series_dir: Path, script_text: str
) -> list[Character]:
    names = load_profile_names(series_dir)
    reference_map = load_canonical_asset_references(root, series_dir, names)
    visible_script = visible_markdown(script_text)

    characters: list[Character] = []
    for character_id, name in sorted(names.items()):
        if name not in visible_script:
            continue
        characters.append(
            Character(
                character_id=character_id,
                name=name,
                references=tuple(reference_map.get(character_id, [])),
            )
        )
    return characters


def parse_panels(
    page_id: str, section_lines: list[str], section_start_line: int
) -> tuple[list[PanelBlock], list[str]]:
    headings: list[tuple[int, str]] = []
    for index, line in enumerate(section_lines):
        if (
            IMAGE_PANEL_RE.match(line)
            or TEMPLATE_PANEL_RE.match(line)
            or GENERIC_PANEL_RE.match(line)
        ):
            headings.append((index, line))

    if not headings:
        raise ValueError(f"{page_id} has no supported panel headings")

    prelude = section_lines[: headings[0][0]]
    panels: list[PanelBlock] = []
    seen_ids: set[str] = set()
    for order, (start, heading) in enumerate(headings, start=1):
        end = headings[order][0] if order < len(headings) else len(section_lines)
        panel_id, label, is_cover = canonical_panel_id(page_id, heading, order)
        if panel_id in seen_ids:
            raise ValueError(f"duplicate panel id: {panel_id}")
        seen_ids.add(panel_id)
        panels.append(
            PanelBlock(
                panel_id=panel_id,
                label=label,
                body_lines=tuple(section_lines[start + 1 : end]),
                line_number=section_start_line + start,
                is_cover=is_cover,
            )
        )
    return panels, prelude


def parse_pages(
    body: str,
    characters: list[Character],
    source_file: str,
    source_line_offset: int = 0,
) -> list[dict[str, Any]]:
    lines = body.splitlines()
    page_headings: list[tuple[int, re.Match[str]]] = []
    all_h2: list[int] = []
    for index, line in enumerate(lines):
        if line.startswith("## "):
            all_h2.append(index)
            match = PAGE_RE.match(line)
            if match:
                page_headings.append((index, match))

    if not page_headings:
        raise ValueError(
            "no supported pages found; use headings such as "
            "'## IMG-01｜标题' or '## PAGE 001'"
        )

    pages: list[dict[str, Any]] = []
    seen_page_ids: set[str] = set()
    names = [character.name for character in characters]
    for heading_index, match in page_headings:
        page_id = canonical_page_id(match.group("token"))
        if page_id in seen_page_ids:
            raise ValueError(f"duplicate page id: {page_id}")
        seen_page_ids.add(page_id)

        next_h2 = next(
            (index for index in all_h2 if index > heading_index),
            len(lines),
        )
        section_lines = lines[heading_index + 1 : next_h2]
        panels, prelude_lines = parse_panels(
            page_id, section_lines, heading_index + 2
        )
        prelude_text = visible_markdown("\n".join(prelude_lines))

        rows: list[dict[str, Any]] = []
        previous_cast: list[str] = []
        for panel in panels:
            body_text = visible_markdown("\n".join(panel.body_lines))
            panel_source_text = visible_markdown(
                "\n".join((panel.label, body_text))
            )
            direct_cast = [
                name for name in names if name in panel_source_text
            ]
            inherited_cast: list[str] = []
            if (
                not direct_cast
                and previous_cast
                and PRONOUN_CONTEXT_RE.search(panel_source_text)
            ):
                inherited_cast = previous_cast.copy()
            panel_cast = direct_cast or inherited_cast

            parts: list[str] = []
            if direct_cast:
                parts.append(
                    f"出场人物（规范名）：{'、'.join(direct_cast)}"
                )
            elif inherited_cast:
                parts.append(
                    "承接上一格人物（规范名）："
                    + "、".join(inherited_cast)
                )
            if prelude_text:
                parts.append(prelude_text)
            parts.append(panel.label)
            if body_text:
                parts.append(body_text)
            panel_text = "\n\n".join(part for part in parts if part).strip()
            if not panel_text:
                raise ValueError(f"empty panel text: {panel.panel_id}")
            rows.append(
                {
                    "id": f"{panel.panel_id}-ROW",
                    "height": "auto",
                    "weight": 1,
                    "panels": [
                        {
                            "id": panel.panel_id,
                            "text": panel_text,
                            "source": {
                                "file": source_file,
                                "line": (
                                    panel.line_number + source_line_offset
                                ),
                                "heading": panel.label,
                            },
                            "character_names": panel_cast,
                            "cover_candidate": panel.is_cover,
                        }
                    ],
                }
            )
            if panel_cast:
                previous_cast = panel_cast

        heading_title = (match.group("title") or "").strip()
        page_cast = [
            name
            for name in names
            if any(
                name in row["panels"][0]["character_names"]
                for row in rows
            )
        ]
        pages.append(
            {
                "id": page_id,
                "title": heading_title or page_id,
                "character_names": page_cast,
                "canvas": {
                    "width": MOBILE_CANVAS_WIDTH,
                    "height": MOBILE_CANVAS_HEIGHT,
                    "aspect_ratio": MOBILE_CANVAS_ASPECT_RATIO,
                },
                "rows": rows,
                "source": {
                    "file": source_file,
                    "line": heading_index + 1 + source_line_offset,
                    "heading": lines[heading_index].removeprefix("## ").strip(),
                },
            }
        )
    return pages


def character_payload(character: Character) -> dict[str, Any]:
    return {
        "id": character.character_id,
        "name": character.name,
        "aliases": [character.name],
        "reference_images": [copy.deepcopy(item) for item in character.references],
    }


def package_snapshot_hash(package: dict[str, Any]) -> str:
    """Hash the complete derived package, excluding volatile/self fields."""
    stable = copy.deepcopy(package)
    source = stable.get("source")
    if isinstance(source, dict):
        source.pop("exported_at", None)
        source.pop("snapshot_hash", None)
    payload = json.dumps(
        stable,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def build_package(
    root: Path, series_id: str, chapter_id: str
) -> tuple[dict[str, Any], Path]:
    series_dir = find_series_dir(root, series_id)
    script_path, metadata, body = find_chapter_script(
        root, series_dir, series_id, chapter_id
    )
    source_file = script_path.relative_to(root).as_posix()
    script_bytes = script_path.read_bytes()
    script_text = script_bytes.decode("utf-8")
    characters = load_characters(root, series_dir, script_text)
    pages = parse_pages(
        body,
        characters,
        source_file,
        source_line_offset=frontmatter_line_offset(script_text),
    )
    title = chapter_title(body)
    series_name = series_title(series_dir)
    cover = load_cover_description(root, script_path, metadata)

    package: dict[str, Any] = {
        "schema_version": "comicbrain-alpha/1",
        "artifact_status": "derived-production",
        "source": {
            "series_id": series_id,
            "chapter_id": chapter_id,
            "status": metadata.get("status", ""),
            "source_id": metadata.get("id", ""),
            "source_file": source_file,
            "source_hash": hashlib.sha256(script_bytes).hexdigest(),
            "source_updated_at": metadata.get("updated", ""),
            "exported_at": datetime.now(timezone.utc)
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z"),
        },
        "series_title": series_name,
        "title": title,
        "settings": {
            "language": "zh",
            "comic_style": "reference",
            "layout": "one-source-panel-per-row",
            "cover_mode": "chapter-cover-description",
            "image_size": (
                f"{MOBILE_CANVAS_WIDTH}x{MOBILE_CANVAS_HEIGHT}"
            ),
            "canvas_aspect_ratio": MOBILE_CANVAS_ASPECT_RATIO,
            "output_format": "mobile-long-page",
        },
        "characters": [character_payload(character) for character in characters],
        "pages": pages,
        "cover": cover,
    }
    package["source"]["snapshot_hash"] = package_snapshot_hash(package)
    validate_package(package, root)
    return package, root / "production" / series_id / chapter_id / "storyboard.json"


def validate_package(package: dict[str, Any], root: Path) -> None:
    if package.get("schema_version") != "comicbrain-alpha/1":
        raise ValueError("unsupported schema_version")
    if not isinstance(package.get("series_title"), str) or not package["series_title"]:
        raise ValueError("series_title is required")
    source = package.get("source")
    if not isinstance(source, dict):
        raise ValueError("source must be an object")
    for field in (
        "series_id",
        "chapter_id",
        "status",
        "source_file",
        "source_hash",
        "snapshot_hash",
        "source_updated_at",
        "exported_at",
    ):
        if not source.get(field):
            raise ValueError(f"source.{field} is required")
    source_path = root / source["source_file"]
    if not source_path.is_file():
        raise FileNotFoundError(f"source file is missing: {source['source_file']}")
    source_bytes = source_path.read_bytes()
    expected_hash = hashlib.sha256(source_bytes).hexdigest()
    if source["source_hash"] != expected_hash:
        raise ValueError("source.source_hash does not match source_file")
    source_text = source_bytes.decode("utf-8")
    script_metadata, _ = parse_frontmatter(source_text)
    source_lines = source_text.splitlines()

    cover = package.get("cover")
    if not isinstance(cover, dict):
        raise ValueError("cover must be an object")
    if cover.get("mode") != "chapter-cover-description":
        raise ValueError("cover.mode must be chapter-cover-description")
    if not isinstance(cover.get("title"), str) or not cover["title"].strip():
        raise ValueError("cover.title is required")
    if not isinstance(cover.get("brief"), str) or not cover["brief"].strip():
        raise ValueError("cover.brief is required")
    cover_source = cover.get("source")
    if not isinstance(cover_source, dict):
        raise ValueError("cover.source must be an object")
    for field in ("id", "file", "hash", "updated_at"):
        if not cover_source.get(field):
            raise ValueError(f"cover.source.{field} is required")
    cover_relative = Path(cover_source["file"])
    if cover_relative.is_absolute() or ".." in cover_relative.parts:
        raise ValueError(f"unsafe cover source path: {cover_source['file']}")
    cover_path = root / cover_relative
    if not cover_path.is_file():
        raise FileNotFoundError(
            f"cover source file is missing: {cover_source['file']}"
        )
    cover_bytes = cover_path.read_bytes()
    if cover_source["hash"] != hashlib.sha256(cover_bytes).hexdigest():
        raise ValueError("cover.source.hash does not match cover source file")
    cover_metadata, cover_body = parse_frontmatter(
        cover_bytes.decode("utf-8")
    )
    if cover_metadata.get("type") != "cover-description":
        raise ValueError("cover source must use type: cover-description")
    if cover_metadata.get("id") != cover_source["id"]:
        raise ValueError("cover.source.id does not match cover source file")
    if cover_metadata.get("updated") != cover_source["updated_at"]:
        raise ValueError(
            "cover.source.updated_at does not match cover source file"
        )
    if cover_metadata.get("series") != source.get("series_id"):
        raise ValueError("cover source series does not match package source")
    if cover_metadata.get("chapter") != source.get("chapter_id"):
        raise ValueError("cover source chapter does not match package source")
    for field in ("series", "volume", "chapter", "status"):
        if cover_metadata.get(field) != script_metadata.get(field):
            raise ValueError(
                f"cover source {field} does not match script source"
            )
    cover_title, cover_brief = parse_cover_fields(cover_body)
    if cover["title"] != cover_title:
        raise ValueError("cover.title does not match cover source file")
    if cover["brief"] != cover_brief:
        raise ValueError("cover.brief does not match cover source file")

    def validate_source_location(
        location: Any, heading_level: int, owner: str
    ) -> None:
        if not isinstance(location, dict):
            raise ValueError(f"{owner}.source must be an object")
        line_number = location.get("line")
        heading = location.get("heading")
        if (
            not isinstance(line_number, int)
            or line_number < 1
            or line_number > len(source_lines)
        ):
            raise ValueError(f"{owner}.source.line is outside source_file")
        actual = source_lines[line_number - 1].strip()
        prefix = "#" * heading_level + " "
        if not actual.startswith(prefix):
            raise ValueError(
                f"{owner}.source.line does not point to an H{heading_level}"
            )
        if actual[len(prefix) :].strip() != heading:
            raise ValueError(
                f"{owner}.source.heading does not match source_file line "
                f"{line_number}"
            )

    pages = package.get("pages")
    if not isinstance(pages, list) or not pages:
        raise ValueError("pages must be a non-empty array")
    page_ids: set[str] = set()
    panel_ids: set[str] = set()
    for page in pages:
        page_id = page.get("id")
        if not isinstance(page_id, str) or not page_id:
            raise ValueError("every page requires an id")
        if page_id in page_ids:
            raise ValueError(f"duplicate page id: {page_id}")
        page_ids.add(page_id)
        canvas = page.get("canvas")
        if canvas != {
            "width": MOBILE_CANVAS_WIDTH,
            "height": MOBILE_CANVAS_HEIGHT,
            "aspect_ratio": MOBILE_CANVAS_ASPECT_RATIO,
        }:
            raise ValueError(
                f"{page_id} must use the standard "
                f"{MOBILE_CANVAS_WIDTH}x{MOBILE_CANVAS_HEIGHT} mobile canvas"
            )
        validate_source_location(page.get("source"), 2, page_id)
        rows = page.get("rows")
        if not isinstance(rows, list) or not rows:
            raise ValueError(f"{page_id} must contain rows")
        for row in rows:
            if row.get("height") != "auto" or row.get("weight") != 1:
                raise ValueError(
                    f"{page_id} rows must use equal flexible height"
                )
            panels = row.get("panels")
            if not isinstance(panels, list) or len(panels) != 1:
                raise ValueError(
                    f"{page_id} rows must contain exactly one panel"
                )
            panel = panels[0]
            panel_id = panel.get("id")
            if not isinstance(panel_id, str) or not panel_id:
                raise ValueError("every panel requires an id")
            if panel_id in panel_ids:
                raise ValueError(f"duplicate panel id: {panel_id}")
            panel_ids.add(panel_id)
            validate_source_location(panel.get("source"), 3, panel_id)
            if not isinstance(panel.get("text"), str) or not panel["text"].strip():
                raise ValueError(f"{panel_id} has empty text")

    for character in package.get("characters", []):
        for reference in character.get("reference_images", []):
            if reference.get("kind") not in {
                "canonical-image-source",
                "canonical-lineup-source",
            }:
                raise ValueError(
                    f"{character.get('id')} uses a non-canonical reference"
                )
            path_value = reference.get("path")
            if not isinstance(path_value, str):
                raise ValueError("reference path must be a string")
            relative = Path(path_value)
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError(f"unsafe reference path: {path_value}")
            absolute = root / relative
            if not absolute.is_file():
                raise FileNotFoundError(f"reference asset is missing: {path_value}")
            expected_reference_hash = hashlib.sha256(absolute.read_bytes()).hexdigest()
            if reference.get("sha256") != expected_reference_hash:
                raise ValueError(
                    f"reference asset hash does not match: {path_value}"
                )

    expected_snapshot_hash = package_snapshot_hash(package)
    if source["snapshot_hash"] != expected_snapshot_hash:
        raise ValueError("source.snapshot_hash does not match derived package")


def comparable(package: dict[str, Any]) -> dict[str, Any]:
    value = copy.deepcopy(package)
    if isinstance(value.get("source"), dict):
        value["source"].pop("exported_at", None)
    return value


def write_package(package: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(package, ensure_ascii=False, indent=2) + "\n"
    file_descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{output_path.name}.",
        suffix=".tmp",
        dir=output_path.parent,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, output_path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise


def check_existing(
    generated: dict[str, Any], output_path: Path, root: Path
) -> None:
    if not output_path.is_file():
        raise FileNotFoundError(
            f"production snapshot does not exist; export it first: {output_path}"
        )
    existing = json.loads(output_path.read_text(encoding="utf-8"))
    validate_package(existing, root)
    if comparable(existing) != comparable(generated):
        raise RuntimeError(
            f"production snapshot is stale; rerun exporter: {output_path}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--series-id", required=True)
    parser.add_argument("--chapter-id", required=True)
    parser.add_argument("--root", type=Path, default=workspace_root())
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate parsing and confirm the existing snapshot is current",
    )
    args = parser.parse_args()

    try:
        series_id = safe_identifier(args.series_id, "--series-id")
        chapter_id = safe_identifier(args.chapter_id, "--chapter-id")
        root = args.root.resolve()
        package, output_path = build_package(root, series_id, chapter_id)
        if args.check:
            check_existing(package, output_path, root)
            panel_count = sum(len(page["rows"]) for page in package["pages"])
            print(
                f"OK {series_id}/{chapter_id}: "
                f"{len(package['pages'])} page(s), {panel_count} panel(s); "
                f"snapshot is current"
            )
            return 0

        write_package(package, output_path)
        print(output_path)
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
