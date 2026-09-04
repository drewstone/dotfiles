---
name: docs-slop-audit
description: Audit technical docs for weak claims, AI slop, unclear boundaries, and misleading prose.
---

# Docs Slop Audit

Use this for technical docs, READMEs, whitepapers, launch notes, product pages, and generated MDX.
The goal is truth and reader utility, not prettier prose.
For public writing, blog, research, marketing, or product pages, also read the relevant `docs/anti-patterns/` file before editing.

## Flow

1. Read the docs in scope plus nearby nav/meta files.
2. Run `scan-docs-slop.mjs` when available.
3. Verify factual claims against code, config, package API, deployment state, or source material.
4. Separate facts, promises, opinions, and roadmap.
5. Fix or flag weak claims, boundary confusion, generic filler, unsupported superlatives, and procedural noise.
6. Preserve technical repetition and passive voice when they improve clarity.

## Output

Return findings with file:line, risk, evidence, and suggested edit.
If editing, make the changes and run the repo's doc/check commands.

Use `references/patterns.md` and `references/full-reference.md` for scanner details.
Use `docs/anti-patterns/` for durable anti-slop doctrine.

## Log the run

On completion, append one line so later analysis can grade this skill:

```bash
skill-run-log /docs-slop-audit --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| ≥1 claim describes API or SDK behavior the code does not implement | `/critical-audit` | the claim, its doc line, and the source file:line that contradicts it |
| ≥5 stale claims trace to one removed code path | `/deep-clean` | the removed path + every doc reference to it |
| Facts are correct and cadence still reads generic | `/writing-profile` | the draft + the target voice samples |
| 0 unsupported claims across the audited pages | `/reflect` | the page list + the claims verified against source |
