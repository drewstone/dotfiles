---
name: operate
description: Launch, watch, inject, interrupt, resume, and settle a discovery run while the profiled system performs the research.
---

# Operate

Operate the discovery system from the outermost observer position while the profiled system performs the research.
Observer is a position relative to a run, not a class of agent.
You and the user are the outermost observer; a director is the observer of the fleet it spawns, inside its parent's authority.
Record every observer contribution, at launch and mid-run, separately from what the system discovered.

## Before launch or resume

Read the active pursuit, its existing run records, and the resources it may draw on.
Hand the system sources, resources, and the fixed invariants.
Do not hand it a problem, a decomposition, a team shape, or a research method.
Fix independence, stated unknowns, and immutable evidence, and leave the measurement to the system.
For every claimed mechanism, identify an observable event.
Read [the recursive proof requirements](../discovery-lead/references/recursive-proof.md) when the run claims recursion, learning, artifact reuse, or recovery.

Keep ownership visible:

- The observer and shared execution stack produce execution state, identities, traces, cost, failures, and recovery records.
- The profiled system sources its own problems, organizes itself, finds what is measurable, and produces claims about the research subject.
- Assessment commissioned from outside the authoring lineage decides acceptance and comparison.

Label observer contributions and their effects.
Report a claim traceable to a handed source or an injection as seeded or observer-assisted, never as unassisted discovery.
Do not present an observer-supplied answer or a synthetic assessment fixture as a system discovery.
Only the outermost observer starts or continues a run, and one authorization covers one run until the user records a wider grant.

## While running

1. Inspect authoritative execution state before acting.
   Silence, age, and a quiet stream do not prove that a run has died.
2. Watch through the stack's own records rather than a session's recollection.
   Wait on a journal or event primitive instead of re-reading an unchanged record on a timer.
   Report polling spend as observation cost beside the run's spend.
3. Reach a running system by injection, not by steering.
   No steer into a running root exists today.
   An intervention is an attributed page the system reads, and an injection no node resolved is delivered to a tier, never delivered.
4. Justify an intervention with recorded drift, a missed artifact, or a stalled approach.
5. Treat cancel as a request plus an acknowledgement.
   A per-child kill needs a live acknowledger, so it reaches nothing on a wedged root or a dead runner.
   Use the documented per-leg procedure there, with a receipt for each child.
   Prefer a pause when the run must stay re-enterable.
6. Resume durable work after context or process replacement without requiring the user to restate the active goal.
   Keep assignment identity stable so recovery cannot repeat completed work.
7. Preserve partial artifacts and rejected, failed, and interrupted attempts.

Stop research at checked success, an explicit resource limit, user cancellation, or a demonstrated dead end.
A dead end requires evidence rejecting the eligible approaches or showing that the remaining approaches need unavailable resources or authority.
A bounded transport poll returns control; it does not settle the research objective.

## At settlement

Report execution facts and assessment results separately from research findings.
Commission the assessment from outside the claim's authoring lineage; that lineage never upgrades its own claim.
Include attempts, missing evidence, resource asymmetries, and unmatched comparisons before a comparative verdict.
Identify which claimed mechanisms ran and which conclusions the evidence supports.
Do not claim a mechanism's quality advantage from a run in which it did not execute.
Hand over the artifact with its labels attached, even when its claims remain unassessed.

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
| Real research exercised the mechanisms and a comparison is ready | `/arena-experiment` | The cases, arms, and resource contract |
