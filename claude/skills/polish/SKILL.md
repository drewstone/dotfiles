---
name: polish
description: Apply a fixed quality rubric and fix gaps in behavior, design, tests, and public APIs.
---

# Polish

Improve implemented work against explicit quality criteria.
Use evidence to decide which gaps matter, and leave sound work unchanged.

## Assess and improve

1. Compare the artifact with the user's request and the repository's requirements.
2. Assess correctness, design, robustness, tests, and public interfaces where they apply.
   State what each criterion means for this artifact before judging it.
3. Inspect or run the check that can expose a failure of that criterion.
   For docs, skills, or unfamiliar artifact types, read [check examples](references/RUBRIC.md) when selecting suitable evidence.
4. Rank confirmed gaps by the consequence for users and callers.
   Fix actionable gaps within scope, then repeat the affected checks and required repository validation.
5. Finish when the applicable criteria pass, or report a specific unresolved requirement and what prevents its completion.

A failing test or missing requested behavior is work to resolve within scope, not a reason to end an authorized implementation task.
An introduced regression takes priority over further polish.
Avoid changes that only restate code, rename working concepts, or impose a preferred architecture without a demonstrated benefit.

## Evidence and result

Use `PASS`, `FAIL`, `UNCHECKED`, or `N/A` for each criterion.
A pass needs a cited check and its result; inspection is valid evidence when it directly tests the requirement.
Keep unchecked work distinct from a proven failure.
State why a criterion does not apply.

Report the applicable criteria, evidence, fixed gaps, remaining user impact, and uncertainty.
Use measured quantities when available and label estimates.
A quality verdict does not authorize a release.

## Log the run

```bash
skill-run-log /polish --target "<target>" --verdict <VERDICT> --next /<skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The criteria pass and an authorized release remains | `/ship` | the verified revision, target, and checks |
| A gap requires an authorized architectural change | `/pursue` | the failed requirement and evidence |
| Required checks remain red | `/converge` | the failing checks |
| A measured product outcome remains below its target | `/evolve` | the metric, baseline, and target |
| A visible workflow needs broader design work | `/product-design-audit` | the route, user task, and screenshots |
