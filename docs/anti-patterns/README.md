# Anti-Patterns

This directory is doctrine for writing and design work. It exists because positive guidance is too easy for agents to reinterpret into generic SaaS output.

The rule: when working on public writing, research, marketing pages, product UI, homepages, or design systems, read the relevant anti-pattern file before producing copy or UI.

## Files

- `principles.md` - the global bar and failure taxonomy.
- `copywriting.md` - prose, labels, headings, UX copy, and marketing language failures.
- `blog-and-research.md` - blog posts, research notes, comparison posts, and technical arguments.
- `marketing-pages.md` - public pages, homepages, product pages, landing pages, and CTAs.
- `product-design.md` - UI structure, cards, labels, visual systems, and product proof.
- `ai-agent-work.md` - how agents should operate when doing design or writing.
- `source-quality.md` - source ranking, reference extraction, and anti-reference-theater rules.
- `world-class-site.md` - the bar for serious technical startup sites, including Tangle's current site doctrine.
- `review-gates.md` - accept/reject gates for copy, design, blog, research, AI products, and source use.
- `reference-systems.md` - external systems and site-audit lessons this doctrine is based on.

## Hard Defaults

- If a section needs a tiny label to explain why it exists, the section probably does not exist yet.
- If a card needs an internal taxonomy label to feel meaningful, the card is probably not meaningful.
- If the output mostly explains the product instead of showing an artifact, it is not designed.
- If the writing sounds like a company trying to sound important, delete it.
- If the page tries to show every product, repo, agent, layer, and future idea at once, it has no hierarchy.

## Required Preflight

Before design or writing work:

1. Name the audience and the job of the page or artifact.
2. Name the single decision this artifact should unblock.
3. Delete every section that does not serve that decision.
4. Choose a real reference, screenshot, product artifact, or source document before inventing structure.

Before claiming done:

1. Grep changed files for `kicker`, `eyebrow`, `badge`, `chip`, `label`, `step`, `phase`, `platform loop`, `what * builds`, `proof over positioning`.
2. Screenshot the result when it is visual.
3. State what was removed, not only what was added.
4. If the work is still mostly text, say that plainly and keep iterating.

## Source Discipline

Do not cite a famous company, design system, or reference site unless you extract a concrete transferable pattern and a concrete anti-pattern. `Apple-like`, `Vercel-like`, `Stripe-like`, `OpenAI-like`, and `Airbnb-like` are not usable directions by themselves.

For any substantial design/writing project, classify references as:

- doctrine
- evidence
- inspiration
- noise

Only doctrine and evidence can create rules. Inspiration can influence taste. Noise should be ignored.
