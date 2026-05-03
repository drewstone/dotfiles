---
name: llm-wiki
description: "Maintain an Obsidian-compatible LLM wiki: ingest raw sources, update interlinked markdown pages, answer questions with citations, lint contradictions/staleness/orphans, and run a maintainer+critic loop for compounding knowledge bases."
---

# LLM Wiki

Use this skill when the task is to create, maintain, lint, or operate a persistent markdown wiki where raw sources are immutable and the agent owns the synthesized wiki layer.

The wiki is a codebase. Obsidian is the IDE. The agent edits the wiki.

## Core Contract

Separate three layers:

- `raw/`: immutable source material. Articles, PDFs, transcripts, clips, images, datasets. Never rewrite raw sources.
- `wiki/`: agent-maintained markdown synthesis. Entity pages, concept pages, comparisons, indexes, briefs, open questions.
- `AGENTS.md` or `CLAUDE.md`: local schema and operating rules for this specific wiki.

If the repo already has different names, adapt to the existing convention and document the mapping in the schema file.

## Recommended Shape

```text
raw/
  sources/
  assets/
wiki/
  index.md
  log.md
  inbox.md
  open-questions.md
  entities/
  concepts/
  sources/
  syntheses/
```

Use Obsidian-friendly links: `[[Page Name]]`. Keep filenames stable and human-readable.

## Page Rules

Every generated wiki page should have:

- short YAML frontmatter: `type`, `status`, `updated`, `sources`
- a one-paragraph summary
- evidence-linked claims with source paths
- `Related` links
- open questions or confidence notes when useful

Do not bury uncertainty. Mark contradictions and stale claims explicitly.

## Ingest

For each source:

1. Identify source type, title, author/org, date, URL/path, and trust level.
2. Create or update a source note under `wiki/sources/`.
3. Extract durable claims, entities, concepts, decisions, metrics, and contradictions.
4. Update affected entity/concept/synthesis pages.
5. Update `wiki/index.md`.
6. Append one entry to `wiki/log.md`.

Prefer one-source-at-a-time ingestion for important material. Batch only when sources are low-risk or repetitive.

## Query

When answering against the wiki:

1. Read `wiki/index.md` first.
2. Search with `rg`; use markdown search tools if present.
3. Read the smallest sufficient set of pages and cited raw sources.
4. Answer with citations to wiki pages or raw source paths.
5. If the answer is durable, file it under `wiki/syntheses/` and update the index/log.

Do not answer from raw sources alone if a maintained wiki page exists; update the wiki when the maintained page is stale.

## Lint

Run a health pass periodically or before major decisions:

- orphan pages with no inbound links
- concepts mentioned repeatedly but missing pages
- contradictions across pages
- stale claims superseded by newer sources
- weak citations or unsupported assertions
- oversized pages that need splitting
- source notes not reflected in syntheses
- syntheses with no source support

For each issue, either fix it or add it to `wiki/open-questions.md` with a concrete next action.

## Maintainer Loop

For autonomous upkeep, run bounded loops:

```text
observe -> plan updates -> edit wiki -> lint -> critic review -> fix -> log
```

Use one model as maintainer. For high-value or high-risk wikis, use a second model or subagent as critic. The critic should check evidence support, missed contradictions, bad links, and whether edits made the wiki more useful.

Stop policies:

- max iterations reached
- no meaningful diff after an iteration
- unresolved source ambiguity needs user decision
- confidence is too low for synthesis
- maintenance cost exceeds the value of the source batch

Default loop budget: 3 iterations. Use 1 iteration for routine ingest, 5 only for important research wikis.

## Obsidian

Keep the wiki readable in Obsidian:

- use wikilinks for internal pages
- store local images under `raw/assets/` or the repo's configured attachment folder
- avoid generated tables that are too wide to read
- use tags sparingly and consistently
- Dataview-friendly frontmatter is useful, but do not over-schema early

## Quality Bar

- Raw sources stay immutable.
- Claims cite source paths.
- Index and log are updated with every meaningful change.
- Contradictions are surfaced, not smoothed over.
- The wiki gets easier to navigate after each pass.
- No fake citations, no invented source metadata, no silent rewrites of user-authored source material.
