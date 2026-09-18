---
name: meta-harness
description: Compare independently proposed architectural changes against an existing measured baseline and retain the supported improvements.
---

# Meta-harness

Use this when structural alternatives could improve a constrained system and independent proposals are worth testing.
The goal is a useful architectural result, not a quota of variants or generations.

## Establish the comparison

1. Read existing `.agent/meta-harness/` records and active project state.
   Resume eligible work and inspect prior results before proposing another variant.
2. Locate the existing execution and assessment path.
   Create only the missing check needed to assess the required behavior.
3. Define the user outcome, relevant metrics, mechanism observations, regression limits, and resource limits.
4. Read [comparison design](../evolve/references/STATS.md) when sampling, noise, or selection affects the decision.
   Establish an applicable baseline and run a complete small candidate before broad spending.
5. Read [variant state and coordination](references/variant-state.md) when creating or updating the variant store or dispatching independent proposers.

## Propose and compare

Give each proposer the goal, relevant traces, baseline, constraints, prior rejected mechanisms, and a clear edit scope.
Use isolated workspaces for independent implementations, including alternatives that edit the same files.
Require a causal architectural change; parameter tuning alone does not answer this task.

Run each candidate through the same smoke checks, assessment, and required repository checks.
Compare actual resources under the registered protocol, including proposer and coordination work.
Preserve all attempts and raw outcomes, including compilation failures and invalid runs.

Inspect the claimed mechanism and regressions before retaining a variant.
Keep alternatives that offer supported tradeoffs across required outcomes; do not force incomparable measures into one score.
Test any combination as a new candidate because individually useful changes can interact.
Promote only through one owner after the complete change passes the recorded criteria.

## Settle or continue

Persist lineage, hypotheses, raw results, decisions, and the next eligible action.
Continue under the active goal and limits while evidence supports further work.
Stop at the required outcome, an explicit limit, cancellation, or an evidenced dead end.
A fixed number of unchanged generations does not establish convergence.

Report the accepted change or retained baseline, every measured outcome and cost, rejected mechanisms, and unresolved limits.

## Log the run

```bash
skill-run-log /meta-harness --target "<system and architectural outcome>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The selected architecture has a measured tuning opportunity | `/evolve` | The accepted baseline and next lever |
| Evidence shows the assumed constraint needs reconsideration | `/breakout` | The constraint and tested alternatives |
| A candidate result is null, surprising, or suspect | `/autopsy` | The raw rows and scoring command |
| Surviving architectures need a controlled task comparison | `/arena-experiment` | The candidates, cases, and resource contract |
