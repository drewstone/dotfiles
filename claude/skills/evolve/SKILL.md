---
name: evolve
description: Improve a measured target through causal diagnosis, scoped experiments, verification, and retained results.
---

# Evolve

Use this when a measurable outcome needs improvement through tested changes.
Keep the user outcome, required behavior, and resource limits fixed unless authorized to change them.

## Establish the comparison

1. Read `.agent/current.json`, `.agent/progress.md`, recent `.agent/experiments.jsonl`, and the improvement specification when present.
   Resume active work and retain prior results and rejected approaches; use adopted state locations when they differ.
2. Identify the outcome, completion criteria, and regression limits.
   Record how each metric relates to the user outcome in `metricClaims`; correct unsupported proxies before optimizing them.
3. Exercise the existing measurement on the real execution path.
   Verify its inputs, evidence, tested identity, and error handling.
4. Establish a comparable baseline.
   For noisy measurements or multiple candidates, read [comparison design](references/STATS.md) before selecting samples, stopping, or promotion criteria.
   Reuse baseline evidence only while its conditions still apply.

## Experiment and decide

Choose a causal hypothesis supported by current failures or prior evidence.
Remove unnecessary work before adding mechanisms.
Isolate independent experiments; test coupled changes together.

Make the scoped change and confirm required checks exercised the changed artifact.
For deployed experiments, verify the live change and routing before interpreting scores.
Preserve failed, missing, and invalid attempts.
Do not tune on hidden decision cases or change thresholds after observing results.

Apply the recorded comparison rule, useful-effect requirement, and regression limits.
Record `KEEP`, `ITERATE`, `ABANDON`, or `REGRESSION` with uncertainty and deployment limits.
Separate retaining a candidate from proving it fits the intended deployment.
Revert only the experiment's changes when required; preserve evidence and other writers' work.

Continue eligible hypotheses while the objective and resource limits permit.
Change approach when evidence rejects it; rerun unchanged work only to resolve recorded uncertainty.
Stop at the requested outcome, an explicit limit, cancellation, or an evidenced dead end.

## Preserve and report

Read [the record schema](schema.md) before changing experiment records.
Update `.agent/current.json` and `.agent/progress.md`, append `.agent/experiments.jsonl`, and refresh `.agent/scorecard.json` after decisions.
Preserve run IDs, commands, artifact and code identities, outcomes, costs, and open checks.
For unattended execution, read [durable unattended runs](references/unattended-runs.md) before transferring control to a runner.

Report before/after results, sample coverage, uncertainty, regressions, resource use, and decision evidence.
Label projections and unsupported assumptions separately from measurements.

## Climb

This skill runs one hill; [the climb](../../../docs/processes/climb.md) runs all of them with one ledger.
- Append each experiment row there with `layer`, `hill`, `prediction` and `outcome`.
- Before optimizing, check the metric's calibration against the goal: one that has saturated or diverged gets fixed first.

## Log the run

```bash
skill-run-log /evolve --target "<outcome and experiment scope>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The remaining gap needs architectural change | `/pursue` | Baseline, constraint, and rejected approaches |
| The next useful mechanism is unclear | `/hypothesize` | Goal, prior evidence, and alternatives |
| A result is null, surprising, or suspect, or failures need causal grouping | `/diagnose` | Raw observations, exact command, and baseline |
| Changed scoring invalidates calibration | `/eval-engineering` | Changed path, fixtures, and decision |
| Independent candidates warrant automated comparison | `/pursue` | Candidates, measurement, and resource limits |
| A proven change is ready for authorized release | `/ship` | Tested revision, decision evidence, and release scope |
