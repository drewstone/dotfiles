---
name: signal-distill
description: Turn real community, feed, API, or database signals into scored content briefs.
---

# Signal Distill

Use this to convert external signals into content strategy.
Never fabricate quotes, trends, sources, or community sentiment.

## Flow

1. Discover available sources and tools in the workspace.
2. Pull a bounded sample with source, author, URL, timestamp, and raw text.
3. Score each signal for relevance, novelty, credibility, urgency, and fit to the user's products or experience.
4. Extract quotable moments without over-quoting or changing meaning.
5. Cluster signals into themes and map each theme to a concrete content angle.
6. Produce a brief with source links, confidence, suggested format, and why it matters now.

## Rules

- Prefer fewer high-signal items over broad scraped noise.
- Separate observed signal from inferred positioning.
- If the source is stale, thin, or biased, say so.
- Do not publish-send anything; output the brief.

Use `references/full-reference.md` for discovery commands, scoring schema, and output templates.

## Log the run

On completion, append one line so later analysis can grade this skill:

```bash
skill-run-log /signal-distill --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The brief must be written in a specific voice | `/writing-profile` | the brief + ≥5 real samples of the target voice |
| The brief needs original imagery | `/nano-banana` | the visual concept + the target dimensions |
| ≥3 signals name the same missing product capability | `/product-innovation-audit` | the signal quotes + their engagement counts |
| Briefs are scored and the top one is ready to publish | stop | the brief path + its score and source links |
