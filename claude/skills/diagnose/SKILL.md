---
name: diagnose
description: Explain failing, null, surprising, or suspect results, from one run to a failure set, including evaluation-pipeline faults and comparisons that never tested their claim; rank fixes by consequence and reach.
---

# Diagnose

Explain results before choosing fixes, working from raw outcomes and representative traces rather than the aggregate score.
This covers a set of test, CI, benchmark, or evaluation failures; one null, surprising, or suspect run; and a disappointing comparison that may not have tested its claim.

## Reconstruct what ran

1. Identify the actual command, tested code and configuration, model and provider, profile, cases, seeds or repetitions, split, environment, run IDs, artifacts, and expected result.
   Record unavailable identity fields as unknown.
2. Collect the complete results for the requested scope and recompute the headline result from raw rows.
   Reconcile passed, failed, skipped, cancelled, invalid, and missing outcomes with attempted totals.
3. Preserve each case ID, observed symptom, error, score when present, and evidence location.
   Keep service and measurement failures distinct from failures of the product or agent.
4. Confirm that the intended change and inputs reached the measured execution path.
   Inspect no-ops, cached output, missing backends, leakage, saturated scores, and differences between comparison groups.

For an evaluation result, follow it through each stage and use raw rows to locate the first discrepancy:

| Stage | Check |
|---|---|
| Execution | The intended entrypoint, backend, profile, model, and dependencies actually ran |
| Capture | Required calls, actions, state changes, and terminal outcomes have evidence |
| Artifact | Scoring reads the final deliverable the user receives |
| Scoring | Each check has its required evidence and distinguishes acceptable from unacceptable behavior |
| Comparison | Cases, splits, resources, and runtime conditions support the stated comparison |
| Decision | Objective failures and missing evidence cannot become passes through semantic scores or defaults |
| Reporting | Raw outcomes reconcile with the reported classes, denominators, and aggregates |

When package behavior is implicated, inspect its actual implementation and affected callers before changing it.

## Explain and test causes

Group cases by a shared causal explanation, not by filename or error wording alone.
Compare failing and passing cases that exercise the same behavior, and read source where it can locate a cause or explain missing records.
A single severe failure still requires investigation.
Allow multiple contributing causes, but count unique affected cases when reporting totals.

Form competing explanations and run the smallest check whose outcomes would distinguish them.
Read [discriminating checks](references/discriminating-checks.md) when the cause remains unclear.
State the expected change and an observation that would refute each diagnosis.
Repeat stochastic checks according to the observed variation and the decision being made; a fixed number of reruns is not proof of a root cause.

## Check a comparison's claim

When a disappointing or null comparison may not have tested the proposed mechanism, check whether:

1. The task entered the conditions where the design claims an advantage.
2. The claimed mechanism ran and its required events were recorded.
   For a recursive claim, use [the recursive proof requirements](../operate/references/recursive-proof.md).
3. The assessment could distinguish the smallest useful effect.
4. The comparison met its registered resource, sampling, and stopping rules.

When a harder condition could reverse the claimed result, such as scale, ambiguity, dependency depth, recovery, concurrency, or unseen inputs, check whether the user requirement includes it.
If the simple case covers the actual need, retain its result and limit the claim accordingly.
Otherwise design a realistic case that exercises the missing condition with the same environment and resources, calibrate changed cases or scoring, and run the authorized deciding comparison.
Do not increase difficulty merely to make a result fail or justify a complex system.

Preserve the original claim and its limits; do not invent conditions after seeing the result.
A mechanism that cannot execute or costs too much may still fail a feasibility or efficiency requirement.
If a valid comparison excludes the registered useful effect or violates required limits, reject or simplify the design.
If the evidence cannot decide, retain the uncertainty and name the test that would resolve it.
Do not continue defending a design with new, unmeasured explanations.

## Rank and correct

Rank confirmed causes by user consequence, affected scope, recurrence or exposure, and the correction's dependencies.
Include expected effort and operating cost when known; do not let a cheap minor fix outrank a severe integrity defect.
Report uncertain causes separately with the next discriminating check.

When fixes are authorized, correct the earliest shared cause, reproduce the original failure, and rerun the smallest affected case set.
Recompute or rerun every comparison whose conclusion the correction could change, keeping cases and decision thresholds fixed; an intentional redesign is a different comparison.
Preserve the original run and identify conclusions that the correction invalidates.
For an audit-only task, deliver the reproduction and concrete correction without changing the target.

## Report

Use these verdicts:

- `ROOT_CAUSE_CONFIRMED`: the evidence and discriminating check support the explanation for the stated scope.
- `PARTIAL`: some failures are explained; identify those still open.
- `INSUFFICIENT_DATA`: name the missing evidence, resource, or authority and the check required to resolve it.

Distinguish product failure, agent decision failure, execution failure, comparison design failure, measurement failure, service failure, a valid result, and insufficient evidence.
Do not count service, measurement, or missing-evidence cases as demonstrated agent regressions.
A null estimate alone does not prove an effect is absent.

Report inspected coverage, the count in every outcome class, causes with affected case IDs, evidence, fix priority, exact rerun commands, and verification results.
For a service failure, include the failed probe, error or status, affected scope, and recovery action taken or required.
Keep zeros and unknowns visible, and do not present estimated recovered passes as measured results.
For a single run that needs a durable record, write `.agent/autopsies/YYYY-MM-DD-<run-slug>.md` with run identity, sources, recomputed result, explanations tested, check results, and the resulting decision.

## Log the run

```bash
skill-run-log /diagnose --target "<failure set or run>" --verdict <ROOT_CAUSE_CONFIRMED|PARTIAL|INSUFFICIENT_DATA> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Confirmed causes require driving CI to completion | `/converge` | The reproductions, branch, and live checks |
| Valid measurement supports a specific improvement experiment | `/evolve` | The baseline, cause, and testable change |
| The remaining gap requires different mechanisms | `/hypothesize` | The rejected explanations and relevant constraints |
| A required event or segment was never observed on the real path | `/ground-truth` | The missing segment and actual environment |
| Case design or scoring cannot distinguish required behavior | `/eval-engineering` | The affected cases and invalid assumptions |
| The correction belongs in the shared evaluation package | `/agent-eval` | The module, consumers, and failing path |
| The agent ignored state, tools, or user intent | `/agent-behavior-audit` | The trace and missed requirement |
