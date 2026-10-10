# The climb

Everything we make is a version on a hill: a product, a ruler, an agent profile, a skill, a directive, a hook, a system, a report.
Everything we want is a measured position on that hill.
Every change is a move with a prediction, kept if it climbs and reverted if it does not.
The hill itself is checked against the goal, so we never climb the wrong one.

This document is the shared process for Claude, Codex and OpenCode.
[`evolve`](../../claude/skills/evolve/SKILL.md) runs one hill; this document runs all of them at once, with one record.

## Why it exists

On 2026-10-10 a review of the Terraform program found the same failure at every layer: loops that recorded data but never closed.
- **Rulers:** they maxed out, holding 17/17 for 40 h, while the judge fell 16 points as the product moved toward the goal.
- **Runs:** 738 of 1,112 turn attempts failed, and no run reported it.
- **Directive:** an interaction directive was injected into 4,010 sessions while its A/B scorer was never built.
- **Operator:** 0 of 4 registered predictions passed, and its reports came as thin bullets.

A loop that measures but never decides is not a climb.

## A hill has six parts, or it is not a climb

| Part | Question it answers | Fails when |
|---|---|---|
| **Goal** | What does the person we serve want, in their words? | The metric stands in for a goal nobody wrote down |
| **Metric with headroom** | How far are we from a cited world-class exemplar, on 0–100 or a physical unit? | Every version scores the maximum, or the scale is relative to our own past |
| **Instrument** | What measures it cheaply and identically every time? | Someone measures it by hand once |
| **Ledger** | Which moves were made, with what prediction, and what happened? | Changes ship without a predicted effect |
| **Decision rule** | When do we keep, iterate, abandon or revert? | Results are reported but nothing is reverted |
| **Calibration** | Does the metric still track the goal? | The metric saturates, drifts, or disagrees with the person's own verdict |

Before work on any layer, name the hill, read its current and best values, and write the number to beat.

## The layers

| Layer | Default metric | Instrument | Calibrated against |
|---|---|---|---|
| Product | Absolute goal score, 0–100, against a named exemplar; exact checks on the goal itself | Goal rulers, held-out checks, a requester proxy | The requester's own verdict |
| Rulers and judges | Agreement with expert or requester rankings (Kendall τ); test–retest spread on identical content; headroom | A frozen calibration set of past versions with known verdicts | Exact outcomes and human rankings |
| Agents and profiles | Held-out replay gain; behavior-hypothesis pass rate | Replays, trace review | Product score |
| System | Failed-attempt share; input:output; infrastructure settles; time to first usable version; dead-role hours | Per-run scorecard written at settle | Product score per seat-hour |
| Operator | Prediction calibration; detect and recover times; corrections per hour of the person's attention; deliverable score | The ledger, transcripts, the deliverable rubric | The person's explicit corrections and ratings |
| Operator tools (skills, directives, hooks) | Corrections and outcomes per session under each version | Session logs joined to transcripts | Operator metrics |
| The climb itself | Hills improved per week; share of moves with a prediction; share of predictions that passed | The ledger | All of the above |

## How to think: the level-up passes

Run these in order on any analysis, plan, review or proposal before it reaches anyone.
Each pass leaves a mark in the output, or the pass did not happen.

1. **Frame.** Name the decision this informs, the hill, its current value and the number to beat.
2. **Evidence.** Draft only from measured sources. Label each claim measured, computed or judged.
3. **Mechanism.** Count the distinct sources of a repeated signal before naming a pattern. In h, 243 notices from one digest were one stuck writer, not 243 collisions.
4. **Red team.** Write the pre-mortem: it is two weeks later and this failed; why? State the strongest contrary evidence and what would change the conclusion.
   For each headline number, run the narrowest query that would come out differently if it were false: the product or its harness, merged or served, the start of the outage or the start of the log.
5. **Bigger.** Ask what would make the result ten times better, what the best practitioner alive would do, and what we should stop doing entirely. Then ask again from the new answer.
6. **The question not yet asked.** Name the most important question nobody has asked, and answer it or say what would.
7. **Stress test the winner.** Recompute its numbers from two independent sources, move its weakest input to its market value, and name who loses if it is wrong.
8. **Predict.** Write the number to beat and the test that decides it, before acting.
9. **Visualize.** Turn the evidence into charts built from data, never retyped.
10. **Cut.** Remove every sentence that changes no decision and carries no number.

## How to communicate

Match depth to the ask:
- an acknowledgement or routine operation gets one line;
- an analysis, review, plan, status of a run, or proposal gets the full form below.

1. **Answer first:** one sentence, with its number.
2. **Evidence:** numbers with value, unit, baseline and source; tables where facts are parallel.
3. **Visuals built from data:**
   - in the terminal, ASCII charts (ranges, bars, timelines, grids) from a script, not typed by hand;
   - for depth, a page rendered from a JSON spec with the [brief kit](../../claude/skills/report/references/brief-kit.md) and published as an artifact; the [operator review](https://claude.ai/artifact/LDsG9LBZzVny7k9acpRoa8) shows the bar.
4. **Scoreboard:** every registered prediction as PASS, FAIL or PENDING beside its measured value.
5. **Proposals:** each states today's number, the number to beat, the test, the owner and the first step, ranked by impact for the effort.
6. **One link** to the full page, and one line naming the next action.

Thin bullets are a failure for analysis: if facts are parallel, use a table; if they are quantities, draw them.

## Judging a deliverable

The rubric is the instrument for the communication hill: an independent judge scores each dimension 0–3, out of 30.
A score the author assigns to its own work is a claim, not a measurement.

1. **Answer:** one sentence first, with its number, supported by what follows.
2. **Population:** complete sets, with source, query, window and denominator for every number.
3. **Refutation:** headline numbers survived a query that could have refuted them; corrections are labeled.
4. **Benchmark:** compared with a cited exemplar or our own history.
5. **Shape:** distributions and time series, not only totals.
6. **Mechanism:** causes named and separated from correlation.
7. **Ownership:** each open problem has an owner and next action, with time since its first alarm.
8. **Ambition:** proposals remove a problem class, each with a number to beat and a pre-mortem.
9. **Decisions:** what only the reader can decide, with a recommendation and its tradeoff.
10. **Craft:** charts drawn to scale from data, readable in both themes, the first screen complete.

Calibrate the judge against the person's own ratings: keep at least one deliverable they rejected and one they praised, in their words, beside the project's ledger, and report the judge's agreement as its own hill.

## The ledger

Each project keeps one append-only ledger:
- Discovery Lab: `reports/climb/ledger.jsonl`;
- elsewhere, `.agent/climb.jsonl`.

A row is an [`evolve` experiment record](../../claude/skills/evolve/schema.md) plus four fields:
- `layer`;
- `hill`;
- `prediction` (the number to beat, written before the move);
- `outcome` (`PASS`, `FAIL` or `PENDING`, with the measured value).

A hill's current position is a row with `lever: "baseline"`.
The skills that analyze or operate (`operate`, `report`, `reflect`, `evolve`, `hypothesize`, and Lab's `deep-review`) read the ledger before starting and append to it before finishing.

## Corrections are data

Every correction from the person we serve is the most direct measurement of the operator hill.
Record each one as a ledger row:
- `layer: "operator"`;
- the quote;
- the date;
- the theme: communication, rigor, scope, cost, autonomy or safety;
- the change that answers it.

A theme that recurs after its change has failed and needs a change at a higher level: architecture, then a check, then a test, then a rule.
