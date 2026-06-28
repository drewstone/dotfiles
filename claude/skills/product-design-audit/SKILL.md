---
name: product-design-audit
description: Product UI audit/redesign for apps, dashboards, workflows, marketing pages, fake components, visual slop, information architecture, copy hierarchy, and rendered proof.
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

- `ui-test` for adversarial browser QA after redesign.
- `product-innovation-audit` if the issue is product strategy, not UI execution.
