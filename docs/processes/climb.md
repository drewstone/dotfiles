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
   When a subscription surface offers another model (pi with GLM, Codex, another Claude seat), have it write the red team.
   On 2026-10-10 an independent GLM red team found that this process's first draft rewarded self-grades, and one route check showed that $583 of "GLM spend" was flat-plan traffic priced at list.
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

### Rewards, strongest first

Judge a move by the strongest signal available:

1. A machine-checked outcome: merged, reverted or hot-fixed within 7 days, CI red after merge, served in production, the hill's metric moved, a proof checked.
2. The person's explicit rating.
3. The person's reaction, read by a labeler with measured per-class precision: approval, a status pull, a repeated request, a correction.
4. An independent judge, calibrated against signals 1–3.
5. The author's own grade, which is a claim.

A weaker signal never overrides a stronger one.
Attach outcomes automatically, when the row is written and again in a daily join.
Waiting for someone to rate later does not work: on 2026-10-10, 421 logged skill runs carried 0 ratings.

Guard each reward against gaming and leaks:
- **Proxies:** fewer status pulls count only when push volume did not rise; fewer corrections count only beside outcomes, so hedged output cannot win.
- **Privacy:** transcripts and the person's messages go only to Claude seats through the CLI bridge, never to third-party model APIs.
- **Spend:** judges, labelers and red teams run on subscription surfaces, never on per-token APIs.

## Corrections are data

Every correction from the person we serve is the most direct measurement of the operator hill.
Record each one as a ledger row:
- `layer: "operator"`;
- the quote;
- the date;
- the theme: communication, rigor, scope, cost, autonomy or safety;
- the change that answers it.

A theme that recurs after its change has failed and needs a change at a higher level: architecture, then a check, then a test, then a rule.

## The engine: what makes the climb run without us

The optimizers already exist: agent-eval's `improve()`, the GEPA, SkillOpt and DSPy bridges, held-out gates and the search ledger's lenses.
An optimizer climbs whatever it is pointed at, so it needs ground truth and fresh diagnosis first.
On 2026-10-09 the daily meta-analyst (`trace-mine`) read 3 of 32,093 sessions and asked no questions; the run analysts asked the same 9 questions of every run; and no layer had ground truth beyond hand-made reviews.

| Organ | Job | Owner |
|---|---|---|
| **Instruments** | Deterministic numbers every run: scorecard (failure classes, lifelines, tokens, ruler saturation) and goal rulers | Discovery Lab `disco scorecard`, `disco ruler` |
| **Analysts** | Read traces selected by anomaly and importance, ask new topical questions each time, answer with quotes, and score each question's yield (did its answer lead to a move that passed?) | Lab `disco trace ask` (runs); tangle-tools `trace-mine` (operator and fleet sessions) |
| **Ground truth** | A calibration set per layer: the requester's verdicts and world-class exemplars for products and rulers; the person's corrections for the operator and its tools; held-out replays for profiles | Ledger rows, the correction dataset, exemplar teardowns |
| **Optimizers** | Search candidate versions against the ground truth, with train, selection and final splits and a direct-edit baseline | agent-eval |
| **The loop** | Run nightly: instruments, then analysts, then proposals with predictions, then offline evals, then draft PRs with evidence; promote in the morning through a held-out gate; write the ledger and the page | Keeper and trace-mine timers; the operator promotes |

**Never stop climbing.**
- **Plateau breaker:** a hill flat for three measurements changes approach, not effort. Run `hypothesize`, and the search ledger's landscape lens drafts a new direction.
- **Ratchet:** a hill that reaches its target gets a new one: the best exemplar known anywhere, or twice the old target.
- **Climb the climber:** the climb is itself a hill (hills improved per week, predictions passed), and agent-eval's meta-search lens tunes it.

## Be the best practitioner, then beat them

For every output class we make (a financial model, research report, workbook, chart, deck, operator review), there is someone who does it better.
1. **Find them:** two or three cited exemplars per class.
2. **Tear each one down** into checkable features: what they show, how they source, how they structure, how they visualize.
3. **Turn the teardown into the rubric's top anchor** and the profile's standard, then measure the gap.
4. **When the gap closes, find the next exemplar.**

## Organize like the hardest projects in history

The Manhattan Project ran parallel approaches to the uncertain parts: three enrichment methods and two bomb designs. It had central technical direction, measurement before scale (Fermi's pile before Hanford), and relentless integration.
For a fleet, that means:
- **Parallel arms** on any uncertain approach, selected by verified results.
- **One technical director** holding the goal.
- **Instruments before spend.**
- **Integration** into one deliverable on a fixed cadence.
- **No idle capacity:** every free seat runs the next most valuable move.
