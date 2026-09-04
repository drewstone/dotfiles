---
name: product-design
description: Design visible product UI from real references, then verify it with browser screenshots.
metadata:
  short-description: Reference-first product UI without label/step slop
---

# Product Design

Use this before creating or revising visible UI.
The interface should do the job, not explain the job.
For public pages, blog/research surfaces, marketing pages, or broad design-system work, read the relevant `docs/anti-patterns/` file before implementing.

## Flow

1. Identify the product type, user, primary workflow, and domain expectations.
2. Inspect relevant references or existing design system before inventing a direction.
3. Choose controls that match the task: icons, tabs, toggles, menus, sliders, upload/record, chat/intake, or direct commands.
4. Remove obvious labels, raw inventory counts, procedural step cards, dead panels, repeated action words, fake readiness states, and decorative clutter.
5. Implement in the app's existing component/style patterns.
6. Verify rendered desktop and mobile screenshots; fix text overflow and visible polish issues.

## Rules

- Mode changes must change the actual component, not just the label.
- Operational tools should be dense, calm, and scannable.
- Product/venue/person pages need real visual assets in the first viewport.
- Blog indexes should organize by reader path: series, topic, date, or argument.
- Research indexes should organize by claim and evidence standard, not by SEO category or product taxonomy.
- Do not market raw inventory counts unless the count is the reader's decision.
- Do not claim UI quality from a build alone.

Use `references/full-reference.md` for execution rules and `docs/anti-patterns/` for durable writing/design doctrine.

## Log the run

On completion, append one line so later analysis can grade this skill:

```bash
skill-run-log /product-design --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| UI is implemented and needs adversarial browser QA | `/ui-test` | the routes + the auth state to exercise |
| ≥3 screens changed or the information architecture moved | `/product-design-audit` | the before/after screenshots + the IA change |
| Screenshots are needed | `/ui-test` | the target URLs + the viewport sizes |
| Design lands in a diff > 200 lines | `/critical-audit` | the diff scope + the components it changes |
