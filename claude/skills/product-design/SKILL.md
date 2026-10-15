---
name: product-design
description: Design, polish, audit, and test product UI from real references and browser evidence; use for variants, phones, site reproduction, animation, gestures, and worst-case data.
metadata:
  short-description: Reference-first product UI without label/step slop
---

# Product design

Design or correct the interface around the user's task and verify it in the rendered product.
For a report-only request, deliver findings without changing the product.

## Read the shared owner

For Tangle products, read the [Brand design bible](https://github.com/tangle-network/brand/blob/main/docs/design-bible.md) before local pattern guidance. Follow its implementation-owner links for tokens, type/control scale and surfaces/states. Read the relevant product docs for composition and recovery semantics. Product-design owns execution procedure; Brand owns shared principles, motion, interaction and acceptance.

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
2. Map changed controls and states to the shared components and their existing owners.
3. Implement with the application's existing components and tokens.
   Read [polish](references/polish.md) for detail review and phone checks; read [motion](references/motion.md) when changing animation or gestures.

When the user wants to compare directions, or a state model needs checking before it is built, read [variants and prototypes](references/variants.md).

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

Use the bible's evidence and acceptance contract for Tangle verdicts and [UI evidence](../../../docs/anti-patterns/ui-evidence.md) for capture and privacy procedure.
Keep observable behavior, independent craft review and target-user results separate. Mark missing proof UNCHECKED and scope any NOT APPLICABLE verdict with a reason.
If deployment is part of the request, verify the served revision and live user path.

Report the observed problems, decisions, changed files, before/after screenshots or browser artifacts, tested flows and states, checks, and remaining limitations.

## Log the run

```bash
skill-run-log /product-design --target "<what this run targeted>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Evidence questions the product value rather than UI execution | `/report` | the workflow and unresolved user value; use its product bet review |
| A reproduced defect needs deeper source investigation or review | `/critical-audit` | the reproduction, diff, and behavior to preserve |
| Browser work passes and required non-UI checks remain | `/verify` | the verified flows and remaining checks |
