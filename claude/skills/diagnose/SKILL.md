---
name: diagnose
description: Explain a set of test, CI, benchmark, or evaluation failures and rank fixes by consequence and reach.
---

# Diagnose

Use this when a failure set needs causal explanation before choosing fixes.
Work from raw outcomes and representative traces, not just the aggregate score.

## Establish the failure set

1. Identify the command, tested revision/configuration, environment, run IDs, and expected behavior.
2. Collect the complete results available for the requested scope.
   Reconcile passed, failed, skipped, cancelled, invalid, and missing outcomes with attempted totals.
3. Preserve each case ID, observed symptom, error, score when present, and evidence location.
   Keep service and measurement failures distinct from failures of the product or agent.
4. Compare failing and passing cases that exercise the same behavior.
   Read source where it can locate a cause or explain missing records.

## Explain and rank

Group cases by a shared causal explanation, not by filename or error wording alone.
Use a representative failure and a counterexample to test each proposed cause.
A single severe failure still requires investigation.
Allow multiple contributing causes, but count unique affected cases when reporting totals.

For each proposed cause, run a check that could refute it.
Repeat stochastic checks according to the observed variation and the decision being made.
A fixed number of reruns is not proof of a root cause.

Rank confirmed causes by user consequence, affected scope, recurrence or exposure, and the correction's dependencies.
Include expected effort and operating cost when known; do not let a cheap minor fix outrank a severe integrity defect.
Report uncertain causes separately with the next discriminating check.

## Verify corrections within scope

When fixes are authorized, correct the earliest shared cause, reproduce the original failure, and check affected callers or cases.
Broaden verification when the shared cause could change additional outcomes.
For an audit-only task, deliver the reproduction and concrete correction without changing the target.

Use these verdicts:

- `ROOT_CAUSE_CONFIRMED`: the evidence and discriminating check support the explanation for the stated scope.
- `PARTIAL`: some failures are explained; identify those still open.
- `INSUFFICIENT_DATA`: name the missing evidence and the check required to obtain it.

Report coverage, causes, affected case counts, evidence, fix priority, and verification results.
Keep zeros and unknowns visible.
Do not present estimated recovered passes as measured results.

## Log the run

```bash
skill-run-log /diagnose --target "<failure set>" --verdict <ROOT_CAUSE_CONFIRMED|PARTIAL|INSUFFICIENT_DATA> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A suspect individual run still needs explanation | `/autopsy` | The run ID and unresolved alternatives |
| Evaluation execution, capture, or scoring caused the failures | `/eval-harness-diagnose` | The cases and first failing stage |
| Confirmed causes require driving CI to completion | `/converge` | The reproductions, branch, and live checks |
| Valid measurement supports a specific improvement experiment | `/evolve` | The baseline, cause, and testable change |
| The remaining gap requires different mechanisms | `/hypothesize` | The rejected explanations and relevant constraints |
