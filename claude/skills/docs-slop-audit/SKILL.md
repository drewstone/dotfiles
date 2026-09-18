---
name: docs-slop-audit
description: Audit technical docs for weak claims, AI slop, unclear boundaries, and misleading prose.
---

# Docs Slop Audit

Review technical documents for factual accuracy, clear product boundaries, and usefulness to the intended reader.
Preserve technical repetition and passive voice when they improve clarity.

## Review and edit

1. Read the documents in scope and nearby navigation or metadata to establish the reader's task.
   For public writing, read the relevant repository `docs/anti-patterns/` guidance before editing.
2. Verify claims against current source, configuration, public APIs, deployment state, or cited material.
   Distinguish implemented behavior, hosted operations, protocol guarantees, plans, and opinions.
3. Remove unsupported claims, generic filler, and procedural copy that does not help the reader act.
   Keep qualifiers that express a real limitation or uncertainty.
4. Report findings for a review-only request; make edits when the task includes revision.
   Run the repository's documentation and link checks after editing.

For a broad document set, use [the scanner](scripts/scan-docs-slop.mjs) to find candidate passages:

```bash
node <skill-directory>/scripts/scan-docs-slop.mjs --json <file-or-directory>...
```

Check `scannedFiles`, `findingCount`, and `emittedCount` before relying on its output.
The scanner skips some directories and file types, limits emitted findings, and does not establish factual correctness.
Read [pattern guidance](references/patterns.md) when triaging recurring wording or product-boundary findings.
Follow current product documentation for exact product names and responsibilities; a generic skill cannot own that inventory.

Report file:line, the reader consequence, evidence checked, and the correction for each substantive finding.
Separate the material scanned from the material actually reviewed, and name unverified claims.

## Log the run

```bash
skill-run-log /docs-slop-audit --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| An API claim conflicts with its implementation | `/critical-audit` | the claim and contradictory source |
| Obsolete code and documentation share a removable capability | `/deep-clean` | the consumer evidence and affected paths |
| Accurate writing still needs the requested author voice | `/writing-profile` | the draft and real writing samples |
