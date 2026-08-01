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

Bad research section:

> Tangle Sandbox vs E2B

Better as blog:

> Tangle Sandbox vs E2B

Better as research:

> Which sandbox properties predict successful agent recovery after tool failure?

## Blog Anti-Patterns

Avoid:

- SEO posts that never teach
- posts that assume the reader already knows the company, product, repository, or vocabulary
- opening with a metric, acronym, commit, or implementation detail before stating the human problem
- native product terms used as if they were ordinary language
- internal commands, shell pipelines, local file paths, commit hashes, branch names, or package inspection steps in the article body
- internal notes, private-repository references, or author-side debugging history presented as reader evidence
- intro paragraphs that define obvious terms
- "In this post..."
- summary sections that repeat the title
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
- Why does the problem matter to someone outside Tangle?
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
