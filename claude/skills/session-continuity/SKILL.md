---
name: session-continuity
description: Preserve a long-running task across context, process, provider, or machine changes with checked state and exact next actions.
---

# Session continuity

Use this when checked task state must survive context, process, provider, or machine replacement.
The active objective and existing authorization survive until their completion or stop conditions apply.

## Resume from the next action

Read the current brief and latest user correction; identify the next executable action and its completion check.
Recheck the state that action depends on: checkout and base before editing, current owner and target before a shared write, terminal receipt before consuming a run's output.
Reuse retained guidance and unaffected proof. Expand inspection when those records are missing, contradictory, or invalidated by changed inputs.
Continue the action; an ordinary project switch needs only its relevant saved state.

## Capture a handoff

Update the existing brief at a handoff or material state change; put the next action first.
Replace stale current status while retaining its predecessor as history. Link supporting records rather than copying them.

- Next action, completion check, and exact blocker if any.
- Objective, user corrections, existing authority, resource bounds, and unresolved choices.
- Relevant checkout, revision, PR, uncommitted files, artifact, proof, and actual adoption state.
- For active execution: owner, run identity, authoritative status, account binding, and supported recovery action.
- For cross-machine delivery: origin machine, native thread/session from receipts; keep native and Runtime identities distinct. Missing values remain unknown; provenance grants no authority.

## Preserve useful work

Retain required candidate artifacts, tool sources, dependency identities, and reproducible build instructions in durable workspace storage.
Keep disposable scratch intermediates separate.
For a storage or machine move, snapshot affected parent and worker traces with sizes and hashes; record missing workers, preserve source paths, and use supported relocation.

## Recover missing execution

Resolve an unfamiliar installed trace tool and its help before selecting a parser.
Use deterministic records before bounded model analysis.
Reconcile recovered claims with current commits, live identities, and task ownership.
An old transcript or restored terminal does not establish a running worker.

Use Runtime's maintained recovery path for Runtime-owned assignments.
Resume a standalone native session only when that harness owns the task and its resume contract permits it.
Verify account binding and workspace identity without exposing credentials.
Reconcile an uncertain admission before issuing replacement work.
Preserve terminal records; a new experiment or changed profile needs an immutable successor.

Recover one worker first when restoring a fleet after failure.
Verify execution, capture, and use of a retained artifact or tool before claiming continuity.
Then restore authorized concurrency within current capacity.

## Continue

Continue already-authorized work when the environment supports it.
A terminal run can leave the broader objective unfinished.
State a specific missing capability or authority when it prevents the next action.
Keep pending outside assessment separate from measured research progress.

## Log the run

```bash
skill-run-log /session-continuity --target "<active goal>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A research run needs recovery or a successor | `/operate` | The checked brief and execution owner's records |
| Two valid next actions compete | `/governor` | The brief and active objective |
| A completion claim remains unproved | `/verify` | The claim and its consumer check |
| Repeated continuity failures need assessment | `/reflect` | The handoffs and retained evidence |
