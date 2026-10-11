# Operator review

An operator review is a status, analysis or plan that an R&D lead or operator sends to a founder and CEO.
This page holds the standard for it: five public exemplars, twelve features you can check on the page, the terminal form, and two worked examples.
The `3:` lines of [judging a deliverable](../../../../docs/processes/climb.md#judging-a-deliverable) are these features; [`brief-judge`](../scripts/brief-judge) reads them as its top level.

## The exemplars

Each was read from its primary source on 2026-10-11.

| Exemplar | Author | What it is |
|---|---|---|
| [Amazon letter for 2017][amzn-2017], with the [1997 letter][amzn-2017] reprinted inside, and the [letter for 2016][amzn-2016] | Jeff Bezos | A founder reports a year to owners, explains how he decides, and sets the six-page-memo standard |
| [Berkshire Hathaway letters for 2020][brk-2020] and [2023][brk-2023] | Warren Buffett | A CEO reports to owners against an index he does not control, and owns his mistakes in the first person |
| [Example postmortem][sre-postmortem] and [postmortem culture][sre-culture], *Site Reliability Engineering* | Google SRE | An operations team reports an incident: impact, cause, trigger, owned actions, timeline |
| [Appendix F, Rogers Commission report][feynman] | Richard Feynman | A principal scientist reports to a commission on why the Shuttle's managers misjudged its risk |
| [Sparkline theory and practice][tufte] | Edward Tufte | Data graphics the size of a word, set in the sentence or table that needs them |

Andy Grove's *High Output Management* is the obvious operating-review exemplar, but its text is not published online, so it was not read and is not used here.

## Twelve checkable features

A reviewer can check each feature from the page alone.
The last column is the rubric dimension whose `3:` line carries it.

| # | Feature | Passes when | What the exemplar does | Dimension |
|---|---|---|---|---|
| 1 | Verdict first | The first two sentences give the verdict, its decisive number and its comparison | Amazon 1997 opens: "by year-end, we had served more than 1.5 million customers, yielding 838% revenue growth to $147.8 million". Google's postmortem opens: "Shakespeare Search down for 66 minutes" | Answer |
| 2 | Numbers as changes | Each headline number runs from a baseline to now, with unit, period and source; each rate shows its count | "Sales grew from $15.7 million in 1996 to $147.8 million – an 838% increase"; repeat orders "grew from over 46% in the fourth quarter of 1996 to over 58%" (Amazon 1997) | Population |
| 3 | The hopeful claim tested | The most optimistic claim in play is quoted and set against the record | Management's 1 in 100,000 against the range safety officer's 121 failures in "nearly 2,900 flights" (Feynman) | Refutation |
| 4 | An outside benchmark, misses named | Results stand beside a benchmark the author does not control, and a missed goal is called missed | Every year since 1965 beside the S&P 500 on page one, then "Last year, however, we met neither goal" (Berkshire 2020) | Benchmark |
| 5 | Whole history, worst kept | Key quantities are series with every point; an incident has a timestamped timeline to its exit criterion | The 1974 row reads (48.7) (Berkshire); 14:51 to 16:30, ending at the "exit criterion of 30 minutes' nominal performance" (Google) | Shape |
| 6 | Cause apart from trigger | Root cause and trigger are separate entries, and each cause says whether it is understood or only fitted | Root Causes and Trigger are separate fields (Google); an erosion model "based not on physical understanding but on empirical curve fitting" (Feynman) | Mechanism |
| 7 | Actions owned | A table gives every action an owner, a type, a tracking link and a state | Nine action items with Type (mitigate, prevent, process), Owner, Bug and DONE or TODO (Google) | Ownership |
| 8 | Mistakes owned | The author names its own mistake in the first person, sizes it, and says what went wrong and where it got lucky | "that ugly $11 billion write-down – is almost entirely the quantification of a mistake I made in 2016" (Berkshire 2020); "What went wrong" and "Where we got lucky" (Google) | Ownership |
| 9 | Bold bets, scoped | Proposals remove a class of problem, each with its risk and a realistic effort | "We will make bold rather than timid investment decisions"; "This strategy is not without risk" (Amazon 1997); "Unrealistic beliefs on scope – often hidden and undiscussed – kill high standards" (Amazon 2017) | Ambition |
| 10 | Decisions framed | Each decision for the reader has a recommendation, its tradeoff, whether it can be reversed, and the rule that settles it | "we'll take the cash flows" over the look of GAAP results (Amazon 1997); "two-way doors" decided at "around 70% of the information you wish you had" (Amazon 2016) | Decisions |
| 11 | Graphics in the sentence | Charts built from data sit beside the claim they support, word-sized where they fit, with the target or normal band drawn | "embedded in a sentence, table, headline"; "the normal range of glucose, here as a gray band" (Tufte) | Craft |
| 12 | One reader, in prose | Written for one named reader in plain words, as a narrative inside a length budget | Buffett writes for his sister Bertie: owners are "entitled to hear every year both the good and bad news"; Amazon writes "narratively structured six-page memos", never slides | Craft |

## In the terminal

Claude Code shows a reply as Markdown in about two text colors, and ANSI color codes do not render.
The [evidence-lead directive](../../../directives/variants/evidence-lead-v1.md) sets the blocks of a reply (a bold headline, then Focus, Evidence, Doing, Learned and Next) and where its color comes from; this standard sets what those blocks must hold.

- **Charts:** draw each one with [`viz`](../../../tools/README.md#viz) and paste its output in a code fence directly under the sentence it supports. Never type bars by hand.
- **Color:** use text the terminal highlights: inline code for key numbers and terms, and `diff` fences for contrasts, whose `+` lines show green and `-` lines red. Use at most two emoji in a reply; Drew, 2026-10-11: "cut the emojis, i want depth, not toys".
- **Length:** the first screen, about 40 lines, holds the headline, a chart, the actions and the decision. Depth goes on a [brief kit](brief-kit.md) page published as an artifact, behind one link.
- **Focus:** one topic per reply; a second topic gets its own reply.

## Worked examples

### Rejected: the reply of 2026-10-11

Drew's verdict, in his words: "no colors just 2, i want more colorful stuff - very disorganized on what, why, how and focus - your answers are not ambitious and your'e relying on old stuff which is annoying, im not getting clear confident answers from you".

It opened: "You were right on both counts. I was winging it, and those plays were small."
Its 66 lines and 4,421 characters covered five topics: the sourcing pipeline, peer runs, root instructions, four new plays, and the safety of one play.

| # | Feature | In the reply |
|---|---|---|
| 1 | Verdict first | No: It opens on an apology and a process step, with no number |
| 2 | Numbers as changes | Partly: "10 of 92 won (10.9%)" has its count; "34 sources" and "7 generic lines" have no baseline |
| 3 | The hopeful claim tested | Yes: Peer runs against the others: 10.9% against 11.2% |
| 4 | An outside benchmark | No: Its only comparisons are with our own past runs |
| 5 | Whole history | No: Totals only |
| 6 | Cause apart from trigger | No: Nothing says why the best problems were "chartered ... and then never pressed" |
| 7 | Actions owned | No: The plays table has no owner, link or state |
| 8 | Mistakes owned | Partly: "I was winging it", but the mistake is not sized |
| 9 | Bold bets, scoped | Partly: Four 24-hour plays with "my guesses" of 12–30%, no pre-mortem, no effort stated |
| 10 | Decisions framed | No: Nothing is left for Drew to decide |
| 11 | Graphics in the sentence | No: Two hand-typed bar blocks, no `viz` and no target |
| 12 | One reader, in prose | No: Five topics, and nothing highlighted beyond two bold lines, so two text colors are all there is |

`brief-judge` scored it 14, 15 and 15 under the earlier rubric, and 16, 15 and 16 under the `3:` lines.
The judge rates it closer to a praised brief than Drew does; the good example below reports that gap.

### Good: the judge's calibration, written to the standard

This reply answers Drew's question of 2026-10-11, "HOW DO I KNOW YOU ARE AWARE OF THOSE MISTAKES AND ARE IMPROVING?", with data measured that day, in the directive's blocks; its chart is `viz` output.

---

**The judge that should show you I am improving does not yet see your verdict: it scores the reply you rejected today `15.7/30`, only `5.0` points under the brief you praised on 10-10 (`20.7`), against a bar of `12`.**

**Focus:** you asked how you can know I am improving. That needs an instrument that agrees with you, so I measured whether it does before claiming anything.

**Evidence:** the new top level, drawn from five public exemplars, leaves headroom: the praised brief reaches 3 only on Shape, in two of three runs.
```
vs status rejected 10-10  base rubric      ████████████████████ 15.0 pts
                          score-3 anchors  █████████████████▍   13.0 pts
vs reply rejected 10-11   base rubric      ████████▍       ┆     6.3 pts
                          score-3 anchors  ██████▋         ┆     5.0 pts
scale 0–15 pts · ┆ bar 12 pts · source: brief-judge --no-ledger,
claude-opus-5-5, 3-5 runs per anchor · as of 2026-10-11
```
```diff
+ clears the status you rejected on 10-10 by 13.0 points (bar 12)
- clears the reply you rejected today by only 5.0 points (bar 12)
```
Every run, earlier rubric → new top level: praised `21 21 21 21 21 → 20 21 21`; today's reply `15 14 15 → 16 15 16`; the 10-10 status `5 7 5 7 6 → 6 9 8`.
The claim tested is #296's "brief-judge calibrates at a 15.3-point gap (bar: 12)". It holds for the 10-10 status, which had no sources, owners or targets, and fails for today's reply, which had some of each.
The cause, not yet tested: the level-2 lines pay for having those parts, and no dimension pays for arranging them around one decision. The trigger was the first rejected reply with real content.

**Doing:**

| Action | Type | Owner | Link | State |
|---|---|---|---|---|
| Top level drawn from five exemplars; `brief-judge` reads it | prevent | operator | #355 | merged |
| Level-2 lines for Answer, Ambition and Craft from the same teardown; passes when today's reply scores `8` or less and the praised brief `20` or more, three runs each | prevent | operator | next PR | open |
| Five more replies you mark good or bad, so agreement rests on more than three anchors | process | Drew | — | waiting on you |

Your decision: should my replies pass the judge before they reach you? I recommend yes, at `18/30`: it blocks both rejections (`15.7` and `7.7`) and passes the praised brief (`20.7`). It costs about `26 s` and one subscription call per reply (median of 18 judge calls today, 15–31 s), and one flag reverses it. Keep it while it matches at least 8 of your next 10 verdicts.

The bet: the median reply you read moves from `13.5/30` (6 replies judged today under the earlier rubric) to `20` after the level-2 PR and `24` within a week. Pre-mortem: the judge learns to reward tables and highlighting over substance; the guard is that exact outcomes outrank the judge in the climb's reward order.

**Learned:** I typed every chart by hand today and never ran `viz` or `brief-judge`, both shipped on 10-10 in #296. Running them costs about 26 s a reply; skipping them cost a 66-line reply you rejected. Fix: `brief-judge` now scores against the exemplars (#355), with that reply as its rejected anchor. Status: merged, and the judge still falls 7.0 points short of the bar on it.

**Next:** the level-2 PR, judged on all three anchors before it merges.

---

| # | Feature | Where it is |
|---|---|---|
| 1, 4 | Verdict first, against an outside bar | The bold headline: 15.7 against 20.7 and the bar of 12, with the exemplars' top level as the outside benchmark |
| 2, 5 | Numbers as changes, every point | Earlier rubric → new top level for every run, the worst kept |
| 3, 6 | Hopeful claim tested, cause apart from trigger | #296's 15.3-point claim against today's anchor; the cause labeled untested |
| 7, 8 | Actions and the mistake owned | The Doing table with owner, type, link and state; Learned |
| 9, 10 | Bet and decision | 24/30 in a week with its scope and pre-mortem; the 18/30 gate with its cost, reversal and rule |
| 11, 12 | Graphics and one reader | A `viz` chart under the sentence it supports, a `diff` fence for the contrast, no emoji, one topic in about 40 lines |

`brief-judge` scored this reply 23, 23 and 24 under the `3:` lines, against 20.7 for the praised brief, with every quote found in the text.
It reaches 3 on Refutation, Mechanism and Decisions.
Its weakest dimensions show what level 3 still asks for: the headline answers with the judge rather than with the count of Terraform mistakes Drew asked about, the 13.5 median does not list its six replies, and nothing is set beside an outside benchmark.

[amzn-2016]: https://www.sec.gov/Archives/edgar/data/1018724/000119312517120198/d373368dex991.htm
[amzn-2017]: https://www.sec.gov/Archives/edgar/data/1018724/000119312518121161/d456916dex991.htm
[brk-2020]: https://www.berkshirehathaway.com/letters/2020ltr.pdf
[brk-2023]: https://www.berkshirehathaway.com/letters/2023ltr.pdf
[sre-postmortem]: https://sre.google/sre-book/example-postmortem/
[sre-culture]: https://sre.google/sre-book/postmortem-culture/
[feynman]: https://history.nasa.gov/rogersrep/v2appf.htm
[tufte]: https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/
