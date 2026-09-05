---
name: product-innovation-audit
description: Audit a product bet for user value, differentiation, feasibility, risk, and ship decision.
---

# Product Innovation Audit

Decide whether a product improves a specific user's outcome enough to justify adoption, and what should change.
Judge the result users receive before judging the architecture or feature inventory.

## Investigate the product bet

1. Identify the user, triggering job, current substitute, and what would make switching worthwhile.
2. Inspect real usage, support or research evidence, and the product itself.
   Separate observed behavior from claims, plans, and market assumptions.
3. Compare the same job under comparable constraints against credible substitutes, including manual work or no action.
   State differences in access, data, cost, time, and assistance before interpreting the comparison.
4. Identify which capabilities improve the user's result and which consume attention or maintenance without doing so.
5. Recommend keeping, deleting, simplifying, or rebuilding based on that evidence.
   Preserve the current design when it already satisfies the requirement.
6. Name the evidence that could reverse the decision and the smallest useful way to obtain it.

Read [product evidence questions](references/product-evidence.md) when the decision depends on adoption economics, repeat use, or agent behavior beyond a direct product walkthrough.
Choose independent perspectives only when they expose different assumptions and delegation is available and authorized.

## Decision

Report `ship`, `narrow`, `rebuild`, `kill`, or `insufficient evidence`, with the user, job, strongest substitute, evidence, and material uncertainty.
Include the justified changes and the comparison or user observation that would prove their value.
A prototype failure can expose a gap without proving that the entire product category cannot work.
A favorable demo, internal benchmark, or feature count alone does not prove demand or willingness to switch.

Keep investigation and recommendations within the task's authority.
An audit verdict does not itself authorize implementation, customer outreach, or release.
When implementation is requested, complete the justified changes and their checks instead of leaving an unbuilt plan.

## Log the run

```bash
skill-run-log /product-innovation-audit --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The next authorized change concerns visible workflows | `/product-design-audit` | the observed value gap and affected user path |
| An established product metric is below its required target | `/evolve` | the metric, comparable baseline, and proposed change |
| A tested approach cannot meet the required outcome | `/breakout` | the failed mechanism and evidence about the constraint |
| A decision requires measurements missing from the real path | `/ground-truth` | the decision and missing observations |
