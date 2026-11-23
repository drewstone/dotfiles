---
name: report
description: Research a question from primary sources, including sourcing open research problems, or answer analytical, product bet, status, fleet, or play questions from checked evidence with uncertainty and a decision.
---

# Report

Start with the finding or decision the reader needs. Give the evidence that supports it and identify uncertainty that changes its interpretation.

## Get the evidence

Query the actual artifacts before concluding, recording source, dates, scope, command and units.
Recompute totals and reconcile parts with the whole, keeping denominators, zeros, nulls and exclusions, and unavailable data apart from inspected data with no event; report distributions with uncertainty when sampling matters ([multi-run analysis](references/multi-run-analysis.md)).

## Research a question

Derived from mattpocock/skills research (MIT).

Answer from primary sources (official documentation, source code, specifications, first-party APIs, papers' methods sections), citing the source that owns each claim; research a product exists to do belongs to that product ([AGENTS.md](../../AGENTS.md)).
For a product bet's ship, narrow, rebuild or kill decision, read [product bet review](references/product-bet.md).
For open research problems, separate what the source states from gaps you infer, and record for each candidate the decision its solution would change and the check that could reject it, after checking prior art.

## Questions about active research and fleets

A registration establishes intent, a process establishes activity, a useful artifact establishes output, and an independent check establishes only the claim it tested.
Keep those apart, recommend the action with the largest effect on the outcome with the cheapest check that could refute it, and continue actions the task already authorizes.
Read [active research and fleets](references/fleet-review.md) for what to inspect, recurring fleet reviews and broad research audits.

## Report a play

For a play, one press of start with several agents working one problem, start from its readout and keep its order; read [play reports](references/play.md) for the rules that separate the system's behavior from what the harness and operator did to it.

## State what the evidence supports

Match the format to the reader’s decision. A surprising conjecture can be explained with its motivating observation, a proposed mechanism and the evidence that could distinguish it from alternatives. A comparative result needs the baseline, actual resources, selection and exclusions. Show a table or chart when it communicates the evidence better.

A project tracking a measured improvement can use [the climb](../../../docs/processes/climb.md). For a commissioned quantitative operator review, the [review standard](references/operator-review.md), [brief kit](references/brief-kit.md) and `brief-judge` are available. Use the judge when its assessment will inform a decision about the report.

## Log the run

For a project tracking reports, record the outcome with `skill-run-log /report --target "<question>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /stop`.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A result is null, surprising or suspect, or lacks observation of the actual path | `/diagnose` | the raw rows, computation and missing segment |
| A measured gap has an improvement to test, or a tested mechanism cannot meet the outcome | `/evolve` | the baseline, bar and evidence about the constraint |
