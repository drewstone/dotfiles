---
name: evolve
description: Improve a measured target through causal diagnosis, scoped experiments, verification, and retained results.
---

# Evolve

Use this when a measurable outcome needs improvement through tested changes.
Keep the user outcome, required behavior, and resource limits fixed unless the task authorizes changing them.

## Establish the active comparison

1. Read `.agent/current.json`, `.agent/progress.md`, recent `.agent/experiments.jsonl`, and the project's improvement specification when present.
   Resume active work and retain prior results and rejected approaches.
   Use the project's adopted state locations when they differ.
2. Identify the outcome, completion criteria, and relevant regression limits.
   Store how each metric relates to the user outcome in `metricClaims`.
   Correct an unsupported proxy before optimizing it.
3. Inspect and exercise the existing measurement on the actual execution path.
   Verify its inputs, emitted evidence, tested identity, and error handling.
4. Establish a comparable baseline.
   For noisy measurements or multiple candidates, read [comparison design](references/STATS.md) before choosing samples, stopping, and promotion criteria.
   Reuse baseline evidence only while its execution conditions remain applicable.

## Experiment and decide

Select a causal hypothesis supported by current failures or prior evidence.
Prefer removing unnecessary work before adding mechanisms.
Keep independent experiments isolated; treat coupled changes as one candidate and test their combined behavior.

Make the scoped change, run required checks, and confirm that measurement exercised the changed artifact.
For a deployed experiment, verify the live change and actual routing before interpreting scores.
Validate raw results and preserve failed, missing, and invalid attempts.
Do not tune on hidden decision cases or change thresholds after observing results.

Apply the recorded comparison rule, useful-effect requirement, and regression limits.
Record the supported decision as `KEEP`, `ITERATE`, `ABANDON`, or `REGRESSION`.
Explain uncertainty and distinguish a retained candidate from a change proven suitable for the intended deployment scope.
Revert only the experiment's changes when the decision requires it; preserve evidence and other writers' work.

Continue eligible hypotheses while the objective is unmet and resources remain.
Change the approach when evidence rejects it; rerun an unchanged attempt only to answer a recorded uncertainty.
Stop at the requested outcome, an explicit limit, cancellation, or an evidenced dead end.
Context replacement is a checkpoint, not completion.

## Preserve and report

Before writing experiment records, read [the record schema](schema.md).
Update `.agent/current.json` and `.agent/progress.md`, append `.agent/experiments.jsonl`, and refresh `.agent/scorecard.json` after decisions.
Preserve actual run IDs, commands, artifacts, code/configuration identities, outcomes, costs, and open checks.
For unattended execution, read [durable unattended runs](references/unattended-runs.md) before delegating control to a runner.

Report the before/after results, sample coverage, uncertainty where applicable, regressions, actual resource use, and evidence for the decision.
Label projected savings and unsupported assumptions separately from measured outcomes.

## Log the run

```bash
skill-run-log /evolve --target "<outcome and experiment scope>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Evidence shows the remaining gap requires an architectural change | `/pursue` | The baseline, constraint, and rejected approaches |
| The next useful mechanism is unclear | `/hypothesize` | The goal, prior evidence, and unresolved alternatives |
| A result is null, surprising, or suspect | `/autopsy` | The raw observations and exact command |
| Failures need causal grouping before another experiment | `/diagnose` | The full failure set and baseline |
| Changed scoring conditions invalidate calibration | `/calibrate-before-measure` | The changed path, fixtures, and decision |
| Independent structural candidates warrant automated comparison | `/meta-harness` | The candidates, measurement, and resource limits |
| A proven change is ready for its authorized release | `/ship` | The tested revision, decision evidence, and release scope |
