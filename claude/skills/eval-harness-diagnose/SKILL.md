---
name: eval-harness-diagnose
description: Trace suspect evaluation results through execution, evidence capture, scoring, comparison, and reporting.
---

# Diagnose evaluation results

Use this when an evaluation result may reflect broken measurement, service failure, or an invalid comparison.

## Reconstruct the run

Identify the actual command, code/configuration, model/provider, profile, cases, seeds or repetitions, split, environment, run ID, and artifacts.
Record unavailable identity fields as unknown.
Collect case status, score and reasons, objective and semantic check results, final deliverable, trace coverage, usage, timing, retries, and errors.
Reconcile case and call records with attempted totals.

## Follow the result

| Stage | Check |
|---|---|
| Execution | The intended entrypoint, backend, profile, model, and dependencies actually ran |
| Capture | Required calls, actions, state changes, and terminal outcomes have evidence |
| Artifact | Scoring reads the final deliverable the user receives |
| Scoring | Each check has its required evidence and distinguishes acceptable from unacceptable behavior |
| Comparison | Cases, splits, resources, and runtime conditions support the stated comparison |
| Decision | Objective failures and missing evidence cannot become passes through semantic scores or defaults |
| Reporting | Raw outcomes reconcile with the reported classes, denominators, and aggregates |

Use raw rows to locate the first discrepancy.
Read source to explain that stage or determine which missing evidence must be captured.
When package behavior is implicated, inspect its actual implementation and affected callers before changing it.

## Classify and correct

Distinguish product failure, agent decision failure, measurement failure, service failure, and inconclusive evidence.
Assign a primary explanation where the evidence supports one and retain contributing causes.
Do not count service, measurement, or missing-evidence cases as demonstrated agent regressions.

State the expected change and an observation that would refute the diagnosis.
When fixes are authorized, correct the earliest shared cause and rerun the smallest affected case set.
Recompute or rerun every comparison whose conclusion the correction could change.
Keep cases and decision thresholds fixed for that verification; identify any intentional redesign as a different comparison.

## Report

Give the inspected coverage, count in every outcome class, cause and affected case IDs, evidence, exact rerun commands, and verified conclusions.
Retain zeros and unknowns.
For a service failure, include the actual failed probe, error/status, affected scope, and recovery action taken or required.

## Log the run

```bash
skill-run-log /eval-harness-diagnose --target "<evaluation and runs>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The correction belongs in the shared evaluation package | `/agent-eval` | The module, consumers, and failing path |
| Case design or scoring requirements must change | `/eval-engineering` | The affected cases and invalid assumptions |
| Valid measurement exposes a product or agent improvement | `/evolve` | The corrected baseline and proposed change |
| The failure spans work outside evaluation | `/diagnose` | The failure set and confirmed causes |
| Valid results need a comparative explanation | `/report` | The complete rows and integrity checks |
