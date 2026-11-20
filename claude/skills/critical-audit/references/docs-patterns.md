# Document review

Read this when the audit target is a technical document, public page or skill.

1. Establish the reader's task from the documents in scope and nearby navigation or metadata.
   For public writing, read the repository's `docs/anti-patterns/` guidance before editing.
2. Verify each claim against current source, configuration, public APIs, deployment state or cited material, and separate implemented behavior, hosted operations, protocol guarantees, plans and opinions.
3. Remove unsupported claims, generic filler and procedural copy that does not help the reader act; keep qualifiers that state a real limit, and technical repetition or passive voice where they read clearer.
   Exact product names and responsibilities come from current product documentation, never from a skill.
4. For a broad set, find candidate passages with the scanner, `node <skill-directory>/scripts/scan-docs-slop.mjs --json <file-or-directory>...`.
   Check `scannedFiles`, `findingCount` and `emittedCount` first: it skips some directories and file types, caps emitted findings, and never establishes factual correctness.
5. Separate the material scanned from the material read, triage with the patterns below, and run the repository's documentation and link checks after editing.

## Slop patterns

Adapted from `hardikpandya/stop-slop` and the humanizer skill. Use these as review heuristics, not as a blind rewrite policy.

## High severity

- Product-boundary blur: the page uses hosted infrastructure behavior as if it were a protocol guarantee, or uses protocol words for hosted service behavior.
- Source-free claims: "secure", "production-grade", "verifiable", "decentralized", "private", "auditable", or "trustless" without the mechanism that makes it true.
- Single-tool tunnel vision: one harness, model provider, wallet, or runtime is presented as the path when the system supports many.
- Stale launch facts: old supply, old governance parameters, old package names, old model names, or "coming soon" for shipped features.
- Fake certainty: roadmap or intended behavior written as live behavior.

## Medium severity

- Throat clearing: "here's what", "here's why", "at its core", "it is worth noting", "let's dive", "the bottom line".
- Inflated claims: "seamless", "robust", "powerful", "comprehensive", "cutting-edge", "state-of-the-art", "groundbreaking", "revolutionary".
- Rhetorical reversals: "not just X but Y", "more than just X", "X is not Y, it is Z".
- False agency: "the data tells us", "the decision emerges", "the system unlocks" when a human, contract, or service performs the action.
- Abstract nouns: "landscape", "ecosystem", "paradigm", "synergy", "holistic" unless the page literally discusses a protocol ecosystem.
- Decorative structure: counting headlines, rule-of-three lists, quote-like closers, and em dashes used for drama.
- Inventory theater: "80 posts published", "50 integrations", "12 primitives", or any raw count that is not itself the buyer or reader decision.
  Replace with the path the reader should take: series, topic, date, task, argument, or product surface.
- Markdown-as-design: long pages made only of headings, bullets, fenced text blocks, and repeated tables.
  Replace with a real artifact when possible: screenshot, diagram, trace, terminal proof, comparison matrix, or designed cover.
- Fake research posture: product comparisons, SEO explainers, or market summaries presented as research without method, data, trace evidence, or a falsifiable claim.

## Low severity

- Passive voice. Flag only when it hides who operates, signs, slashes, pays, routes, or verifies.
- Adverbs. Flag only when they soften a claim instead of adding precision.
- Title case. Most docs sites use title case in nav; do not rewrite headings solely for casing.
- Repetition. Technical docs often repeat nouns to avoid ambiguity. Prefer repeated names over synonym cycling.

## Good replacement moves

- "The protocol guarantees X" -> "Contract Y enforces X by checking Z."
- "Operators need strong AI infrastructure" -> "Operators need GPU/CPU capacity, outbound model credentials if using external providers, and isolation for untrusted tool execution."
