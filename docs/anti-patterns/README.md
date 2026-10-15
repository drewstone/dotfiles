# Anti-Patterns

This directory keeps writing methods, review procedures and scoped rejection examples. For Tangle principles, visual grammar, motion, interaction and acceptance, read the [Brand design bible](https://github.com/tangle-network/brand/blob/main/docs/design-bible.md). Use [product-design](../../claude/skills/product-design/SKILL.md) for execution procedure.

The rule: when working on public writing, research, marketing pages, product UI, homepages, or design systems, read the relevant anti-pattern file before producing copy or UI.

## Files

- `principles.md` - scoped failure taxonomy and removal tests.
- `copywriting.md` - prose, labels, headings, UX copy, and marketing language failures.
- `blog-and-research.md` - blog posts, research notes, comparison posts, and technical arguments.
- `blog-discovery.md` - SEO, answer-engine, and generative-search discovery failures.
- `marketing-pages.md` - public pages, homepages, product pages, landing pages, and CTAs.
- [Product design](product-design.md) - UI structure, cards, labels, visual systems, and product proof.
- [UI evidence](ui-evidence.md) - before and after screenshots, interaction videos, and reviewable PR proof.
- `ai-agent-work.md` - how agents should operate when doing design or writing.
- `source-quality.md` - source ranking, reference extraction, and anti-reference-theater rules.
- `world-class-site.md` - retained site rationale and historical product framing.
- `review-gates.md` - accept/reject gates for copy, design, blog, research, AI products, and source use.
- `reference-systems.md` - external systems and site-audit lessons this doctrine is based on.

## Positive guides and rubrics

- [PRs and issues](../green-patterns/engineering-writing.md) - final behavior, acceptance checklists, and change-specific evidence.

- `../green-patterns/blog-writing.md` - reader-first structures and teachable evidence patterns.
- `../green-patterns/blog-style-guide.md` - the Tangle voice, article shapes, and reference-specific writing modes.
- `../green-patterns/blog-reference-notes.md` - rules extracted from real technical articles.
- `../green-patterns/blog-discovery.md` - query ownership, answer clarity, evidence, links, metadata, and measurement.
- `../rubrics/blog-quality.md` - the scored zero-context acceptance rubric and reviewer worksheet.
- `../rubrics/blog-discovery-quality.md` - the scored search and answer visibility rubric.

## Required Preflight

Before design or writing work:

1. Name the audience and the job of the page or artifact.
2. Name the single decision this artifact should unblock.
3. Delete every section that does not serve that decision.
4. Choose a real reference, screenshot, product artifact, or source document before inventing structure.

Before claiming done:

1. Grep changed files for `kicker`, `eyebrow`, `badge`, `chip`, `label`, `step`, `phase`, `platform loop`, `what * builds`, `proof over positioning`.
2. Apply [UI evidence](ui-evidence.md) to visible product changes, including PR attachments.
3. State what was removed, not only what was added.
4. Record functional, craft and user-evidence verdicts against the shared acceptance owner.

## Source Discipline

Do not cite a famous company, design system, or reference site unless you extract a concrete transferable pattern and a concrete anti-pattern. `Apple-like`, `Vercel-like`, `Stripe-like`, `OpenAI-like`, and `Airbnb-like` are not usable directions by themselves.

For any substantial design/writing project, classify references as:

- doctrine
- evidence
- inspiration
- noise

Only doctrine and evidence can create rules. Inspiration can influence taste. Noise should be ignored.
