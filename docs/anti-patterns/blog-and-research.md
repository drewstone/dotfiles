# Blog And Research Anti-Patterns

Blog and research are not the same surface.

Blog can teach, explain, compare, announce, or narrate implementation. Research should make a narrower claim from evidence and should be willing to be incomplete.

## Research Anti-Patterns

Do not call something research if it is:

- a product comparison post
- a landing page argument
- a market category explainer
- an SEO page
- a disguised product pitch
- a list of internal system layers

Research requires at least one of:

- a falsifiable thesis
- a method
- a dataset or trace set
- a result
- an observed failure mode
- a comparison with controlled assumptions
- a technical model that can be argued against

Better as research:

> Which sandbox properties predict successful agent recovery after tool failure?

## Blog Green Patterns (measured)

Measured on 61 engineering and launch posts from 17 public developer blogs (Anthropic, OpenAI, Cognition, Fly.io, Modal, Cloudflare, Stripe, Vercel, Figma, a networking vendor, Cursor, Simon Willison, Hamel Husain, Eugene Yan, Chip Huyen, Julia Evans, Dan Luu), fetched 2026-11-16, with Hacker News points as a biased popularity proxy.
Medians with interquartile range (IQR). Write a post that matches these; judge it with the protocol below.

1. **Open on what was built, measured, found or broken.** Opening moves: result 14, problem 12, story 11, context 10, claim 9, definition 5. "Fly Machines are VMs with a fast REST API that can boot instances in about 300ms." "The new version is 2x faster, 12% better on our Junior Developer Evals."
2. **Name the product in the first sentences, as the subject that did something or the setting where the work happened.** First mention at a median 0.75% of the text. Stripe: "Over a thousand pull requests merged each week at Stripe are completely minion-produced." Cloudflare: Pingora "serves over 1 trillion requests a day ... requiring only a third of the CPU and memory".
3. **Write as the people who did the work, to a reader with a decision.** "We" 17.7 per 1,000 words (IQR 8.9-28.3), "you" 7.7. A post with no "we" and no "you" reads as an encyclopedia entry, and nothing in it reads as evidence.
4. **Give every number a unit and a baseline.** 2.4 numbers with units per 1,000 words (IQR 0.7-5.5). "950 tok/s, 6x faster than Haiku 4.5 and 13x faster than Sonnet 4.5." "Time-to-first-query drops from 7.87 seconds to 525 milliseconds."
5. **Show the real system, then explain it.** 49 of 61 posts carry a code block or figure; median 2 figures. A terminal session with its output ("Created demo-123 sprite in 1.0s"), a diagram of the actual 92-step create path, a real transcript.
6. **Let prose and figures carry the argument; keep tables for data.** Tables median 0 (IQR 0-0, max 3 in any post).
7. **State the cost, the failure and when to choose something else.** 55 of 61 posts do, including all 20 with the most Hacker News points. "Multi-agent systems use about 15× more tokens than chats." "This might mean not building agentic systems at all."
8. **Introduce terms one at a time, attached to an example the reader just saw.** No post in the corpus defines 3 or more bolded terms in its first 500 words (max 2).
9. **End on a decision rule, a next step or a measured result.** Endings: decision 17, next step 14, future work 9, appendix 8, hiring 6, measured result 2, summary 2. "For critical workloads, start with one self-contained, read-only inference step."
10. **Let length and headings follow the content.** Words median 2,081 (IQR 1,431-3,065, range 638-13,339); headings median 9 (IQR 6-14), and the headings alone tell the story ("We started with an empty git repository", "What we're still learning"). A house length or a fixed section ladder across many posts is a template, and readers see it.
11. **Keep titles short and name the thing.** Median 6 words; the 20 most-discussed posts median 5.5, the 20 least 8. "Docker without Docker." "Files are hard."

### Judge a post blind

Score with a rubric whose 1, 3 and 5 anchors are quotes from real posts, one dimension per pattern above.
Strip company and product names from every text the judge sees, mix the draft with at least 3 exemplar excerpts and 1 known-weak control in random order, and take the median of 3 or more independent judge calls.
Trust the judge only when every control scores at least 1.5 points below the exemplar median.
A draft is ready when it ties or beats an exemplar of the same kind in a blind pairwise preference, not when it passes a checklist.

### Guides this standard adopts

- Julia Evans, [Patterns in confusing explanations](https://jvns.ca/blog/confusing-explanations/): especially "introducing too many concepts at a time", "starting out abstract", "unrealistic examples" and "'what' without 'why'".
- [Google developer documentation style guide highlights](https://developers.google.com/style/highlights) for sentence-level style in tutorials and reference.
- [Diátaxis](https://diataxis.fr/) to decide whether a piece is a tutorial, a how-to, reference or explanation before drafting.
- [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) and the [humanizer skill](https://github.com/blader/humanizer) for removing generated-prose tells after the structure is right.
- The reader-testing stage of [anthropics/skills doc-coauthoring](https://github.com/anthropics/skills/tree/main/skills/doc-coauthoring): give the draft to a fresh agent with no context and ask what it learned.

## Blog Anti-Patterns

Avoid:

- SEO posts that never teach
- posts that assume the reader already knows the company, product, repository, or vocabulary
- native product terms used as if they were ordinary language
- internal commands, shell pipelines, local file paths, commit hashes, branch names, or package inspection steps in the article body
- internal notes, private-repository references, or author-side debugging history presented as reader evidence
- "In this post..."
- comparison pages that pretend all products are symmetric
- CTAs after every post
- internal links that exist only for SEO
- headings that are keyword stuffing
- research language without research evidence

Every blog post should answer:

- What does the reader know after this?
- What concrete decision is easier?
- What source, trace, implementation detail, benchmark, or example backs it?

### Zero-context reader rule

Assume the reader knows none of the company's products, internal names, architecture, history, or abbreviations.

Introduce the reader's problem before introducing the company's solution.

Define every native term in ordinary language at first use.

Explain every acronym, metric, protocol, or file-format name before using its short form.

Keep commands and repository mechanics out of the article body.
Link to a public source and explain what the source proves instead.

A reader should be able to answer these questions after the opening screen:

- What problem is this article about?
- Why does the problem matter to someone outside the company?
- What changed, was tested, or was learned?
- What can the reader decide or do with that information?

## Comparison Anti-Patterns

Bad comparison:

- our product always wins
- competitors are flattened into strawmen
- no test conditions
- no admission of where another product is better
- no date
- no source links

Good comparison:

- names the scenario
- names evaluation criteria
- uses current docs or product behavior
- admits tradeoffs
- says when to choose the other product

## Research Page Anti-Patterns

Do not use:

- dark marketing hero
- tiny page label
- "Research" as an eyebrow above "Research"
- product CTAs
- "follow the argument" copy
- category chips
- fake tracks
- comparison posts in research

Research page should feel like:

- an index of arguments
- light theme by default
- date, title, short claim
- no theatrical sections
- no marketing CTA
