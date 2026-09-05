---
name: operate
description: Launch, inspect, steer, resume, and settle a discovery run while the profiled system performs the research.
---

# Operate

Operate the discovery system while independent checks judge its research.
Keep execution assistance separate from contributions to the research result.

## Before launch or resume

Read the active assignment, existing run records, resource limits, and acceptance criteria.
Confirm that the criteria can reject a realistic bad result.
For every claimed mechanism, identify an observable event.
Read [the recursive proof requirements](../discovery-lead/references/recursive-proof.md) when the run claims recursion, learning, artifact reuse, or recovery.

Keep ownership visible:

- The operator and shared execution stack produce execution state, identities, traces, cost, failures, and recovery records.
- The profiled system produces claims about the research subject.
- Independent checks decide acceptance and comparison.

Label operator interventions and their effects.
Do not present an operator-supplied answer or synthetic assessment fixture as a system discovery.

## While running

1. Inspect authoritative execution state before acting.
   Silence, age, and a quiet stream do not prove that a run has died.
2. Dispatch eligible, nonduplicate work within the active limits when it advances the objective.
   Use stable assignment keys so recovery cannot repeat completed work.
3. Observe progress before steering.
   Use recorded drift, a missed artifact, or a stalled approach to justify an intervention.
4. Resume durable work after context or process replacement without requiring the user to restate the active goal.
5. Preserve partial artifacts and rejected, failed, and interrupted attempts.

Stop research at checked success, an explicit resource limit, user cancellation, or a demonstrated dead end.
A dead end requires evidence rejecting the eligible approaches or showing that the remaining approaches need unavailable resources or authority.
A bounded transport poll returns control; it does not settle the research objective.

## At settlement

Report execution facts and assessment results separately from research findings.
Include attempts, missing evidence, resource asymmetries, and unmatched comparisons before a comparative verdict.
Identify which claimed mechanisms ran and which conclusions the evidence supports.
Do not claim a mechanism's quality advantage from a run in which it did not execute.

## Log the run

```bash
skill-run-log /operate --target "<pursuit/campaign>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A run is null, surprising, or suspect | `/autopsy` | The run ID and raw artifacts |
| Several runs may share a failure cause | `/diagnose` | The full failure set and confirmed examples |
| A claimed execution event cannot be observed | `/ground-truth` | The missing event and actual execution path |
| A worker ignored state, tools, or user intent | `/agent-behavior-audit` | The trace and missed requirement |
| The proof passed and a comparison is ready | `/arena-experiment` | The cases, arms, and resource contract |
