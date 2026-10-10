# Confirmed update protocol

Read this file completely before writing a confirmed story decision into the Wiki.

## 1. Resolve authority and scope

Capture the exact confirmed change in one sentence. Identify the series, chapter or proposal, whether the user confirmed canon or only requested a draft, and which prior decisions it revises.

If the instruction conflicts with current canon, show the conflict and the minimum coherent options. Do not solve a meaningful retcon silently.

## 2. Build the impact set

Read:

- Series overview, constraints, story spine, timeline, and current state.
- Affected chapter card/script/synchronized cover description/storyboard/review.
- Affected character profiles and relationship registry.
- Affected world entities, props, locations, and open lines.
- Applicable global and series preferences.

List the downstream pages to update. Avoid repository-wide reading when the impact set is local.

## 3. Preflight the decision

Check:

- Cause and effect: which earlier event enables this, and what must follow?
- Character logic: goal, knowledge, relationship, pressure response, and cost.
- Timeline: order, travel, age, duration, simultaneity, and time-of-day constraints.
- State: location, injury, clothing, inventory, secrets, promises, and debts.
- World rules: ability boundaries, costs, exceptions, institutions, and public knowledge.
- Comic execution: visible moments, dialogue load, space, eye-lines, action axis, transitions, and reveal placement.

Ask only when an unresolved choice would materially change the canon. Otherwise make a narrow assumption and label it.

## 4. Append evidence first

Append a `DEC-YYYYMMDD-NNN` entry to `wiki/证据/剧情决策日志.md`. Preserve the user's meaning, distinguish direct instruction from agent summary, and list the expected affected pages.

When the user approves, rejects, corrects, or requests a revision, use `comic-feedback` and read its `references/preference-protocol.md` completely. Append an `FB-YYYYMMDD-NNN` entry to `wiki/证据/用户反馈日志.md` only when that protocol calls for one.

Never edit an older raw entry to make the history look cleaner. Corrections append a new entry referencing the superseded ID.

## 5. Compile current canon

Update in dependency order:

1. Primary chapter artifact: chapter card, script, or storyboard.
2. Synchronized `04-封面描述.md` whenever the script, protagonist, central conflict, key prop, climax, or ending materially changes.
3. Chapter review/change summary.
4. Character profiles and bilateral relationship registry.
5. World entity, inventory/prop, and visual-state pages.
6. Timeline and open-line status.
7. Story spine.
8. Current-state snapshot.
9. Plot, character, world, asset, and series indexes.

Set confirmed artifacts to `canonical`, add decision IDs, and update dates. Keep proposals `draft`; link them to the adopted or rejected result.

For a revision, mark superseded artifacts `deprecated` in place and leave a pointer to the replacement decision. For rejected proposals, record the result in the target series proposal index; delete disposable draft pages only when their decision trail remains recoverable.

## 6. Compile preferences separately

Use `comic-feedback` to classify each response as a fact correction, quality diagnosis, local choice, explicit preference, or repeated pattern.

- Write explicit durable preferences as `stable` with medium/high confidence when scope is clear.
- Write inferred patterns as `candidate` with low/medium confidence and multiple evidence links where possible.
- Keep one-scene choices scoped locally unless the user generalizes them.
- Record exception conditions so agents do not apply the rule mechanically.
- Never let a depiction preference add a plot event.

## 7. Verify

Run `scripts/check_wiki.py`. Then inspect the semantic impact set manually. Confirm that no character knows an unlearned fact; no person, prop, injury, costume, or location teleports; the timeline remains possible; relationship changes have triggers; open lines are added or closed; and the current-state snapshot matches the final canon.

## 8. Handoff

Tell the user:

- The canonical decision and its decision ID.
- The pages updated.
- Any unresolved or deliberately deferred detail.
- Preference memory added, changed, or intentionally left as a candidate.
- Validation result.
