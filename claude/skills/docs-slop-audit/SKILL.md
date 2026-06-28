---
name: docs-slop-audit
description: Audit technical docs for weak claims, AI slop, unclear product boundaries, false promises, and prose that misleads builders or buyers.
---

# Docs Slop Audit

Use this for technical docs, READMEs, whitepapers, launch notes, product pages, and generated MDX.
The goal is truth and reader utility, not prettier prose.

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

Use `references/patterns.md` and `references/full-reference.md` for full rules and scanner details.

## Then consider

- `humanizer` for non-technical voice cleanup after facts are fixed.
- `critical-audit` when docs expose API or SDK contract risk.
