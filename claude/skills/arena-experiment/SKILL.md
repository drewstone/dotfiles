---
name: arena-experiment
description: Compare agent architectures on paired tasks with equal actual resources, observable mechanisms, full costs, and a registered stopping rule.
---

# Arena experiment

Use this to learn where one agent organization beats another.
Run `calibrate-before-measure` before any paid pilot; it is the required guard for this comparison.

## Register the claim

Write one falsifiable statement:

```text
At equal actual resources, A improves outcome Y over B when task property D reaches L because mechanism M fires.
```

Register:

- every arm and the low-coordination control;
- the task property and levels that vary;
- model, tools, prompts, environment, and limits held constant;
- primary outcome and smallest useful change;
- the event that proves mechanism M fired;
- invalid-run rules, analysis, stopping, and failure rules.

## Use one execution path

Read current package exports before adding code.
Use the same Runtime runner, task environment, records, split, and assessment for every arm.
An architecture is an arm, not a separate benchmark implementation.

Pair arms on the same fresh task and environment state.
Keep development cases separate from held-back cases.

## Equalize and report actual resources

Use one conserved resource definition across arms.
Record both the limit and actual use:

- model calls, input/output tokens, and model cost;
- root, worker, and coordination work;
- wall time, retries, tool calls, and failures;
- completed, invalid, and unmatched cases.

Equal call counts are not equal resources when calls differ in tokens, models, or worker fan-out.

## Analyze every row

Choose repetitions from the registered useful effect and pilot variance.
For every arm and difficulty level, report:

- outcome with uncertainty;
- paired wins, losses, and ties;
- mechanism activation counts;
- tokens, cost, and latency distributions;
- coordination share of spend;
- failures, missing fields, invalid runs, and unmatched attempts.

Inspect raw rows before interpreting a null or a large win.
Correct for multiple comparisons when the design tests several arms or levels.

## Completion

State where rankings change, whether held-back cases preserve the result, whether the claimed mechanism explains it, and what the extra outcome costs.
A single aggregate score is insufficient.

## Log the run

```bash
skill-run-log /arena-experiment --target "<architectures and task family>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Calibration could not distinguish the required behavior | `/eval-engineering` | the cases, scores, and scoring path |
| A result is null, suspect, or unexpectedly large | `/autopsy` | every paired row and the pilot variance |
| A claimed mechanism or regime was absent | `/dont-collapse-the-architecture` | the activation record and regime axis |
| The registered stopping rule is satisfied | `/report` | all rows, every measured field, and resource accounting |
