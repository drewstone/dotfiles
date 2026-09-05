---
name: push-past-easy
description: Test a relevant harder condition when the current case cannot support the breadth of the claimed result.
---

# Test the missing difficulty

Use this when a harder condition could reverse the conclusion being claimed.
Do not increase difficulty merely to make a result fail or justify a complex system.

## Match the test to the claim

1. State the original claim and the conditions the current case actually tested.
2. Identify the omitted condition that matters to that claim.
   Examples include scale, ambiguity, dependency depth, recovery, concurrency, or unseen inputs.
3. Check whether the user requirement includes that condition.
   If the simple case covers the actual need, retain its result and limit the claim accordingly.
4. Design a realistic case that exercises the missing condition while preserving the relevant environment and resources.
5. State the observation that would establish the mechanism and the outcome that would refute the useful-effect claim.
6. Calibrate changed cases or scoring before broader spending, then run the authorized deciding comparison.

Preserve the original result and show how the added condition changes the conclusion.
Separate a genuine difficulty effect from different resources, broken setup, leakage, or missing evidence.
Use observed variation and the required precision to choose samples; no universal sample count settles every claim.

## Completion

Report the claim, missing condition, case, calibration evidence, raw results, and supported scope.
If no relevant difficulty is missing, state why the existing test is sufficient and leave it unchanged.

## Log the run

```bash
skill-run-log /push-past-easy --target "<claim and added condition>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Changed cases or scoring still need calibration | `/calibrate-before-measure` | The changed path, fixtures, and baseline |
| A valid harder case supports a further experiment | `/evolve` | The baseline, hypothesis, and deciding test |
| The demonstrated gap requires another architecture | `/pursue` | The failed requirement and limiting mechanism |
| The result is null, surprising, or suspect | `/autopsy` | The raw rows and competing explanations |
