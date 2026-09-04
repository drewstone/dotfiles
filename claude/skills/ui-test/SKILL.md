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
4. Execute directly with Playwright or the repository's UI test stack.
   Reuse an authenticated storage-state file when login is required.
5. Inspect screenshots/DOM for visual defects, not only pass/fail text.
6. Fix obvious UI, lint, test, and flakiness problems encountered along the way.
7. Re-run the failing path and include artifact paths in the report.

## Evidence Standard

A UI bug report needs route, viewport, steps, expected behavior, actual behavior, screenshot or DOM evidence, and severity.
A fix is not proven until the original failing user path passes in the rendered app.

## Commands And Templates

Use `references/adversarial-patterns.md` for adversarial cases.

## Log the run

On completion, append one line so later analysis can grade this skill:

```bash
skill-run-log /ui-test --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| ≥3 failures point to information architecture or workflow, not bugs | `/product-design-audit` | the failing flows + the screenshots |
| ≥1 failure is a code defect inside the PR diff | `/critical-audit` | the reproduction + the suspect file:line |
| All flows pass across the tested breakpoints | `/verify` | the flow list, breakpoints, and screenshot paths |
