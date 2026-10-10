# ComicBrain workspace schema

Read this file before creating a series or changing the knowledge model.

## One knowledge entrance, one behavior area, one derived workspace

| Area | Location | Mutation rule | Meaning |
|---|---|---|---|
| Current knowledge | `wiki/系列/`, `wiki/创作原则/`, `wiki/创作偏好/` | Update to current truth with traceability | Canon, methods, indexes, and current preferences |
| Evidence | `wiki/证据/` | Append only; correct with a later entry | What the user confirmed or said and what sources were consulted |
| Behavior/schema | `AGENTS.md`, `.agents/skills/` | Change deliberately and validate | How agents read, judge, and write the base |

Discussion stays in conversation by default. Persisted drafts live only under the target series `提案/`. Retired canon remains in place as `deprecated` with a replacement pointer. The new-series skeleton is an implementation asset at `assets/series-skeleton/`, not a creator-facing knowledge directory.

`production/` sits outside the truth layers. It contains derived packages for tools such as comic-alpha:

- `storyboard.json` is a reproducible snapshot compiled from one chapter script and its sibling cover description.
- `review.json` is a human-edited production draft and does not automatically update canon.
- generated covers and page renders are production assets, not evidence of story or visual canon.
- a production edit only reaches `wiki/` after explicit user confirmation and the normal evidence-first update protocol.

Export with:

```bash
python3 .agents/skills/comic-wiki/scripts/export_comic_alpha.py \
  --series-id <series-id> \
  --chapter-id <chapter-id>
```

## Required series structure

```text
wiki/系列/<series-id>-<title>/
├── index.md
├── 00-系列总览.md
├── 01-创作约束.md
├── 02-故事主线.md
├── 03-时间线.md
├── 04-当前状态.md
├── 05-系列偏好.md
├── 人物/
│   ├── index.md
│   ├── 人物关系.md
│   └── cNNN-姓名.md
├── 世界观/
│   ├── index.md
│   └── <entity-id>-名称.md
├── 剧情/
│   ├── index.md
│   └── 卷-NNN/
│       ├── 00-卷纲.md
│       └── 章节-NNN/
│           ├── 00-章节卡.md
│           ├── 01-漫画脚本.md
│           ├── 02-分镜表.md
│           ├── 03-章节复盘.md
│           └── 04-封面描述.md
├── 提案/
│   └── index.md
└── assets/
    ├── index.md
    └── 人物/<character-id>/
```

Use ASCII, lowercase kebab-case series IDs; use stable IDs such as `c001`, `loc001`, `org001`, `prop001`, `v001`, and `ch001`. Never reuse a retired ID for a different entity.

Every chapter that contains `01-漫画脚本.md` must also contain `04-封面描述.md`. The cover file uses `type: cover-description`, mirrors the script's series/volume/chapter/status, and keeps its body to a `标题：` line plus one concise `描述：` paragraph. It is a production visual brief, not a new plot-fact owner.

## Frontmatter

Every compiled page requires:

```yaml
---
id: stable-unique-id
type: controlled-page-type
status: canonical
updated: YYYY-MM-DD
---
```

Series content also requires `series`. Character, volume, and chapter artifacts add their own stable IDs. Chapter artifacts should list `decision_ids` once confirmed.

Allowed page statuses:

- `canonical`: user-confirmed current truth.
- `draft`: proposal or unconfirmed work.
- `deprecated`: explicitly superseded but retained for traceability.
- `archived`: removed from active context.

Preference rows use their own states: `candidate`, `stable`, or `rejected`.

## Fact ownership

| Fact | Authoritative page | Summaries that may point to it |
|---|---|---|
| Stable identity, personality, visual anchors | Character profile | Character index, current state |
| Current bilateral relationship | `人物/人物关系.md` | Character profiles, current state |
| World rule and exceptions | World entity page | World index, chapter continuity inputs |
| Event detail | Chapter card/script/review | Timeline and story spine |
| Cover visual intent | `04-封面描述.md` | `production/.../storyboard.json.cover` |
| Story-wide progress and open lines | `02-故事主线.md` | Current state, plot index |
| Current cross-cutting snapshot | `04-当前状态.md` | No page should copy it wholesale |
| Creator taste | Global or series preference page | Proposal rationale |
| Confirmation evidence | `wiki/证据/剧情决策日志.md` | Frontmatter `decision_ids` |

Keep summaries concise and link to the authoritative page. When two pages disagree, do not silently choose: use decision provenance and ask the user when the conflict cannot be resolved.

## Image semantics

Store character images at `assets/人物/<character-id>/`. Register every consequential image with path, purpose, version, source/generation decision, and canon status.

Purpose levels are: canonical design, partial reference, mood reference, or sketch. Only canonical-design assets constrain later image continuity. A generated image does not add costume, prop, injury, relationship, or plot facts unless the user confirms those details.

## Obsidian links

Use `[[path/to/page|label]]` when duplicate filenames such as `index.md` exist. Use short `[[page]]` links only when the target basename is unique inside the series context. Prefer relative Markdown paths for embedded images.
