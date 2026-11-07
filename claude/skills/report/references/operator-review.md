# Operator review

An operator review is a status, analysis or plan that an R&D lead or operator sends to a founder and CEO.
This page holds the standard for it: five public exemplars, twelve features you can check on the page, and the terminal form.
The `3:` lines of [judging a deliverable](../../../../docs/processes/climb.md#judging-a-deliverable) are these features; [`brief-judge`](../scripts/brief-judge) reads them as its top level.

## The exemplars

Each was read from its primary source.

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

- **Charts:** paste each one in a code fence directly under the sentence it supports. Never type bars by hand.
- **Color:** use text the terminal highlights: inline code for key numbers and terms, and `diff` fences for contrasts, whose `+` lines show green and `-` lines red. Use at most two emoji in a reply.
- **Length:** the first screen, about 40 lines, holds the headline, a chart, the actions and the decision. Depth goes on a [brief kit](brief-kit.md) page under `~/reviews/`, behind one link.
- **Focus:** one topic per reply; a second topic gets its own reply.

[amzn-2016]: https://www.sec.gov/Archives/edgar/data/1018724/000119312517120198/d373368dex991.htm
[amzn-2017]: https://www.sec.gov/Archives/edgar/data/1018724/000119312518121161/d456916dex991.htm
[brk-2020]: https://www.berkshirehathaway.com/letters/2020ltr.pdf
[brk-2023]: https://www.berkshirehathaway.com/letters/2023ltr.pdf
[sre-postmortem]: https://sre.google/sre-book/example-postmortem/
[sre-culture]: https://sre.google/sre-book/postmortem-culture/
[feynman]: https://history.nasa.gov/rogersrep/v2appf.htm
[tufte]: https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/
