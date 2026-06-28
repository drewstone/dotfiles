---
name: docs-slop-audit
description: "Audit technical docs for AI slop, weak claims, unclear product boundaries, and protocol-vs-infra confusion. Triggers: docs review, copy audit, stop slop, humanize docs, blueprint docs."
---

# Docs Slop Audit

Review technical docs like a staff engineer editing for readers who will build, operate, or buy the system. The goal is not prettier prose. The goal is docs that teach, separate facts from promises, and never blur product boundaries.

Use this skill for docs, READMEs, whitepapers, launch notes, product pages, and generated MDX. It adapts `stop-slop`-style prose checks to technical docs, where passive voice, adverbs, and repeated nouns are sometimes correct.

## Audit Order

1. Read the source docs in scope, plus nearby nav/meta files so you understand what page belongs where.
2. Run the scanner:

```bash
node /home/drew/code/dotfiles/claude/skills/docs-slop-audit/scripts/scan-docs-slop.mjs <file-or-dir>...
```

Use `--json` when you need a machine-readable artifact.

3. Triage scanner output. Fix or report high-severity findings first. Treat low-severity findings as prompts for judgment, not rules.
4. Verify factual claims against source. For protocol docs, read code/config/tests. For product docs, read the relevant repo, README, package API, and deployment state.
5. Review the page as a reader:
   - Developer: can they build the thing without hidden context?
   - Operator: can they size, secure, monitor, and price it?
   - Consumer/customer: can they tell what is live, hosted, decentralized, or roadmap?
6. Rewrite only after the facts are grounded. Strong prose with wrong facts is worse than awkward prose.

## What To Flag

High severity:
- Vague product claims without a mechanism or source.
- Protocol claims that actually describe hosted Tangle infrastructure.
- Hosted infrastructure claims that imply protocol guarantees.
- Blueprint pages written without checking the blueprint repo.
- Single-tool framing where the product supports multiple harnesses, providers, or runtimes.
- Old parameters, stale numbers, or launch facts that conflict with code/config.

Medium severity:
- AI cadence: "not just X but Y", "at its core", "seamless", "robust", "leverage", "landscape", "unlock", "showcase".
- Counting headlines that exist only for copy shape.
- Em dashes in prose.
- Paragraphs that carry context across sentences instead of naming the actor, object, and outcome.
- Abstract nouns doing the work of concrete systems.

Low severity:
- Passive voice, adverbs, title case, and repetition. These are bad only when they reduce clarity. Technical docs may need them.

Detailed pattern guidance lives in `references/patterns.md`.

## Tangle Boundary Rules

Use exact product boundaries:

- Tangle Protocol: onchain contracts, governance, staking, slashing, service lifecycle, payments, and verifiable accounting.
- Tangle Router: hosted routing and policy infrastructure.
- Sandbox SDK / sandbox infrastructure: hosted or SDK-driven execution isolation and harness support.
- intelligence.tangle.tools: hosted intelligence/product surface, not the protocol.
- Blueprint SDK: developer tooling for building protocol-backed services.
- Blueprint: the service package/operators run; not the same thing as a service instance.
- Service instance: a live registration/request with operators, stake, pricing, and lifecycle state.

When a page crosses those boundaries, name both sides. Example: "The sandbox service can run the harness, while the blueprint records operator commitments and payments through the protocol."

## Rewrite Standard

Every replacement should make one of these moves:

- Name the actor.
- Name the mechanism.
- Name the source of truth.
- Name what is live versus what is planned.
- Remove a sentence that does not help the reader act.

Do not flatten all writing into terse fragments. Good technical docs can have rhythm, but every paragraph should pay rent.

## Output

For a review-only pass, lead with findings:

```text
Verdict: <score>/10, based on <N> files scanned and <N> files manually read.

P1
- path:line — <problem>. Evidence: <source checked>. Fix: <specific action>.

P2
- path:line — <problem>. Evidence: <source checked>. Fix: <specific action>.

Copy debt
- <pattern count or repeated issue>
```

For an editing pass, make the docs changes, run the repo's checks, then report the exact commands and results.

End with one dispatch line:

```text
Stop: docs pass complete.
Next: /website-craft for visual/navigation gaps.
Next: /tangle-blueprint-expert if facts about blueprint architecture remain uncertain.
```
