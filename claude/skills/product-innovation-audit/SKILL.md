---
name: product-innovation-audit
description: Audit a product bet for user value, differentiation, feasibility, risk, and ship decision.
---

# Product Innovation Audit

Use this when the real question is whether the product deserves to exist, can win, or should change shape.
Do not produce a nicer feature list; produce a decision.

## Method

1. Identify the target user, job, current substitute, and what would make them switch.
2. Use the product directly or inspect the closest live artifact; labels and docs are hypotheses only.
3. Compare against real substitutes, including manual workflows and incumbent tools.
4. Map the strongest user-visible capability, the weakest proof point, and the easiest thing to kill.
5. Name the product bet in one sentence: who changes behavior, why now, and why this product.

## Standards

- Be harder on fake differentiation than on missing polish.
- Prefer concrete product moves over strategy language.
- Separate measured product behavior from inferred market judgment.
- If a workflow claim is not visible in the product, treat it as unproven.
- If the current product cannot support the promise, recommend a smaller sharper promise.

## Output

Return:

1. Decision: `ship`, `narrow`, `rebuild`, or `kill`.
2. User-visible thesis.
3. Top 3 proof gaps.
4. Competitive/substitute reality.
5. Kill list.
6. Ship list.
7. One proof loop that would change the decision.

Use `references/full-reference.md` for the full question stack, scoring rubric, and extended report template.

## Log the run

On completion, append one line so later analysis can grade this skill:

```bash
skill-run-log /product-innovation-audit --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The next move is UI or workflow redesign | `/product-design-audit` | the audited flow + the value gap it must close |
| A measurable product metric exists and sits below target | `/evolve` | the metric, its baseline, and the lever |
| Ship decision is NO because the whole category caps below the bar | `/breakout` | the ceiling evidence + the constraint to change |
| The bet cannot be judged without data that is not measured | `/ground-truth` | the decision-relevant metric + the hops to instrument |
