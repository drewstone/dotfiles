# The climb

Use this method when a project has a measurable outcome and wants to compare successive attempts. Open research can establish which problem, representation or instrument deserves sustained work before registering a comparison.

## A hill has six parts, or it is not a climb

| Part | Question it answers | Fails when |
|---|---|---|
| **Goal** | What does the person we serve want, in their words? | The metric stands in for a goal nobody wrote down |
| **Metric with headroom** | How far are we from a cited world-class exemplar, on 0–100 or a physical unit? | Every version scores the maximum, or the scale is relative to our own past |
| **Instrument** | What measures it cheaply and identically every time? | Someone measures it by hand once |
| **Ledger** | Which moves were made, with what prediction, and what happened? | Changes ship without a predicted effect |
| **Decision rule** | When do we keep, iterate or abandon? | Results are reported but nothing changes |
| **Calibration** | Does the metric still track the goal? | The metric saturates, drifts, or disagrees with the person's own verdict |

For a measured improvement, choose the comparison and [set the bar](../../claude/skills/be-ambitious/SKILL.md#set-the-bar).

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

Choose an analysis that can change the decision. For example, test the strongest alternative explanation, inspect a counterexample, or ask which assumption limits the result. A comparison needs a credible baseline and an observation that distinguishes the alternatives.

## How to communicate

Answer the reader’s question in the format that fits its evidence. Show the observations behind a proposed mechanism and mark where interpretation begins. Use a chart for a consequential pattern across observations or a table for a comparison. A project that tracks registered predictions can report their outcomes from its ledger.

## Judging a deliverable

Use this rubric when commissioning an evaluation of a quantitative operator review.

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
10. **Craft:** charts drawn to scale from data, readable in both themes, the first screen complete. Its instrument is the [brief kit](../../claude/skills/report/references/brief-kit.md), which scales every mark from the data, reconciles parts with their whole, and draws in theme tokens at the reader's width.
    **3:** charts built from data sit beside the sentence they support, word-sized where they fit and with the target or normal band drawn ([Tufte][tufte]); contrasts carry a color that renders: highlighted text in the terminal (inline code, and `diff` fences whose `+` lines show green and `-` lines red, with at most two emoji) and theme tokens on a page; and the prose is a narrative for one named reader in plain words, as [Buffett][brk-2023] writes for his sister Bertie.

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

Each project keeps one append-only ledger, `.agent/climb.jsonl`.

Correct a retained measurement by appending a complete valid row with a new id
and `supersedes` set to the earlier row's id. Keep the project and hill the same.
Historical bytes are never rewritten.

A row is an [`evolve` experiment record](../../claude/skills/evolve/schema.md) plus four fields:
- `layer`;
- `hill`;
- `prediction`, a block a program can check, written before the move ([below](#predictions-a-program-checks));
- `outcome`, whose `verdict` `climb-log` writes, never the agent.

A hill's current position is a row with `lever: "baseline"`.
Each repository that keeps a ledger marks it `merge=union` in `.gitattributes`, so a local merge of two branches that each append rows keeps every row.
Git reads attributes from the checked-out branch, so [`git/install.sh`](../../git/install.sh) also points `core.attributesFile` at [`git/gitattributes_global`](../../git/gitattributes_global) on every host, and a branch cut before its repository named the ledger merges the same way.
GitHub's server merge ignores the attribute and reports a conflict; update the branch locally with `git merge origin/<base>` and push.

### Every number names its sample

Each baseline or result that reports a number carries a `measurement` block:
- `metric`, `unit`, `n`, and `basis` (measured, computed or judged; an estimate belongs in `prediction`);
- `selection`, the rule that chose the sample in words, and `selectBy`: `start`, `finish`, `notice`, `event`, `sample` or `all`;
- `window` {from, to} for a selection by time.
  A duration selects by start or is a fixed sample.
- for a per-release number, one `codeVersion`, and `deployedAt` at or before `window.from` when the selection is live traffic.
  Per-release covers a compared code, config, infra, model or prompt change, and product, agents and system positions unless `perRelease: false` declares a multi-release window.
- on a baseline row, the `instrument` and its `calibration`: PASS or FAIL with the `check` that compared the instrument with a known answer and that answer (`against`), or UNCALIBRATED with what would calibrate it (`next`).

### Predictions a program checks

From 2026-11-23, `climb-log append` refuses a row whose `prediction` is text, and prints the block it wants:

```json
{"claim": "Caching the parsed config cuts cold start p50 below 800 ms",
 "metric": "cold start p50", "unit": "ms",
 "expect": {"op": "<", "value": 800}, "confidence": 0.7}
```

- `expect.op` is `<`, `<=`, `>`, `>=`, `==` or `between`, whose `value` is `[low, high]`.
- A yes/no prediction uses unit `bool` with `{"op": "==", "value": 1}`.
- `confidence` is the probability that the claim holds, strictly between 0 and 1.

When the row also carries a numeric `result.value` whose `measurement` names the same metric and unit, `climb-log` stamps `outcome.verdict` `hit` or `miss`.
It refuses a row whose own verdict disagrees, and a result that measures another metric or unit, naming both.
A result that arrives later is a new row, `{"closes": "<predicted row id>", "result": ...}`, in the same project and hill; `climb-log` stamps the verdict on that row.
An abandoned prediction closes with `"outcome": {"verdict": "void", "reason": "..."}`.

Three readers score the ledger from those verdicts alone, each with `--json`:
- `climb-log open [--older-than 3d]` lists predictions with no verdict, oldest first;
- `climb-log score [--by project|hill|layer|lever]` gives closed share and hit rate with 95% Wilson intervals, the Brier score and a calibration table, and counts every row it left out with the reason;
- `climb-log export --changes` writes one line per closed prediction with its block, result, verdict and the PR and commit references in its evidence.

Rows written before the contract keep their text. A labels file (`--labels FILE`) gives them blocks: write each block from the prediction text alone, before reading the row's result, or mark the row `unreadable` with the reason.

Use the ledger when tracking a registered prediction or reporting a comparison against it.

### Rewards, strongest first

Judge a move by the strongest signal available:

1. A machine-checked outcome: merged, reverted or hot-fixed within 7 days, CI red after merge, served in production, the hill's metric moved, a proof checked.
2. The person's explicit rating.
3. The person's reaction, read by a labeler with measured per-class precision: approval, a status pull, a repeated request, a correction.
4. An independent judge, calibrated against signals 1–3.
5. The author's own grade, which is a claim.

A weaker signal never overrides a stronger one.
Attach outcomes automatically, when the row is written and again in a daily join.
Waiting for someone to rate later does not work.

Guard each reward against gaming and leaks:
- **Proxies:** fewer status pulls count only when push volume did not rise; fewer corrections count only beside outcomes, so hedged output cannot win.
- **Privacy:** AgentProfiles and trace analysts may read transcripts and the person's messages on any model.
  Before transcript content reaches a non-Claude model, the analyst pipeline removes `~/.config/privacy/denylist` entries, phone and card numbers, and secrets; if redaction cannot run, the step fails closed.
- **Spend:** judges, labelers and red teams prefer subscription surfaces; trace analysts may use per-token models within a logged budget cap.

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

| Organ | Job |
|---|---|
| **Instruments** | Deterministic numbers every run: scorecard (failure classes, lifelines, tokens, ruler saturation) and goal rulers |
| **Analysts** | Read traces selected by anomaly and importance, ask new topical questions each time, answer with quotes, and score each question's yield (did its answer lead to a move that passed?) |
| **Ground truth** | A calibration set per layer: the requester's verdicts and world-class exemplars for products and rulers; the person's corrections for the operator and its tools; held-out replays for profiles |
| **Optimizers** | Search candidate versions against the ground truth, with train, selection and final splits and a direct-edit baseline |
| **The loop** | Run nightly: instruments, then analysts, then proposals with predictions, then offline evals, then draft PRs with evidence; promote in the morning through a held-out gate; write the ledger and the page |

**Never stop climbing.**
- **Plateau breaker:** a hill flat for three measurements changes mechanism, not effort. Return to `evolve`'s mechanism step, and the search ledger's landscape lens drafts a new direction.
- **Ratchet:** a hill that reaches its target gets a new one for the next move: the best exemplar known anywhere, or twice the old target. The run that reached it settles; it does not keep spending.
- **Climb the climber:** the climb is itself a hill (hills improved per week, predictions passed), and agent-eval's meta-search lens tunes it.

## Be the best practitioner, then beat them

For every output class we make (a financial model, research report, workbook, chart, deck, operator review), there is someone who does it better.
1. **Find them:** two or three cited exemplars per class.
2. **Tear each one down** into checkable features: what they show, how they source, how they structure, how they visualize.
3. **Turn the teardown into the rubric's top anchor** and the profile's standard, then measure the gap.
4. **When the gap closes, find the next exemplar.**

Done so far: the operator review, in the [operator review standard](../../claude/skills/report/references/operator-review.md); its features are the rubric's `3:` lines.

### The making loop

The following practices come from a content package the owner rated highly and apply when preparing comparable material.
The maker named three changes that moved it most:
- **The bar is the best real work on the same topic.** Each round reads the work blind and pairwise against the best three pieces on that topic, with a rejected draft as a control that must lose. Readers say which piece they would finish and act on, and restate the problem and the solution. "Can you tell an AI wrote it" is not the question. Their reasons drive each rewrite: the six-questions table they liked best came from them.
- **Evidence comes before prose.** The attack runs on production first, and someone who did not make the piece runs it again. The work can then open on that attack against the reader's own setup, and every number, limit and admission traces to a file. A product gap found this way gets fixed, not written around.
- **The lead checks every artifact at the reader's size.** That means a contact sheet of every clip, the last frame at 390 px, every diagram at full size, and every link fetched. Nothing reaches the owner until both the maker and the lead would bet their names on it.

Around those three:
1. **Tear down the best work on the same topic before writing,** 15 to 25 pieces: how each opens, its proof, and where the product appears. Write one page covering the reader, their pain, the thesis in one sentence, and the proof each beat needs.
2. **Name the usual answers fairly, and credit whoever already ships the idea.** Differentiate on questions the reader can take to any vendor, answer them with links to proof, and write the limits down.
3. **Claim only what the served release does.** Bring the owner one decision page, recommendation first, that names its author.
4. **Lead with the reader's problem in the words they search, never with the mechanism.** A true title about how it works ("run the tests on a machine it never touched") lost to the owner as "who cares"; one about what goes wrong for the reader wins. Test it blind: readers pick what they would click from the real top titles for the reader's queries with your candidates mixed in, and say what each promises them.

## Organize like the hardest projects in history

The Manhattan Project ran parallel approaches to the uncertain parts: three enrichment methods and two bomb designs. It had central technical direction, measurement before scale (Fermi's pile before Hanford), and relentless integration.
For a fleet, that means:
- **Parallel approaches** on any uncertain part, chosen by the team that holds the goal and selected by verified results.
- **One technical director** holding the goal.
- **Instruments before spend.**
- **Integration** into one deliverable on a fixed cadence.
