---
name: comic-feedback
description: Evaluate creator feedback on manga or comic stories, characters, dialogue, pacing, panels, visuals, and collaboration; distinguish factual corrections, reader symptoms, local choices, quality problems, and durable preferences; challenge harmful fixes with professional reasoning; and record scoped preference evidence. Use whenever the user approves, rejects, corrects, critiques, or requests a revision to ComicBrain content or workflow.
---

# Comic Feedback

Treat feedback as evidence about the work and the creator, not as an automatically correct diagnosis or a permanent rule.

## Separate four things

For every correction, identify:

1. **Observed symptom**: what the user experienced, such as confusion, boredom, disbelief, or dislike.
2. **Desired outcome**: what should become clearer, funnier, faster, warmer, or more consistent.
3. **Proposed cause**: why the user thinks the problem occurred.
4. **Proposed fix**: the concrete deletion, addition, rewrite, or rule the user suggests.

Treat the symptom as first-hand reader evidence. Test the cause and fix instead of assuming they are correct.

## Apply professional judgment

Check the proposed fix against:

- visible cause and effect;
- character goals, knowledge, relationships, and agency;
- established canon and world rules;
- page count, panel readability, dialogue load, and visual continuity;
- narrative simplicity, element burden, setup/payoff, and ending load;
- audience, tone, safety, and factual accuracy.

Use three response modes:

- **Accept** when the symptom and fix are coherent.
- **Accept the goal, replace the fix** when the symptom is valid but the proposed repair creates a new problem.
- **Challenge** when the premise conflicts with canon, facts, character logic, or the requested medium. Cite the concrete conflict and offer a smaller viable alternative.

User authority does not remove the duty to advise. The user owns taste and final canon; the Agent owns the responsibility to surface consequences. If the user understands the tradeoff and still chooses it, implement it as a scoped decision or explicit exception.

## Classify before recording

Choose one primary class, with secondary tags if useful:

- **Fact correction**: identity, chronology, location, knowledge, continuity, terminology, or source accuracy.
- **Quality diagnosis**: causality, clarity, pacing, staging, dialogue, panel readability, or information load.
- **Local creative choice**: a valid choice for this scene, chapter, character, or series without broader force.
- **Explicit durable preference**: the user clearly says this should generally or always guide future work.
- **Inferred pattern**: repeated comparable choices suggest a preference, but the user has not generalized it.

Do not turn a fact correction into taste. Do not turn a proposed but rejected fix into a preference. Do not infer a stable rule from one local edit.

## Decide the write scope

- Update the affected artifact when the user directly requests the edit.
- Update canon only after explicit confirmation, using `comic-wiki`.
- Keep a one-off choice in the chapter or series.
- Promote a rule globally only when the user explicitly generalizes it or cross-series evidence supports it.
- Record the desired outcome rather than a flawed remedy when professional review replaces the user's proposed fix.

Before persisting feedback or preferences, read `references/preference-protocol.md` completely and then use `../comic-wiki/references/update-protocol.md` for the actual Wiki write.

## Close the loop

After revision:

1. Show how the new version addresses the observed symptom.
2. Check that the fix did not create a new continuity, causality, or information-load problem.
3. State whether feedback became a fact correction, local decision, candidate preference, stable preference, or no stored preference.
4. Preserve dissent: if the user chose against the recommendation, record the known tradeoff and scope, not a false claim that the Agent endorsed the reasoning.
