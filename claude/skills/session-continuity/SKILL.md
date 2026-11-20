---
name: session-continuity
description: Preserve a long-running task across context, process, provider, or machine changes, or write a handoff, with checked state and exact next actions.
---

# Session continuity

An excellent handoff lets a fresh session take the next action within a minute, with the goal, the bar it was climbing toward and every needed identity checked, not remembered.
The active objective, its target and existing authorization survive until their completion or stop conditions apply.

## Resume from the next action

Read the current brief and the latest user correction, and identify the next executable action and its completion check.
Recheck the state that action depends on: checkout and base before editing, current owner and target before a shared write, terminal receipt before consuming a run's output.
Reuse unaffected proof, widening inspection only when records are missing, contradictory or invalidated, then continue.

## Capture a handoff

Update the existing brief at a handoff or material state change, next action first; replace stale status while keeping its predecessor as history, and link supporting records rather than copying them.
With no existing brief, write the handoff to the OS temporary directory, tailored to what the next session will do and the skills it should load, with keys, passwords and personal data redacted.

- Next action, completion check, and exact blocker if any.
- Objective, the bar (best known result, our number, target), user corrections, authority, resource bounds and open choices.
- Checkout, revision, PR, uncommitted files, artifacts, proof and actual adoption state.
- For active execution: owner, run identity, authoritative status, account binding and supported recovery action.
- For cross-machine delivery: origin machine and native thread or session from receipts, with native and Runtime identities kept distinct; missing values stay unknown, and provenance grants no authority.

## Preserve useful work

Keep required artifacts, tool sources, dependency identities and build instructions in durable workspace storage, and for a storage or machine move snapshot parent and worker traces with sizes and hashes.

## Recover missing execution

Reconcile recovered claims with current commits, live identities and task ownership; an old transcript or restored terminal does not establish a running worker.
Use Runtime's maintained recovery path for Runtime-owned assignments, resume a native session only when that harness owns the task and its resume contract permits it, reconcile an uncertain admission before issuing replacement work, and give a new experiment or changed profile an immutable successor.
When restoring a fleet, recover one worker first and verify it executes and uses a retained artifact before restoring authorized concurrency.

## Log the run

```bash
skill-run-log /session-continuity --target "<active goal>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A research run needs recovery or a successor | `/operate` | The checked brief and execution owner's records |
| Two valid next actions compete | `/report` | The brief, active objective, and evidence for each action |
| A completion claim remains unproved | `/verify` | The claim and its consumer check |
| Repeated continuity failures need assessment | `/reflect` | The handoffs and retained evidence |
