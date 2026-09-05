---
name: report
description: Answer analytical or status questions from checked evidence, with complete relevant measurements, uncertainty, and a supported decision.
---

# Report

Answer the user's decision with checked data.
Scale the report to the question: a status fact may need a sentence and its check; a comparative study needs its full evidence.
Do not impose a section template on every answer.

## Get the evidence

Query the actual artifacts before writing the conclusion.
Record the source, relevant dates, inspected scope, command or query, and observation units.
Preserve run identities and actual execution configuration when they affect the result.
Separate unavailable data from inspected data that contains no event.

Recompute totals and reconcile parts with the whole.
Include every measured dimension in scope, denominators, zeros, nulls, missing fields, and exclusion reasons.
For collections, report distributions or category counts that expose variation rather than only an average.
Use sample sizes and uncertainty when the conclusion depends on sampling.

Read [multi-run analysis](references/multi-run-analysis.md) when comparing groups, aggregating run records, or decomposing time and cost.

## State what the evidence supports

Lead with the answer or correction to the premise and the decision-relevant measurement when one exists.
Disclose material resource, sampling, execution, or termination differences before declaring a comparative winner.
Distinguish observed results from causal interpretation and projected benefits.
A correlation alone does not establish a mechanism, and an unavailable number is not permission to invent one.

Use tables for comparable rows and dimensions.
Use a chart when its shape clarifies the decision; use the project's existing rendering path when suitable.
Keep all measured fields available in the report or its complete linked results, rather than presenting only favorable columns.

Connect findings to the decision: retain the current system, make the supported change, or run the check needed to resolve uncertainty.
When a bad result needs diagnosis, perform the available check within scope before returning it as unexplained news.
Mention material risks or unanswered questions that could change the decision.
Do not add hypothetical warnings or a forced action list to an already answered status question.

## Log the run

```bash
skill-run-log /report --target "<question and evidence scope>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A result remains null, surprising, or suspect | `/autopsy` | The raw rows and computation |
| A measured gap has an authorized improvement to test | `/evolve` | The baseline, mechanism, and required outcome |
| Failures need causal grouping | `/diagnose` | The complete failure set and candidate causes |
| A required conclusion lacks observation of the actual path | `/ground-truth` | The missing segment and execution boundary |
