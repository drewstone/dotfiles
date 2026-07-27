---
name: product-design-audit
description: Audit and fix product UI workflows, information structure, states, responsiveness, and polish.
---

# Product Design Audit

Use this to turn broad UI dissatisfaction into concrete product changes.
The output is implemented improvement, not a vibes report.

## Flow

1. Inspect the live product or runnable app in browser at desktop and mobile sizes.
2. Identify the user, job, domain expectations, primary workflow, and competing references.
3. Score navigation, hierarchy, density, controls, states, visual polish, copy, trust, and responsiveness.
4. Remove fake readiness states, decorative panels, repeated action words, and controls that do not match the task.
5. Implement the highest-leverage changes in the app's existing design system.
6. Verify with screenshots or a browser walkthrough; fix visible regressions before reporting.

## Standards

- Operational tools should be dense, calm, and scannable.
- Marketing/product pages must show the real product, person, place, or outcome in the first viewport.
- Controls should use familiar icons, menus, tabs, toggles, sliders, and inputs where appropriate.
- Text must fit its container at mobile and desktop sizes.
- Do not claim design quality from a build alone; inspect the rendered UI.

## Output

Return before/after screenshots or artifact paths, changed files, remaining known issues, and the exact verification command or browser path.
Use `references/audit-matrix.md` for the scoring matrix and `references/full-reference.md` for the old full playbook.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Redesign applied and needs adversarial browser QA | `/ui-test` | the changed routes + the flows to re-run |
| The problem is product strategy, not UI execution | `/product-innovation-audit` | the workflow that has no user + the evidence |
| ≥5 findings and all are small rubric gaps | `/polish` | the finding list + the rubric they fail |
| Fixing requires a new visual direction, not adjustments | `/product-design` | the references to work from + the surfaces to redo |

## Log the run

On completion, append one line so `/reflect` and `/governor` can grade this skill later:

```bash
skill-run-log /product-design-audit --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```
