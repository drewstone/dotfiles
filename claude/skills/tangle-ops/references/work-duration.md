# Plan long work without repeated observation

Use before a long release or when repeated status checks are displacing delivery.
Read once for the current decision; reuse the result until the workflow, scope, or failure changes.

## Choose the measurement

| Question | Smallest useful read |
|---|---|
| How long does this release workflow usually take? | `tangle-ops timings <repo> <workflow.yml> --branch <target>` |
| Where did this agent execution spend time? | `tangle-ops trace <execution-id>` |
| Are many executions slow? | `tangle-ops trace-stats --hours 6` |
| Is the operator wasting calls? | [Session efficiency](../../reflect/references/session-efficiency.md): inspect one native turn |

For example, ADC's runtime workflow history is `tangle-ops timings adc deploy.yml --branch main`.
Resolve the actual workflow from the repository release path; product-only and runtime releases can have very different costs.
Use `tangle-ops timings adc deploy.yml --help`, or the [command reference](https://github.com/drewstone/tangle-tools/tree/main/tangle-ops#plan-a-long-release-once).

## Interpret the report

The command makes one bounded GitHub GET on a cache miss; subsequent calls reuse a one-hour cache.
It reports its observation time, outcome tally, eligible sample count, p50/p90, histogram and exclusions.
`--json` retains source run IDs and timestamps; `--refresh` is for a changed decision or completed observation window, not a polling loop.

Percentiles use successful first attempts only. Failures, cancellations, reruns and pending runs remain in the tally but cannot shorten the successful-duration estimate.
`created_at` → `updated_at` is reported workflow elapsed, a completion proxy including waits, not execution-only time.
Different workflow inputs can select different stages. Sparse or mismatched history is descriptive evidence, not a promised ETA.
These data do not measure local build time, token cost, money saved, or product correctness.
If unavailable, use the maintained release timeout and record duration unknown; missing timing history is not a new release gate.

## Choose the next action

| State | Action and stopping condition |
|---|---|
| Required local merge gate passed | Merge or enable auto-merge through the authorized path immediately; PR CI is not work to watch. Preserve enforced gates. |
| Long release started | Keep one run ID, artifact, log and terminal result. Start one bounded unattended waiter or completion notification, then continue independent work. |
| No useful independent work remains | Leave a durable checkpoint with the next completion check. End the turn without claiming delivery is complete. |
| Runtime exceeds the relevant historical p90 | Inspect once for an actual queue, blocked approval or stalled stage. An overrun alone does not authorize cancel/retry. |
| Waiter finishes unsuccessfully | Read the exact failed step once and fix its cause. Reuse unaffected proof. |
| Deployment succeeds | Check served identity and use the shipped consumer flow; stop after its acceptance criteria pass. |

Choose the waiter deadline from the maintained runbook and relevant observed durations; p90 is a planning signal, not a kill threshold.
Keep the waiter detached from agent reasoning. Repeated empty tool yields, duplicate status summaries and frequent log tails do not advance a running build.
After a failure or completion, record the actual duration in the existing release receipt; the next history refresh updates the tally without a separate ledger.
