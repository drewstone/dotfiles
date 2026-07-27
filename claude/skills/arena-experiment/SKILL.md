---
name: arena-experiment
description: Compare agent architectures at equal compute using paired executable outcomes and full costs.
---

# Arena Experiment

Use this to learn when one agent organization beats another, such as a single worker, refinement loop, supervisor, or multi-agent policy.
This is not a general capability benchmark.

## Define The Question

State one falsifiable claim:

```text
At equal compute, architecture A improves outcome Y over B once task property D exceeds level L because mechanism M becomes useful.
```

Predeclare:

- the architectures being compared;
- the task property and levels that vary;
- model, tools, prompts, environment, and limits held constant;
- primary outcome and smallest decision-relevant change;
- failure condition for the claim;
- analysis and stopping rule.

Include a low-coordination control where extra organization should not help.

## Reuse Existing Execution

Read current package exports before writing code.
Use the existing runtime benchmark runner, task environment, run records, split logic, and paired statistics.
An architecture is an arm in the same runner, not a separate benchmark implementation.

Build only the missing task generator or difficulty control.
It must be deterministic by seed, resettable, and scored by the same executable outcome for every arm.

## Equalize Compute

Use one conserved budget definition across arms.
Report both the limit and actual use:

- model calls, input and output tokens, and model cost;
- worker work and coordination work;
- wall time, retries, tool calls, and failures;
- number of completed and invalid cases.

Equal call count is not equal compute when calls differ in tokens, models, or worker fanout.

## Calibrate Before Spending

Prove all of these on a small pilot:

1. A known good artifact passes and a realistic bad artifact fails.
2. The simple baseline performs well on the low-coordination control.
3. At least one harder level leaves room for improvement and actually requires the tested coordination behavior.
4. Every arm produces complete run records and cost attribution.

If every arm ties, first test whether the task is saturated or the metric is insensitive.

## Run And Analyze

Pair arms on the same task seed and environment state.
Choose repetitions from the target effect size and observed variance, not a fixed folklore sample count.
Keep development and held-back cases separate.

Report every arm at every difficulty level:

- pass rate or task score with uncertainty;
- paired win, loss, and tie counts;
- critical failures;
- tokens, cost, and latency distributions;
- coordination share of total spend;
- incomplete or contaminated runs.

Correct for multiple comparisons when testing several arms or difficulty levels.
Inspect raw rows before interpreting a null or unexpectedly large result.

## Completion

The result must identify where the ranking changes, whether the change survives held-back cases, what mechanism the traces support, and what the extra outcome costs.
A single aggregate score across all difficulty levels does not answer the question.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| No calibration run recorded for this metric/task pair | `/calibrate-before-measure` | the metric, the trivial baseline, and the good/bad case pair |
| A result is null or the arm delta is inside 2× the noise floor | `/autopsy` | the raw per-cell rows + the measured noise floor |
| Only 1 regime tested and the winner's margin is marginal | `/dont-collapse-the-architecture` | the regime axis + the mechanism the architecture claims to exploit |
| All arms complete with n ≥ 24 per arm | `/report` | the full per-arm table, every measured column, and the equal-compute accounting |
| Winner's bootstrap CI on the delta excludes zero | `/evolve` | the winning architecture as the new baseline + its measured number |

## Log the run

On completion, append one line so `/reflect` and `/governor` can grade this skill later:

```bash
skill-run-log /arena-experiment --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```
