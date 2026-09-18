---
name: multi-pursue
description: Build independent architecture tracks concurrently and integrate their checked results.
---

# Multi-Pursue

Use this when an initiative contains independent architecture changes that can be built concurrently.
Keep one coherent design together when its parts depend on each other's decisions.

## Assign complete tracks

Give each track its required outcome, context, owned files, external contracts, relevant source examples, and completion checks.
Fix the constraints other tracks rely on; let the worker choose implementation details within those constraints.
Reserve shared files for one owner or use isolated worktrees with an explicit integration order.

Use available delegation tools and their actual concurrency limits.
Queue remaining independent tracks when all slots are occupied.
Start dependent work after its required input has been checked.
Each requested track must produce the implemented artifact and evidence, or a concrete unresolved condition.

## Integrate and prove

Inspect every returned artifact and check result.
Reproduce consequential findings and test interactions that cross track boundaries.
Combine compatible changes under one owner, resolve conflicting assumptions, and run the checks required by the combined artifact.
Choose, combine, or reject proposals explicitly; parallel summaries do not constitute an integrated result.

Preserve completed work if another track fails.
Retry with corrected inputs or an altered approach when the failure supports it.
Complete authorized delivery for the whole initiative and report each track's final state with the integration result.
Use existing task state for resumable work rather than maintaining a second ledger.

## Log the run

```bash
skill-run-log /multi-pursue --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `pursue` when the remaining work requires one coherent architecture replacement.
- `arena-experiment` when alternative architectures need a controlled comparison.
- `finalize` when completed tracks remain mixed across branches.
- `reflect` when checked outcomes reveal reusable coordination lessons.
