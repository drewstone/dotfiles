---
name: product-design
description: Design visible product UI from real references, then verify it with browser screenshots.
metadata:
  short-description: Reference-first product UI without label/step slop
---

# Product Design

Design the interface around the user's task and verify it in the rendered product.

## Design and implement

1. Identify the user, primary workflow, domain expectations, and existing design system.
2. Inspect relevant real products and prior versions the user liked before choosing a visual direction.
   Extract useful interaction, density, typography, spacing, and media patterns from the evidence.
3. Choose controls that perform the task directly.
   When a mode changes the input or output type, change the actual controls and behavior accordingly.
4. Remove duplicate navigation, decorative panels, repeated action copy, and states that imply readiness the product has not achieved.
   Keep labels that identify controls or clarify status, risk, units, permissions, or accessibility.
5. Implement with the application's existing components and tokens.
6. Click through the changed flow and inspect desktop and mobile screenshots, supported themes, focus states, and text fit as relevant.
   Fix observed regressions before reporting quality.

For public pages, editorial surfaces, or broad design-system work, read the relevant repository `docs/anti-patterns/` guidance before implementation.
For a blog or research index, read [editorial surfaces](references/editorial-surfaces.md) when choosing navigation and evidence presentation.

## Design decisions

Match density and media to the task.
Operational tools need scannable state and actions; product identity may need a real screenshot, person, place, or artifact.
Marketing representations must be faithful to the product or clearly understandable as conceptual diagrams.
Counts belong where they help the reader choose or compare.

Prefer familiar, accessible controls over custom decoration.
A successful build does not establish usable interactions or visual quality.
Report the changed experience and browser evidence, with any remaining limitations.

## Log the run

```bash
skill-run-log /product-design --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Implemented UI needs additional adversarial workflow testing | `/ui-test` | the changed routes and relevant auth states |
| Navigation or workflow problems extend beyond the changed surface | `/product-design-audit` | the user tasks and observed failures |
| The implementation needs an independent correctness review | `/critical-audit` | the diff and behavior to preserve |
