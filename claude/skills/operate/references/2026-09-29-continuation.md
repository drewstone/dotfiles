# Continuation failures observed on 2026-09-29

This historical record explains the operating rules; its counts are not default settings for future runs.

## Evidence

The retained run root is `/mnt/traces/discovery-runs` on the research host.
Exact run identities are listed below so later readers can inspect the original records.

| Run | Observation | Limit |
|---|---|---|
| `science-iwls-opus-solo-4h-20260929b` | Four root attempts ended after three barren continuations, with `repromptRefusedBy: no-progress` | Its final candidate packet remained outside acceptance |
| `science-mapf-opus-recursive-15m-20260929d` | Four sequential root-to-child revisions produced one executed child and no executed grandchild | Registered recursion did not establish recursive execution |

The IWLS input used Runtime 0.284.1 with an always-false check and no `checkState` measurement.
The run retained changing research artifacts while the continuation record had no measured progress.
Its outside assessment was pending.
Treating that missing assessment as a persistence signal made the configuration unable to represent useful intermediate work.

The MAPF child attempted grandchild spawns, which failed before execution.
Its parent had no recorded consumption of a completed child research report.
Repeated profile revisions therefore established neither independent teams nor successful descendant reuse.

The audit also found that continuation instructions could demand a completion tool absent from the served tool set.
The source correction belongs to Runtime; operator instructions cannot make a missing capability available.

## Consequences

Register calibrated development measurements separately from final acceptance.
Match completion instructions to served capabilities.
Check actual parent edges, execution, and artifact consumption before crediting topology.
Keep source correction, package publication, local installation, and live adoption as separate facts.
