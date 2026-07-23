---
name: ui-test
description: Test product UI in real browsers for workflow, visual, auth, responsive, and usability defects.
---

# ui-test

Test the UI like a skeptical user, not like the author.
Use real browser runs and keep evidence for every failure.

## Flow

1. Identify the changed or risky surfaces from git diff, routes, components, screenshots, and product claims.
2. Start or locate the app exactly as a user would reach it.
3. Plan tests across functional behavior, adversarial inputs, responsive layout, empty/error/loading states, and visual polish.
4. Execute with `bad run`, Playwright, or the repo's UI test stack; use `bad auth` when login state is required.
5. Inspect screenshots/DOM for visual defects, not only pass/fail text.
6. Fix obvious UI, lint, test, and flakiness problems encountered along the way.
7. Re-run the failing path and include artifact paths in the report.

## Evidence Standard

A UI bug report needs route, viewport, steps, expected behavior, actual behavior, screenshot or DOM evidence, and severity.
A fix is not proven until the original failing user path passes in the rendered app.

## Commands And Templates

Use `references/full-reference.md` for the old full execution guide and report examples.
Use existing reference files for adversarial patterns, CI workflow, and eval recipes.

## Then consider

- `bad` when you need lower-level browser automation help.
- `product-design-audit` when failures point to broader product design problems.
