---
name: product-design
description: Design or revise visible product UI with reference-first judgment, real mode-specific controls, low-copy surfaces, and screenshot-based verification.
metadata:
  short-description: Reference-first product UI without label/step slop
---

# Product Design

Use this before creating or revising visible UI.
The interface should do the job, not explain the job.

## Flow

1. Identify the product type, user, primary workflow, and domain expectations.
2. Inspect relevant references or existing design system before inventing a direction.
3. Choose controls that match the task: icons, tabs, toggles, menus, sliders, upload/record, chat/intake, or direct commands.
4. Remove obvious labels, procedural step cards, dead panels, repeated action words, fake readiness states, and decorative clutter.
5. Implement in the app's existing component/style patterns.
6. Verify rendered desktop and mobile screenshots; fix text overflow and visible polish issues.

## Rules

- Mode changes must change the actual component, not just the label.
- Operational tools should be dense, calm, and scannable.
- Product/venue/person pages need real visual assets in the first viewport.
- Do not claim UI quality from a build alone.

Use `references/full-reference.md` for full anti-patterns and detailed design rules.

## Then consider

- `ui-test` for adversarial browser QA.
- `product-design-audit` for a broader redesign pass.
