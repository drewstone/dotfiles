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
   - in the terminal, [`viz`](../../claude/tools/README.md#viz) charts (bars, grouped bars, sparklines, pass/fail strips, stacks, waterfalls, timelines, tables), never typed by hand;
   - for depth, a page rendered from a JSON spec with the [brief kit](../../claude/skills/report/references/brief-kit.md) and published as an artifact; `viz brief` prints the same spec as the terminal status, and the [operator review](https://github.com/tangle-network/discovery-lab/blob/master/reports/climb/operator-review-20261010.html) shows the bar.
4. **Scoreboard:** every registered prediction as PASS, FAIL or PENDING beside its measured value.
5. **Proposals:** each states today's number, the number to beat, the test, the owner and the first step, ranked by impact for the effort.
6. **One link** to the full page, and one line naming the next action.

Thin bullets are a failure for analysis: if facts are parallel, use a table; if they are quantities, draw them.

## Judging a deliverable

The rubric is the instrument for the communication hill: an independent judge scores each dimension 0–3, out of 30.
A score the author assigns to its own work is a claim, not a measurement.
Score 3 is the best practitioners' standard: each `3:` line is a feature of a cited public exemplar, torn down in the [operator review standard](../../claude/skills/report/references/operator-review.md).
A deliverable that meets a `3:` line only in part scores 2 on that dimension.

1. **Answer:** one sentence first, with its number, supported by what follows.
   **3:** the first two sentences give the verdict, its decisive number and what that number is measured against, as Amazon's [1997 letter][amzn-1997] opens with "838% revenue growth to $147.8 million" and Google's [postmortem][sre-postmortem] with "down for 66 minutes".
2. **Population:** complete sets, with source, query, window and denominator for every number.
   **3:** every headline number is a change from a stated baseline, with unit, period and source, as in "Sales grew from $15.7 million in 1996 to $147.8 million – an 838% increase" ([Amazon 1997][amzn-1997]), and every rate shows its count.
3. **Refutation:** headline numbers survived a query that could have refuted them; corrections are labeled.
   **3:** the most hopeful claim in play is quoted and set against the record, as [Feynman][feynman] set management's 1 in 100,000 beside 121 failures in nearly 2,900 solid-rocket flights; corrections to earlier reports are labeled.
4. **Benchmark:** compared with a cited exemplar or our own history.
   **3:** results stand against a benchmark the author does not control, over the whole history, and missed goals are named as missed: [Berkshire][brk-2020] opens with every year since 1965 beside the S&P 500, then writes "we met neither goal".
5. **Shape:** distributions and time series, not only totals.
   **3:** each key quantity is a series with every point, the worst kept, as in Berkshire's 1974 row of −48.7%; an incident carries a timestamped timeline from first signal to its exit criterion, as Google's runs from 14:51 to "30 minutes' nominal performance" at 16:30.
6. **Mechanism:** causes named and separated from correlation.
   **3:** root cause is written apart from trigger, as [Google][sre-postmortem] does, and each cause says whether it is understood or only fitted, as [Feynman][feynman] rejected an O-ring erosion model built by "empirical curve fitting".
7. **Ownership:** each open problem has an owner and next action, with time since its first alarm.
   **3:** a table gives every action an owner, a type (mitigate, prevent or process), a tracking link and a state ([Google][sre-postmortem]), and the author's own mistakes are named, sized and owned in the first person, as in "a mistake I made" ([Berkshire 2020][brk-2020]).
8. **Ambition:** proposals remove a problem class, each with a number to beat and a pre-mortem.
   **3:** the proposals are bold bets that remove a class of problem, each with its risk and a realistic scope stated up front: "bold rather than timid" ([Amazon 1997][amzn-1997]), and "Unrealistic beliefs on scope – often hidden and undiscussed – kill high standards" ([Amazon 2017][amzn-2017]).
9. **Decisions:** what only the reader can decide, with a recommendation and its tradeoff.
   **3:** each decision for the reader states the recommendation, its tradeoff, whether it can be reversed, and the rule that settles it, as [Amazon 1997][amzn-1997] chose "we'll take the cash flows" over the look of GAAP results and [Amazon 2016][amzn-2016] decides at "around 70% of the information".
10. **Craft:** charts drawn to scale from data, readable in both themes, the first screen complete. Its instruments are [`viz`](../../claude/tools/README.md#viz) and the [brief kit](../../claude/skills/report/references/brief-kit.md), which scale every mark from the data, reconcile parts with their whole, and draw in theme tokens at the reader's width.
    **3:** charts built from data sit beside the sentence they support, word-sized where they fit and with the target or normal band drawn ([Tufte][tufte]); status carries a color that renders (emoji in the terminal, theme tokens on a page); and the prose is a narrative for one named reader in plain words, as [Buffett][brk-2023] writes for his sister Bertie.

[amzn-1997]: https://www.sec.gov/Archives/edgar/data/1018724/000119312518121161/d456916dex991.htm
[amzn-2016]: https://www.sec.gov/Archives/edgar/data/1018724/000119312517120198/d373368dex991.htm
[amzn-2017]: https://www.sec.gov/Archives/edgar/data/1018724/000119312518121161/d456916dex991.htm
[brk-2020]: https://www.berkshirehathaway.com/letters/2020ltr.pdf
[brk-2023]: https://www.berkshirehathaway.com/letters/2023ltr.pdf
[sre-postmortem]: https://sre.google/sre-book/example-postmortem/
[feynman]: https://history.nasa.gov/rogersrep/v2appf.htm
[tufte]: https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/

The instrument is [`brief-judge`](../../claude/skills/report/scripts/brief-judge): it scores on a subscription account, quotes the deliverable for each score, and appends the ledger row.
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
Write rows with [`climb-log append`](../../claude/tools/README.md#climb-log); process-guard refuses shell writes into a ledger.
Each repository that keeps a ledger marks it `merge=union` in `.gitattributes`, so a local merge of two branches that each append rows keeps every row.
Git reads attributes from the checked-out branch, so [`git/install.sh`](../../git/install.sh) also points `core.attributesFile` at [`git/gitattributes_global`](../../git/gitattributes_global) on every host, and a branch cut before its repository named the ledger merges the same way.
GitHub's server merge ignores the attribute and reports a conflict; update the branch locally with `git merge origin/<base>` and push.
`climb-log check` rejects what a union can get wrong, at any date: a row split across lines, two rows interleaved, or a repeated row.

### Every number names its sample

On 2026-10-10, 5 reported numbers were retracted.
"Coalescing p50 32,401" chose streams by finish time across two releases, a failure time was measured from its notice, and a disk reclaim was an estimate.
So each baseline or result that reports a number carries a `measurement` block, and `climb-log append` refuses the row without one:
- `metric`, `unit`, `n`, and `basis` (measured, computed or judged; an estimate belongs in `prediction`);
- `selection`, the rule that chose the sample in words, and `selectBy`: `start`, `finish`, `notice`, `event`, `sample` or `all`;
- `window` {from, to} for a selection by time.
  A duration selects by start or is a fixed sample.
- for a per-release number, one `codeVersion`, and `deployedAt` at or before `window.from` when the selection is live traffic.
  Per-release covers a compared code, config, infra, model or prompt change, and product, agents and system positions unless `perRelease: false` declares a multi-release window.
- on a baseline row, the `instrument` and its `calibration`: PASS or FAIL with the `check` that compared the instrument with a known answer and that answer (`against`), or UNCALIBRATED with what would calibrate it (`next`).

`climb-log check` lints the rows written since 2026-10-11, and `climb-log hills` counts the hills whose instrument has a passing calibration check.
`climb-log schema` prints the contract with an example.
The [agent app lessons](https://github.com/tangle-network/agent-app/blob/main/docs/agent-app-lessons.md) list the incidents behind these checks and the checks every agent app inherits.

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
- **Privacy:** agent-runtime AgentProfiles and trace analysts may read transcripts and the person's messages on any model, as Drew decided on 2026-10-10.
  Before transcript content reaches a non-Claude model, the analyst pipeline removes `~/.config/privacy/denylist` entries, phone and card numbers, and secrets; if redaction cannot run, the step fails closed.
- **Spend:** judges, labelers and red teams prefer subscription surfaces; trace analysts may use per-token Router models within a logged budget cap.

## Corrections are data

Every correction from the person we serve is the most direct measurement of the operator hill.
Record each one as a ledger row:
- `layer: "operator"`;
- the quote;
- the date;
- the theme: communication, rigor, scope, cost, autonomy or safety;
- the change that answers it.

A theme that recurs after its change has failed and needs a change at a higher level, in the order [reflect](../../claude/skills/reflect/SKILL.md#choose-what-should-change) gives.

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
- **Ratchet:** a hill that reaches its target gets a new one for the next move: the best exemplar known anywhere, or twice the old target. The run that reached it settles; it does not keep spending.
- **Climb the climber:** the climb is itself a hill (hills improved per week, predictions passed), and agent-eval's meta-search lens tunes it.

## Be the best practitioner, then beat them

For every output class we make (a financial model, research report, workbook, chart, deck, operator review), there is someone who does it better.
1. **Find them:** two or three cited exemplars per class.
2. **Tear each one down** into checkable features: what they show, how they source, how they structure, how they visualize.
3. **Turn the teardown into the rubric's top anchor** and the profile's standard, then measure the gap.
4. **When the gap closes, find the next exemplar.**

Done so far: the operator review, on 2026-10-11, in the [operator review standard](../../claude/skills/report/references/operator-review.md); its features are the rubric's `3:` lines.

## Organize like the hardest projects in history

The Manhattan Project ran parallel approaches to the uncertain parts: three enrichment methods and two bomb designs. It had central technical direction, measurement before scale (Fermi's pile before Hanford), and relentless integration.
For a fleet, that means:
- **Parallel approaches** on any uncertain part, chosen by the team that holds the goal and selected by verified results; in Discovery, a play's topology and its roots choose them ([operate](../../claude/skills/operate/SKILL.md#before-launch-or-resume)).
- **One technical director** holding the goal.
- **Instruments before spend.**
- **Integration** into one deliverable on a fixed cadence.
