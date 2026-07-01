---
name: product-design
description: Use when designing or revising product UI, landing pages, demos, dashboards, app shells, or interactive components. Enforces reference-first design, low-copy interfaces, real mode-specific components, no obvious labels, no procedural step theater, and screenshot-based quality checks.
metadata:
  short-description: Reference-first product UI without label/step slop
---

# Product Design

Use this skill before creating or revising any visible product UI. The goal is an interface that behaves like the product, not a diagram explaining the product.

## Failure Modes To Kill

- Obvious state labels: remove labels like "intent router", "detected agent", "route preview", "workflow", "step 1", "phase", "how it works", or "builder interview" when the control, page title, selected tab, or component state already makes it clear.
- Eyebrow/kicker labels: do not put tiny uppercase labels above headings as default page rhythm.
  If the label is not navigation, provenance, status, unit text, or a real data field, delete it.
- Inventory theater: do not market raw counts such as post totals, repo totals, feature totals, model totals, or integration totals unless the count is the actual buyer decision.
  For editorial pages, counts are usually a sign the page has no reader path.
- Taxonomy-as-design: do not turn internal product names, categories, tags, or topics into chips, lanes, or card grids unless the user is choosing among those categories.
  Show a product artifact, diagram, screenshot, series cover, trace, result, or source-backed comparison instead.
- Procedural theater: do not use numbered process cards or checklist panels to explain what the app should simply do. Express process through controls, state changes, results, and navigation.
- Generic input cosplay: a single text box must not pretend to be TTS, STT, cloning, and agent building. Text boxes are for text. Audio workflows need upload/record controls. Clone workflows need sample/consent/voice controls. Agent workflows need a builder chat/intake.
- Dead panels: if a panel is empty, decorative, or only repeats nearby copy, collapse it or replace it with useful controls, media, data, or results.
- Copy density: visible text must earn its place. Prefer one headline, one support line, direct commands, values, and necessary labels. Remove repeated verbs like "type/speak/upload/describe" when controls already communicate the action.
- Default control slop: avoid huge default selections, browser-default dropdowns in hero components, and giant chips for simple choices. Use compact segmented controls, custom dropdowns, icon buttons with tooltips, and real provider logos where identity matters.
- Fake readiness: do not imply a product/agent is ready because a demo talks. Show a real next action or route to the real builder/test surface.

## Reference-First Workflow

Before composing a new visual direction:

1. Inspect 2-3 current products or design systems in the same category. Use `site-clone`, `bad`, Playwright screenshots, computed styles, or live DOM inspection when possible.
2. Extract concrete patterns: density, typography scale, radius, dropdown treatment, media use, spacing, input structure, logos, and motion.
3. Design from those observed patterns and the existing app design system. Do not invent a generic SaaS layout from memory.
4. If a source is being cloned or heavily referenced, verify with screenshot comparison and computed style checks, not vibes.

## Component Rules

- The active mode changes the actual component, not just the copy around a generic component.
- Product switching should keep users oriented without making them pick the whole product before they can act.
- Provider/vendor choice belongs in compact controls near the affected action, not as a big explanatory lane unless provider comparison is the actual task.
- Use images, avatars, real logos, waveform/media previews, or real artifacts when they clarify the product. Do not fill space with icons and labels.
- Keep fixed-format surfaces stable with explicit dimensions, responsive constraints, and no text overflow.
- Cards are for repeated items, modals, or framed tools. Avoid nesting cards inside cards and avoid page sections that are just decorative cards.

## Copy Rules

- UI copy should name the thing, value, or action. It should not narrate obvious mechanics.
- Blog and research copy should not define obvious terms before saying why the piece exists.
- Research pages should behave like an index of arguments: date, claim, evidence path, and limitations.
  They should not use marketing CTAs, dark launch-page styling, topic chips, or archive-count badges.
- Never add numbered steps to a marketing hero or product demo unless the user explicitly asks for a process diagram.
- Replace explanatory labels with affordances: buttons, tabs, selected states, upload wells, record controls, waveform timelines, dropdown values, and result panes.
- Remove captions that only restate the icon, tab, route, or button beside them.

## Editorial Page Rules

Blog pages can include implementation notes, product essays, comparisons, launch notes, field reports, and research threads.
They should not imply that every post is a technical deep dive.

Use series and topic filters when a body of writing has many entries.
Series need a visual anchor: a cover, diagram, screenshot, trace-derived graphic, or generated cover component.
Topic filters are navigation, not decoration, so they should change the visible archive.

Do not put raw totals in the interface.
The reader does not need to know how many posts, repos, pages, or essays exist unless the page is an analytics dashboard.
Replace totals with reader paths: series, topics, dates, or arguments.

Do not use markdown as the only visual system for long posts.
A long post needs at least one artifact: diagram, table, screenshot, trace, code sample, terminal proof, or deliberately designed cover.
If the post has many fenced blocks and no diagram or table, the format is probably carrying implementation leftovers instead of a publishable argument.

Research pages should be narrower than blog pages.
Good research has a claim, evidence path, method, dataset, trace set, or model that can be argued against.
Product comparisons, SEO pages, and market explainers belong in blog unless they meet that standard.

## Quality Gate

Before finalizing UI work:

- Screenshot desktop and mobile, light and dark when both themes exist.
- Audit the first viewport for obvious labels, raw inventory counts, numbered steps, repeated action words, dead space, generic text boxes, fake outputs, and missing logos/media.
- For blog or research pages, verify the reader can move by series, topic, or argument without seeing a vanity count.
- Click each mode/control and verify it changes the real component state.
- Check text fit and overlap at mobile widths.
- If the result is below 9/10, fix the worst visible issue before reporting completion.

## Writing Reference Patterns

Use references only after extracting concrete patterns.
Do not cite a popular blog because it is popular.

- OpenAI News and blog pages work because posts are organized around releases, research updates, and product changes with strong media treatment.
  Transferable pattern: writing categories map to reader intent, not internal taxonomy.
  Do not copy: generic launch-page polish without artifact proof.
- Anthropic News works because safety, policy, product, and research posts keep distinct claims and evidence standards.
  Transferable pattern: research-facing pieces should not use the same voice as product announcements.
  Do not copy: institution-sized caveats when a startup needs sharper builder decisions.
- Stripe Engineering and company writing work because posts explain decisions with implementation detail, diagrams, and constraints.
  Transferable pattern: make the decision and tradeoff visible.
  Do not copy: long institutional history unless it directly changes the reader's implementation choice.
- Vercel and Linear writing work because they omit more than they show.
  Transferable pattern: small archives can feel serious when hierarchy and visual rhythm are strong.
  Do not copy: minimalism as empty whitespace or a list with no artifact.
- Cloudflare writing works because technical posts carry operational evidence and concrete failure modes.
  Transferable pattern: name the incident, constraint, benchmark, protocol behavior, or system boundary.
  Do not copy: overwhelming chronology when the audience needs the decision first.
