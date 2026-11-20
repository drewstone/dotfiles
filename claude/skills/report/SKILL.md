---
name: report
description: Research a question from primary sources, including sourcing open research problems, or answer analytical, product bet, status, fleet, or play questions from checked evidence with uncertainty and a decision.
---

# Report

An excellent report answers the reader's decision in its first sentence with the decisive number, sets that number against the best result anyone has reached, and survived a query that could have refuted it.
Scale it to the question: a status fact needs a sentence and its check, a comparative study its full evidence.

## Set the bar

For analysis, research or a proposal, [set the bar](../be-ambitious/SKILL.md#set-the-bar) before drafting: the best known result for the quantity in question anywhere (a published benchmark, rival product, paper or our ledger's best) with its source, our number beside it, the target a recommendation must reach, and the check that would show it.
Recommend the change that reaches the target even when it is larger than anyone asked about, sized to the outcome and never to a line count.

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

Lead with the answer, or the correction to the premise, and its decisive measurement; a status or review opens with the scoreboard, each outcome metric against its target.
Every number carries its source, denominator and read date; a rate without its count is unfinished.
Disclose resource, sampling or execution differences before naming a comparative winner, and separate observed results from interpretation and projection.
Comparable rows go in tables; a claim on three or more data points or a time axis ships with a chart built from the data, parts against their whole; an answer with more than one dimension is a local page under `~/reviews/` built with the [brief kit](references/brief-kit.md).
Keep every measured field, not only favorable columns, and connect findings to the decision: keep the current system, make the change, or run the check that resolves the uncertainty, running a needed diagnosis before reporting a bad result as unexplained.

## Climb

A report is a version on the communication hill: run [the climb](../../../docs/processes/climb.md)'s level-up passes before it reaches the reader, and give analysis, status and proposals its [full form](../../../docs/processes/climb.md#how-to-communicate).
A status, analysis or plan for the owner meets the [operator review standard](references/operator-review.md).

## Log the run

For a substantial deliverable (a brief, report, analysis or multi-dimension status), score it with the independent judge before logging; a one-fact answer skips it.

```bash
~/.claude/skills/report/scripts/brief-judge <deliverable.html|.md|.txt> --context "<what the reader asked>"
skill-run-log /report --target "<question and evidence scope>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --score <total> --next /<next-skill-or-stop>
```

`brief-judge` scores [judging a deliverable](../../../docs/processes/climb.md#judging-a-deliverable)'s dimensions, names the weakest with their fixes, and appends a [ledger](../../../docs/processes/climb.md#the-ledger) row; fix the cheap ones and judge again.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A result is null, surprising or suspect, or lacks observation of the actual path | `/diagnose` | the raw rows, computation and missing segment |
| A measured gap has an improvement to test, or a tested mechanism cannot meet the outcome | `/evolve` | the baseline, bar and evidence about the constraint |
