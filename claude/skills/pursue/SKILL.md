---
name: pursue
description: Build and compare a coherent architectural change when evidence shows the current approach limits the required outcome.
---

# Pursue

Use this when the remaining gap needs a change in architecture.
Deliver the complete authorized change and its comparison with the existing approach.
A working current design may remain the best choice.

## Establish the change

1. Read `.agent/current.json`, `.agent/progress.md`, recent experiments, and pursuit records.
   Resume a nonterminal pursuit instead of opening another for the same work.
2. Confirm the required outcome, the measured limitation, and why it arises from the current design.
3. Establish an applicable baseline on the actual execution path.
   Read [comparison design](../evolve/references/STATS.md) when noise, sampling, or candidate selection affects the decision.
4. Consider viable mechanisms, including deleting work or retaining the current design.
   Select from causal evidence and required behavior; record rejected alternatives without inventing a candidate quota or predicted multiplier.
5. Inspect the affected APIs, callers, ownership boundaries, and repository conventions.
   Define the coherent change, acceptance criteria, permitted regressions, resource limits, and a rollback that preserves other work.

## Build and verify

Build the entire authorized behavior, including the dependencies required for it to work.
Treat coupled changes as one candidate; do not claim individual contributions without a test that isolates them.
Remove obsolete paths after checking their callers and contracts.

Review the design and diff in proportion to risk.
Pay particular attention to trust boundaries, payments, creation/deletion, external interfaces, concurrency, and recovery.
Use independent review where competing assumptions or consequential failure modes need another reader.
Resolve findings that would invalidate required behavior before accepting the change.

Run the repository's relevant checks and exercise the actual user flow.
Confirm that measurement ran against the changed artifact; for deployed work, verify the live revision and routing.
Compare with the baseline using the registered criteria.
Include regressions, failed attempts, uncertainty, and actual operating resources alongside gains.

## Preserve the decision

Write `.agent/pursuits/<date>-<slug>.md` with the constraint, chosen mechanism, alternatives, changes, comparison, check results, and evidence.
Use `ADVANCE`, `PARTIAL`, or `REVERT` for the supported result.
A `PARTIAL` record is a continuation state, not completion of still-authorized implementation or verification.

Before appending completed comparisons, read [the experiment schema](../evolve/schema.md).
Update progress and current state; preserve the active pursuit while work remains.
After settlement, clear `activePursuit` and set `mode` to the actual next work, using `evolve` when measured improvement continues.
Update accepted baselines only when the recorded decision supports doing so.

Report what changed, whether the required outcome improved, the comparison evidence, and any remaining limits.
Do not substitute a proposal, number of edits, or self-grade for a built and tested result.

## Log the run

```bash
skill-run-log /pursue --target "<goal and generation>" --verdict <ADVANCE|PARTIAL|REVERT> --next /<skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The accepted architecture has a further measured improvement to test | `/evolve` | The new baseline and proposed change |
| Evidence questions the constraint or target itself | `/breakout` | The limitation and attempted mechanisms |
| A useful alternative mechanism is still unclear | `/hypothesize` | The constraint and rejected candidates |
| Independent architecture tracks warrant a coordinated build | `/multi-pursue` | The track scopes, shared comparison, and limits |
| A result is null, surprising, or suspect | `/autopsy` | The raw observations and command |
| The comparison may not have exercised the claimed mechanism | `/dont-collapse-the-architecture` | The claim and execution evidence |
| The proven change is ready for its authorized release | `/ship` | The revision, checks, and release scope |
