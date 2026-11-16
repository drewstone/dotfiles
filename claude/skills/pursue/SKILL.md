---
name: pursue
description: Build and compare architectural changes against a measured baseline, including independent variants and equal-resource architecture comparisons.
---

# Pursue

Use this when the remaining gap needs a change in architecture.
Deliver the complete authorized change and its comparison with the existing approach.
A working current design may remain the best choice; the goal is a useful architectural result, not a quota of variants or generations.

## Establish the change

1. Read `.agent/current.json`, `.agent/progress.md`, recent experiments, pursuit records, and `.agent/meta-harness/` when present.
   Resume a nonterminal pursuit instead of opening another for the same work.
2. Confirm the required outcome, the measured limitation, and why it arises from the current design.
3. Establish an applicable baseline on the actual execution path, and run a complete small candidate before broad spending.
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

## Compare independent proposals

Use this when structural alternatives could improve a constrained system and independent proposals are worth testing.
Read [variant state and coordination](references/variant-state.md) when creating or updating the variant store or dispatching proposers.

Give each proposer the goal, relevant traces, baseline, constraints, prior rejected mechanisms, and a clear edit scope.
Use isolated workspaces for independent implementations, including alternatives that edit the same files.
Require a causal architectural change; parameter tuning alone does not answer this task.
Run each candidate through the same smoke checks, assessment, and required repository checks, and compare actual resources including proposer and coordination work.
Preserve all attempts and raw outcomes, including compilation failures and invalid runs.

Inspect the claimed mechanism and regressions before retaining a variant.
Keep alternatives that offer supported tradeoffs across required outcomes; do not force incomparable measures into one score.
Test any combination as a new candidate because individually useful changes can interact.
Promote only through one owner after the complete change passes the recorded criteria.
For independent tracks meant to be built and integrated together rather than compared, coordinate them with `/orchestrate`.

## Run a controlled architecture comparison

To learn where one agent organization beats another, register a falsifiable claim, pair arms on the same fresh tasks through one execution path, and equalize and report actual resources.
Calibrate the assessment first with the `/eval-engineering` pre-spend check; it is the required guard for this comparison.
Read [the architecture comparison protocol](references/arena.md) for the registration fields, resource accounting, and per-row analysis.

## Preserve the decision

Write `.agent/pursuits/<date>-<slug>.md` with the constraint, chosen mechanism, alternatives, changes, comparison, check results, and evidence.
Use `ADVANCE`, `PARTIAL`, or `REVERT` for the supported result.
A `PARTIAL` record is a continuation state, not completion of still-authorized implementation or verification.
For proposal comparisons, persist lineage, hypotheses, raw results, decisions, and the next eligible action in the variant store.

Before appending completed comparisons, read [the experiment schema](../evolve/schema.md).
Update progress and current state; preserve the active pursuit while work remains.
After settlement, clear `activePursuit` and set `mode` to the actual next work, using `evolve` when measured improvement continues.
Update accepted baselines only when the recorded decision supports doing so.
Stop at the required outcome, an explicit limit, cancellation, or an evidenced dead end; a fixed number of unchanged generations does not establish convergence.

Report what changed, whether the required outcome improved, every measured outcome and cost, rejected mechanisms, and remaining limits.
Do not substitute a proposal, number of edits, or self-grade for a built and tested result.

## Log the run

```bash
skill-run-log /pursue --target "<goal and generation>" --verdict <PASS|PARTIAL|FAIL> --detail <ADVANCE|PARTIAL|REVERT> \
  --prediction "<number to beat>" --metric "<metric>" --unit <unit> --before <baseline> --after <result> --source <evidence> --next /<skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The accepted architecture has a further measured improvement to test | `/evolve` | The new baseline and proposed change |
| Evidence questions the constraint or target, or the next mechanism is unclear | `/hypothesize` | The limitation, attempted mechanisms, and rejected candidates |
| A result is null, surprising, suspect, or may not have exercised the claimed mechanism | `/diagnose` | The raw observations, command, and execution evidence |
| Independent architecture tracks warrant a coordinated build | `/orchestrate` | The track scopes, shared comparison, and limits |
| The proven change is ready for its authorized release | `/ship` | The revision, checks, and release scope |
