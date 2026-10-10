---
name: product-design
description: Design, polish, audit, and test product UI from real references and browser evidence, including worst-case data, variants, phones, and site reproduction.
metadata:
  short-description: Reference-first product UI without label/step slop
---

# Product Design

Design or correct the interface around the user's task and verify it in the rendered product.
For a report-only request, deliver findings without changing the product.

## Establish the task

1. Read existing product decisions and unresolved user complaints before changing a surface.
2. Identify the user, primary workflow, domain expectations, existing design system, supported viewports, and relevant auth states.
   Reuse an existing brief; create a durable record only when the work needs one.
3. Inspect relevant real products and prior versions the user liked before choosing a visual direction.
   Extract useful interaction, density, typography, spacing, and media patterns from the evidence.

For public pages, editorial surfaces, marketing copy, or broad design-system work, read the relevant repository `docs/anti-patterns/` guidance before implementation.
For a blog or research index, read [editorial surfaces](references/editorial-surfaces.md) when choosing navigation and evidence presentation.

## Design and implement

1. Choose controls that perform the task directly.
   When a mode changes the input or output type, change the actual controls and behavior accordingly.
2. Remove duplicate navigation, decorative panels, repeated action copy, and states that imply readiness the product has not achieved.
   Keep labels that identify controls or clarify status, risk, units, permissions, or accessibility.
3. Implement with the application's existing components and tokens.
   Read [polish](references/polish.md) for press feedback, materials, typography, foundations, and phone behavior; use `/motion` for animation.

When the user wants to compare directions, or a state model needs checking before it is built, read [variants and prototypes](references/variants.md).

Match density and media to the task.
Operational tools need scannable state and actions; product identity may need a real screenshot, person, place, or artifact.
Counts belong where they help the reader choose or compare.
Prefer familiar, accessible controls over custom decoration.

To reproduce a reference site, capture it at desktop and mobile widths and inspect its live DOM, computed styles, assets, and interaction states.
Implement with the target repository's components and tokens, then compare screenshots at the same viewport and fix visible differences.

## Audit an existing surface

Inspect the live or runnable product in a browser at relevant sizes, states, and supported themes.
Trace consequential displayed values to their data source.
Compare the workflow with the existing design system and relevant real product references.
Evaluate purpose, navigation, hierarchy, density, controls, data, accessibility, and failure handling.
Remove redundant or misleading surfaces and implement the highest-impact justified corrections when edits are in scope.
Compare alternatives where a real design tradeoff remains; do not manufacture alternatives for obvious fixes.

For audits spanning routes or interacting states, read [the audit matrix](references/audit-matrix.md) to track coverage and complaints.

## Test in a real browser

Start or locate the application as the intended user reaches it.
Use available browser tools or the repository's UI test stack, and reuse an authorized test session when needed.
Complete the primary flow, then exercise relevant inputs, loading, empty, error, responsive, and access states.
Read [adversarial patterns](references/adversarial-patterns.md) when selecting boundary cases for forms, navigation, sessions, or dialogs.
Read [worst-case data](references/worst-case-data.md) when stress-testing what a component renders: long and short names, unbreakable strings, empty and huge collections, numbers, dates, and media.
Inspect rendered screenshots and the DOM alongside console and network failures, and check keyboard behavior and focus for changed interactive controls.

Use authorized test accounts and disposable data for submissions that mutate state.
Keep auth credentials out of screenshots, logs, and shared artifacts.
A failure report needs the route, viewport, initial state, steps, expected behavior, actual behavior, impact, and screenshot or DOM evidence.

## Evidence and completion

Click through the changed flow and inspect desktop and mobile screenshots, supported themes, focus states, and text fit as relevant.
Fix observed regressions before reporting quality.
Reopen the original failing paths after a fix; a complaint or defect is fixed only when the rendered evidence shows the intended result.

Marketing product views must be real, faithful representations or clearly conceptual diagrams.
Sparse data does not justify fabricated activity or readiness.
A successful build or unit-test result does not establish usable interactions or visual quality.
Complete the requested improvements; a numerical design score is not a completion criterion.
If deployment is part of the request, also verify the served revision and live user path.

Report the observed problems, decisions, changed files, before/after screenshots or browser artifacts, tested flows and states, checks, and remaining limitations.

## Log the run

```bash
skill-run-log /product-design --target "<what this run targeted>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Evidence questions the product value rather than UI execution | `/product-innovation-audit` | the workflow and unresolved user value |
| A reproduced defect needs deeper source investigation or review | `/critical-audit` | the reproduction, diff, and behavior to preserve |
| Browser work passes and required non-UI checks remain | `/verify` | the verified flows and remaining checks |
| The change adds or reviews animation or gesture motion | `/motion` | the components and interactions |
