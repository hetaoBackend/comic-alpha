---
name: comic-wiki
description: Read, create, revise, validate, and export the ComicBrain Obsidian Wiki for multi-series comics, including series setup, canon, characters, relationships, worldbuilding, chapter scripts, synchronized cover descriptions, storyboards, continuity, evidence, and production snapshots. Use whenever work touches ComicBrain knowledge, story content, Wiki structure, canon status, or comic-alpha production export. Pair with comic-feedback when the user approves, rejects, corrects, or requests changes to comic content or collaboration behavior.
---

# Comic Wiki

Treat `wiki/` as the single knowledge entrance. Keep current knowledge, evidence, behavior, and derived production distinct without multiplying creator-facing root directories.

## Use the directory model

- `wiki/系列/`: current series canon, drafts explicitly stored under each series `提案/`, and visual assets.
- `wiki/创作原则/`: reusable craft rules and quality gates.
- `wiki/创作偏好/`: current global creator preferences.
- `wiki/证据/`: append-only decisions, feedback, and source provenance. Read only when provenance matters; never treat an old entry as current canon.
- `.agents/skills/`: operational instructions, scripts, and scaffolding.
- `production/`: derived packages for comic-alpha. Never infer canon from `storyboard.json`, `review.json`, or generated images.

Keep rejected or superseded material where its context is clear: mark former canon `deprecated` and point to the replacement decision; record rejected proposals in the series proposal index. Do not create global inbox or archive layers.

## Route the request

- For a new series or knowledge-model change, read `references/workspace-schema.md` completely. Use `scripts/new_series.py` for a series.
- For brainstorming, read the smallest context pack below and keep options in conversation unless the user asks to persist a draft.
- For any story, chapter, script, storyboard, character, or character-visual creation or substantive revision, read `references/creation-rule-protocol.md` completely. Scan every current creative-principle and preference page through its index, then classify each rule as applied, not applicable, overridden, or rejected; never silently omit a rule.
- For relationship or world work that does not create or substantively revise story/character content, read the target context and the applicable principle/preference pages.
- For a confirmed change, revision, withdrawal, retcon, or explicit Wiki update, read `references/update-protocol.md` completely before writing.
- For user approval, rejection, correction, or requested revision, also use `../comic-feedback/SKILL.md` before deciding what the feedback means.
- For audit or consistency work, run `scripts/check_wiki.py` and add task-specific semantic checks.
- For comic-alpha handoff, use `scripts/export_comic_alpha.py`.

## Read for discussion

Start at `index.md` and `wiki/系列/index.md`. Identify the target series; if it is genuinely ambiguous, ask one concise question.

Build the smallest useful context pack:

1. Target `00-系列总览.md` and `01-创作约束.md`.
2. `02-故事主线.md` and `04-当前状态.md`.
3. Relevant volume outline, chapter script, synchronized cover description, latest canonical chapter review, and open plot lines.
4. Only the involved character profiles and relationship entries.
5. Relevant world entities and target-series facts.
6. For creative generation or substantive revision, the complete rule catalog required by `references/creation-rule-protocol.md`: every current global principle page, every global preference page, target `05-系列偏好.md`, and series-level overrides. For other work, only the applicable rule pages.

State current facts separately from the open creative question. Offer a small number of meaningfully different directions. Make causal chain, character choice, cost, continuity impact, information load, and new assumptions visible.

For creative generation, also state a compact rule-application brief. Every applied rule must point to a concrete design choice; every non-applicable or overridden rule needs a reason. A bare list of rule IDs is not evidence of application.

During discussion, keep proposals in conversation or save them as `status: draft` when the user asks for persistence. Do not update the story spine, timeline, character current state, or current-state snapshot yet.

## Respect authority and status

- `canonical`: explicitly confirmed current knowledge.
- `draft`: unconfirmed proposal or production design.
- `deprecated`: superseded knowledge kept for traceability.
- `archived`: legacy status only; do not create a global archive directory.

Never promote a proposal because it is plausible, detailed, or already exported. Require explicit confirmation such as “采用”“定稿”“写入 Wiki”“就按这个” or a direct edit instruction. Treat “有意思”“继续看看” as discussion.

Prefer one authoritative page per fact. Link to it instead of copying paragraphs into several files.

## Write confirmed changes

Follow `references/update-protocol.md`:

1. Resolve scope, authority, superseded decisions, and impact set.
2. Append decision evidence to `wiki/证据/剧情决策日志.md`.
3. Update the primary artifact and all affected downstream current-knowledge pages.
4. If feedback is involved, let `comic-feedback` decide whether and how to append `wiki/证据/用户反馈日志.md` and update preferences.
5. Validate structure and semantic continuity.

Never rewrite older evidence. Never let a depiction preference add a plot event.

## Work at comic granularity

Move from chapter card → scenes → pages → panels → synchronized cover description → visual continuity. Keep plot facts separate from visual realization.

For each ordinary panel, define one primary visible moment, narrative function, focal point, performance, text, and continuity input. Check dialogue space, reading order, panel transitions, page turns or vertical-scroll gaps, action axis, eye-lines, props, costume, injuries, and lighting.

Whenever creating or materially revising `01-漫画脚本.md`, also create or update sibling `04-封面描述.md`. Use type `cover-description`, mirror the script's `series`, `volume`, `chapter`, and `status`, and keep the body to `标题：...` plus one concise `描述：...`. Choose one established, eye-catching visual moment rather than a synopsis collage; include only essential continuity constraints. The exporter treats this file as mandatory and compiles it into `storyboard.json.cover`.

Use the full scan and task-depth matrix in `references/creation-rule-protocol.md`; `03-漫画脚本.md` through `06-剧情质量门禁.md` remain mandatory for scripts but are not the complete rule set. Comedy/fast-read work must include `11-情景喜剧与百秒钩子.md`. Character work must include `02-角色与关系.md`, `09-人物视觉设计.md`, relevant global preferences, and target-series preferences. Use canonical visual anchors; accidental generation details never become canon.

When creating or substantively revising a chapter, write `rule_context: reviewed` and `## 规则应用记录` in its `00-章节卡.md`; update that record whenever the script changes materially. When creating or substantively revising a character, add the same marker and section to the character profile. Do not claim old artifacts were reviewed unless an actual rule audit was performed.

## Export production

Compile a confirmed Wiki draft and its synchronized cover description with `scripts/export_comic_alpha.py`. Treat production as a reproducible snapshot, not a write-back channel. Human edits in `review.json` become Wiki changes only after explicit confirmation and the normal evidence-first flow.

## Validate and report

After structural writes, run:

```bash
python3 .agents/skills/comic-wiki/scripts/check_wiki.py
```

Run this command from the ComicBrain root; the script also resolves that root from its own location.

Then check causality, character knowledge, relationships, timeline, injuries, inventory, visual state, open promises, and downstream summaries.

Report what became canonical or remained draft, which rules/preferences materially changed the design, which were overridden or inapplicable, which pages changed, unresolved continuity risk, and validation results. Report preference changes only when `comic-feedback` justified them.
