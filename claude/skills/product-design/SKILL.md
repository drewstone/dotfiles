---
name: product-design
description: Design, polish, audit, and test product UI from real references and browser evidence; use for variants, phones, site reproduction, animation, gestures, and worst-case data.
metadata:
  short-description: Reference-first product UI without label/step slop
---

# Product design

Excellent product design lets the user finish the task faster than in the best product of its kind, on a phone as well as a desktop, with every pixel earning its place, and the rendered screen proves it.

## Set the bar

Before choosing a direction, [set the bar](../be-ambitious/SKILL.md#set-the-bar): the best product anyone ships for this workflow (named, with screenshots you captured), our measured number for the task (time to complete, steps, conversion or error rate), the target that beats the reference, and the recorded flow that will show it.
When reaching it needs a new flow, layout or interaction model rather than polish, redesign it.

## Establish the task

1. Read the product's design bible first when it has one, following its links for tokens, type and control scale, and surfaces and states; it owns shared principles, motion, interaction and acceptance, and this skill owns the procedure.
2. Read existing product decisions and open complaints, and identify the user, primary workflow, design system, supported viewports and auth states.
3. Extract interaction, density, typography, spacing and media patterns from the reference products and the prior versions the user liked.

For public pages, marketing copy or broad design-system work, read the repository's `docs/anti-patterns/` first; for a blog or research index, read [editorial surfaces](references/editorial-surfaces.md).

## Design and implement

1. Choose controls that perform the task directly; when a mode changes input or output type, change the controls with it.
2. Build with the application's components and tokens, reading [polish](references/polish.md) for detail and phone checks and [motion](references/motion.md) for animation or gestures.
3. Cut taglines and redundant labels. Keep control names and check first use, ordinary use and recovery against the [setup narration examples](../../../docs/anti-patterns/product-design.md#setup-narration).

For a major redesign, a comparison of directions, or a state model to check before building, read [variants and prototypes](references/variants.md).
To reproduce a reference site, capture it at desktop and mobile widths with its DOM, computed styles, assets and interaction states, rebuild it with the target's components and tokens, and fix every visible difference at the same viewport.

## Audit an existing surface

Inspect the running product at relevant sizes, states and themes, trace displayed values to their source, and judge purpose, navigation, hierarchy, density, controls, data, accessibility and failure handling against the references; read [the audit matrix](references/audit-matrix.md) for audits across routes or interacting states.
Remove redundant or misleading surfaces and build the highest-impact corrections.

## Test in a real browser

Reach the application as the intended user does, with test accounts and disposable data, and keep credentials out of screenshots and logs.
Complete the primary flow, then inputs, loading, empty, error, responsive and access states ([adversarial patterns](references/adversarial-patterns.md) for forms, navigation, sessions and dialogs; [worst-case data](references/worst-case-data.md) for long names, unbreakable strings, huge collections, numbers, dates and media).
Inspect screenshots, the DOM, console and network failures, and keyboard focus for changed controls; a failure report gives route, viewport, state, steps, expected and actual behavior, and evidence.

## Evidence and completion

A complaint is fixed only when the reopened original path shows the intended result on desktop and mobile, in every supported theme.
Use the bible's acceptance contract for verdicts and [UI evidence](../../../docs/anti-patterns/ui-evidence.md) for capture and privacy; keep observable behavior, independent craft review and target-user results separate, and mark missing proof UNCHECKED.
Report before and after recordings and the task metric against the bar; a report-only request changes nothing.

## Log the run

```bash
skill-run-log /product-design --target "<what this run targeted>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Evidence questions the product value rather than UI execution | `/report` | the workflow and unresolved user value; use its product bet review |
| A reproduced defect needs deeper source investigation or review | `/critical-audit` | the reproduction, diff and behavior to preserve |
| Browser work passes and required non-UI checks remain | `/verify` | the verified flows and remaining checks |
