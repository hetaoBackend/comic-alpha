# Creator feedback and preference protocol

Read this file completely before appending feedback evidence or changing a preference page.

## 1. Capture the feedback faithfully

Preserve the user's observed experience and intended outcome. Separate direct words from Agent interpretation. Do not rewrite “I could not understand this” as “the user dislikes all complex stories,” and do not save the Agent's alternative repair as if the user proposed it.

## 2. Test the diagnosis

Compare the feedback with the affected artifact, current canon, applicable creative principles, and production constraints.

- If the user identified both problem and repair correctly, adopt the repair at the confirmed scope.
- If the symptom is valid but the repair adds clutter, breaks character logic, violates continuity, or exceeds the medium, keep the outcome and propose a better repair.
- If the premise is factually or canonically wrong, show the evidence. Do not record the false premise as a fact or preference.
- If the matter is taste, present meaningful tradeoffs without pretending one taste is objectively correct.

## 3. Choose the record type

| Class | Store as | Preference effect |
|---|---|---|
| Fact correction | Decision evidence plus corrected authoritative page | None unless the user separately generalizes a method |
| Quality diagnosis | Feedback evidence; update a principle only when explicitly requested or repeatedly validated | Usually none |
| Local creative choice | Chapter/character/series decision | Local only |
| Explicit durable preference | Feedback evidence plus global or series preference row | `stable`, medium/high confidence when scope is clear |
| Inferred repeated pattern | Feedback evidence plus preference row only after comparable repetition | `candidate`, low/medium confidence |

Not every useful correction deserves a preference row. Evidence can remain evidence.

## 4. Append feedback evidence

Append to `wiki/证据/用户反馈日志.md`:

```markdown
### FB-YYYYMMDD-NNN · 反馈主题

- 时间：
- 系列或全局：
- 用户观察：
- 用户目标：
- 用户建议修法：
- Agent 判断：接受 / 保留目标但替换修法 / 反对
- 判断依据：
- 反馈分类：
- 可泛化规则：无 / 规则文本
- 范围：
- 置信度：
- 反例条件：
- 关联页面或决策：
```

Use only fields that help later decisions; concise entries are preferable to ceremonial completeness.

## 5. Write preference rules

Every preference row must contain:

- an executable rule;
- scope: global, series, character, or scene type;
- state: `candidate`, `stable`, or `rejected`;
- confidence;
- feedback or decision evidence IDs;
- exception conditions;
- last validation date.

Store global preferences under `wiki/创作偏好/`. Store series-specific preferences in that series `05-系列偏好.md`. Do not duplicate the same rule in both; the global page may link to a scoped exception.

## 6. Handle conflict and change

- A newer explicit preference can supersede an older one; keep both evidence entries and mark the old preference `rejected` or replace it with a clearly referenced rule.
- A local exception does not weaken a global preference unless the user says the global rule changed.
- When preferences conflict, prefer the narrower scope for the current task, then the newer explicit instruction.
- If the user knowingly chooses a professionally risky repair, record the decision and its tradeoff. Do not convert the risky repair into a stable preference unless the user explicitly asks for that general rule.

## 7. Validate

Confirm that:

- the feedback ID exists;
- the preference wording matches what was actually learned;
- scope and confidence are not inflated;
- the rule includes an exception;
- no preference adds an unconfirmed plot fact;
- the affected current-knowledge page and decision evidence agree.
