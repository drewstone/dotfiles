---
name: tangle-fleet-mode
description: Coordinate Tangle's active fleet across owned lanes, mergeable deliveries, and the ops board when asked to run fleet mode or mass shipping.
---

# Tangle Fleet Mode

Use this for fleet-wide delivery across existing operators and lanes. The shared [agent rules](../../AGENTS.md) and [work process](../../../docs/processes/agent-work.md) own authority, host limits, verification, and merge requirements; this skill decides what the fleet should work on next. Use `fleet --help`, `ops-board --help`, and each tool's current README for commands and state.

## Choose the work

1. Read the current goal, measured outcome, active board items, lane owners, and release state. Name the hill, its current value, and the number to beat.
2. Find duplicate ownership, blocked dependencies, and completed work still awaiting delivery. Reconcile owners before dispatching.
3. Prefer deleting a dead premise or duplicate path before adding a worker or process. Close an item only after its owner and acceptance evidence support closure.
4. Rank the next delivery cuts by user value, dependencies, risk, and available capacity. A merged PR is activity; check the served or measured outcome before calling a hill improved.

## Dispatch and integrate

Use Fleet's supported messaging path and [delegation brief](../../../docs/processes/agent-work.md#brief-template). Give each independently useful deliverable one owner, scope, authority, resources, evidence, and completion check. Keep dependent decisions with one integrator. Use `orchestrate` when a single deliverable itself needs parallel tracks.

The lead owns the integrated result. Check pickup and terminal outcomes through Fleet's authoritative state. If a lane stops or an account limit changes, reconcile its retained work before replacement. Send only decision-changing updates. Keep each lane's STATUS current with the real Done, In progress, Blocked, and Next; do not refresh timestamps without a state change.

## Finish delivery

For each PR, confirm its stated preconditions, merge base, required local gate, review findings, and release authority. Fix defects forward, merge when requirements are met, and prove the requested consumer outcome through the served path. Leave a PR draft while a named precondition remains unmet. The shared process owns Beelink gating and prohibits force-push, hook bypass, and admin merges without authority.

For recurring cleanup, assign the owner of the producer or resource. Each lane removes only its own finished worktree through `wt-remove` after retention checks; the designated storage owner handles fleet-wide reclaim. Preserve historical evidence while retiring obsolete automation, board items, or instructions.

## Log the run

```bash
skill-run-log /tangle-fleet-mode --target "<fleet goal and delivery cut>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| One deliverable needs dependent or parallel tracks | `/orchestrate` | Owner, brief, dependencies, and evidence contract |
| A measured hill is flat across attempts | `/hypothesize` | The outcome series and limiting constraint |
| Delivery is complete but the outcome remains uncertain | `/report` | Served revision, measured results, and target |
