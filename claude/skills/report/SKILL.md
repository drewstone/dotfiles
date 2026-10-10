---
name: report
description: Research a question from primary sources, or answer analytical, status, fleet, or play questions from checked evidence with uncertainty and a decision.
---

# Report

Answer the user's decision with checked data.
Beyond a one-fact answer, follow the [hillclimb loop](../../../docs/processes/hillclimb.md): name the hill, measure the population, try to break the headline, think bigger, show it, and score it.
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

## Research a question

Derived from mattpocock/skills research (MIT).

Answer from primary sources: official documentation, source code, specifications, and first-party APIs.
Trace each claim to the source that owns it and cite it.
When the user wants a durable note, write one Markdown file where the repository keeps such notes and say where.
Delegate the reading to a background worker only when delegation is available and the user can keep working.

## Questions about active research and fleets

Translate the question into the decision the user needs, then inspect the relevant records:

- For activity, inspect authoritative liveness, invocations, terminal records, and the latest meaningful action.
- For progress, inspect retained artifacts, checks, changed decisions, and unresolved claims.
- For topology, inspect actual parent edges, executed children, and artifact consumption.
- For resources, inspect measured usage, elapsed time, concurrency, capacity, and explicit unknowns.
- For capability, distinguish current source, installed packages, and observed behavior on the active route.

A registration establishes intent, a process establishes activity, a useful artifact establishes output, and an independent check establishes only the claim it tested.
Keep those statements separate, and distinguish agent-authored claims, observed events, independent findings, and analyst interpretations where the difference matters.
Repeated tool calls or tokens alone do not establish progress, and an unknown outside assessment does not establish its absence.
Preserve the original acceptance criteria and report stricter interpretations separately.

Lead with what is happening, what useful work exists, and what remains uncertain.
Say plainly when the fleet is idle, and name the actual stop cause and the corrective action already underway.
Recommend the smallest action that can resolve the important uncertainty or advance useful work, and continue actions the active task already authorizes.
Respect current ownership, resource limits, and uncertain admissions before launching replacements.

Read [the fleet review register](references/fleet-review.md) for recurring fleet reviews or a broad research audit.
Read [topology and resources](references/topology-and-resources.md) for collaboration, recursion, efficiency, model, or account questions.
Read [trace workflows](references/trace-workflows.md) when the answer depends on what agents did, why they changed course, or how work moved between them.

## Report a play

For a play, one press of start with several agents working one problem, start from its readout and keep its order.
Read [play reports](references/play.md) for the readout order and the rules that separate the system's own behavior from what the harness and the operator did to it.

## State what the evidence supports

Lead with the answer or correction to the premise and the decision-relevant measurement when one exists.
Disclose material resource, sampling, execution, or termination differences before declaring a comparative winner.
Distinguish observed results from causal interpretation and projected benefits.
A correlation alone does not establish a mechanism, and an unavailable number is not permission to invent one.

Use tables for comparable rows and dimensions.
For an answer with more than one dimension, build it with the [brief kit](references/brief-kit.md) and publish it as an artifact; use the project's existing rendering path when it has one.
Keep all measured fields available in the report or its complete linked results, rather than presenting only favorable columns.
Explain necessary technical terms through their effect on the decision, and keep internal identifiers in evidence links unless the identity itself answers the question.

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
| A result remains null, surprising, or suspect, or failures need causal grouping | `/diagnose` | The raw rows, computation, and candidate causes |
| A measured gap has an authorized improvement to test | `/evolve` | The baseline, mechanism, and required outcome |
| A required conclusion lacks observation of the actual path | `/ground-truth` | The missing segment and execution boundary |
| The finding requires operating an authorized run | `/operate` | Current state, bounds, and the next action |
