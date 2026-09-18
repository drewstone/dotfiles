---
name: ground-truth
description: Establish a measured breakdown on the actual execution path before changing a live system's performance or reliability.
---

# Measure the actual path

Establish what happens in the environment where the behavior matters before choosing a fix.
Use existing observations when they answer the question; add only the missing measurement.

## Establish the baseline

1. Identify the user-visible start and finish, actual deployment boundary, workload, and required outcome.
2. Follow the request through every material stage and dependency.
   Capture execution identities, durations, failures, retries, and resource use relevant to the question.
3. Correlate stage records with the same request or run.
   Distinguish queueing, active work, external waits, and repeated attempts.
4. Measure the complete path from its real caller as well as the internal stages.
   Label environment, observation point, warm/cold conditions, concurrency, sample count, command, and evidence.
5. Reconcile the stage breakdown with total elapsed time and outcomes.
   Account for overlapping spans, clock differences, and missing coverage.
   Do not sum concurrent work or stage percentiles as if they were sequential elapsed time.
6. Check instrumentation overhead and whether the observed workload represents the conditions in the claim.

A local result supports a local claim until the actual environment confirms it.
An unobserved material segment remains a measurement gap; do not assign its cost to the nearest visible stage.

## Prove a reversible test path

Use isolated resources or the project's existing test facility on the required infrastructure.
Verify setup, execution, evidence capture, and cleanup before a broad comparison.
Preserve shared state and stay within the task's existing authority.
If the only available procedure requires unrepeatable shared edits, build the reversible test path before optimizing.

## Identify useful changes

Name the dominant measured cost or failure source and its share of the complete result.
Separate required behavior and supported physical limits from removable work and implementation choices.
Estimate the maximum improvement available from a candidate before spending on it.
Recheck surprising results against raw evidence, including stale routing, caches, missing attempts, and no-op changes.

Report the full breakdown, sample coverage, unexplained remainder, and ranked changes tied to user outcomes.
When measurement cannot answer the question, state the missing segment and the check required to observe it.

## Log the run

```bash
skill-run-log /ground-truth --target "<flow and execution boundary>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A measured removable cost has a testable correction | `/evolve` | The breakdown, baseline, and proposed change |
| Failures need causal diagnosis | `/diagnose` | The complete outcomes and stage evidence |
| The required outcome needs a different constraint or formulation | `/breakout` | The measured limit and required invariants |
| A result remains surprising or suspect | `/autopsy` | The raw observations and exact command |
| The task needs a comparative or analytical report | `/report` | All measured dimensions and execution conditions |
