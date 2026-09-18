---
name: ui-test
description: Test product UI in real browsers for workflow, visual, auth, responsive, and usability defects.
---

# UI Test

Test the requested user flows in a real browser and retain evidence for observed failures.

## Exercise the product

1. Identify the requested or changed routes, risky interactions, supported viewports, and relevant auth states.
2. Start or locate the application as the intended user reaches it.
   Use available browser tools or the repository's UI test stack and reuse an authorized test session when needed.
3. Complete the primary flow, then exercise relevant inputs, loading, empty, error, responsive, and access states.
   Read [adversarial patterns](references/adversarial-patterns.md) when selecting boundary cases for forms, navigation, sessions, or dialogs.
4. Inspect rendered screenshots and the DOM alongside console and network failures.
   Check keyboard behavior and focus for changed interactive controls.
5. Fix confirmed defects when repair is part of the task; keep report-only audits read-only.
6. Repeat the original failing flow after a fix and record the resulting browser evidence.

## Evidence

A failure report needs the route, viewport, initial state, steps, expected behavior, actual behavior, impact, and screenshot or DOM evidence.
Keep auth credentials out of screenshots, logs, and shared artifacts.
Use authorized test accounts and disposable data for submissions that mutate state.
A fix is proven only when the original path passes in the rendered application.

Report tested flows and states, artifact paths, fixed or open defects, and coverage limits.
A build or unit-test result alone does not prove the UI workflow.

## Log the run

```bash
skill-run-log /ui-test --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Observed problems require navigation or workflow redesign | `/product-design-audit` | the user tasks, failed paths, and screenshots |
| A reproduced defect needs deeper source investigation | `/critical-audit` | the reproduction and suspected code |
| Browser work passes and required non-UI checks remain | `/verify` | the verified flows and remaining checks |
