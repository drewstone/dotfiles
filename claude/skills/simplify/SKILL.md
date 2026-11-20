---
name: simplify
description: Delete dead code, duplicated logic, low-value tests, obsolete tooling, and unnecessary abstractions; simplify what remains while preserving required behavior.
---

# Simplify

Excellent simplification removes whole concepts (a duplicate engine, a compatibility layer, a test suite that never catches anything) while every real consumer keeps working, and measures what disappeared.
It serves [AGENTS.md](../../AGENTS.md) rule 2: one name and one implementation per concept under the complete version, never a smaller product.
Preserve required user behavior and public contracts unless their retirement is authorized.

## Decide what is necessary

1. Audit whole subsystems, duplicate engines, dependencies, compatibility layers, tests, scripts and CI work before polishing internals, and find the maintained library owner before keeping a local implementation.
2. Check real consumers: callers, exports, configuration, registries, generated entrypoints, dynamic imports and persisted records, and establish external use before retiring a published API.
   A skill is in use when its owner has typed its name or invoked it, or a standing instruction, profile, hill or brief names it; a usage window counts runs, not these consumers.
3. Remove what the outcome does not need, then simplify and optimize what survives, naming the surviving capability and its proof for each removal.

With no live consumers or persisted records, delete the obsolete path and its redundant checks; with some, prove their cutover through the existing migration path, then delete the compatibility.
Historical records never require two implementations.
Prefer maintained libraries and direct calls over wrappers that add no policy, unify callers with the same semantics rather than similar syntax, and measure removed concepts and execution cost apart from line counts.

## Retire low-value tests

Choose proof in this order:

1. Full E2E through the shipped flow, with real dependencies; use production test accounts where authorized.
2. Integration across real data, API, persistence, process, and package boundaries.
3. Golden cases from representative real data, including consequential regressions and edge cases.

Never write a new unit or mock test, and never update one to follow an API change: delete it.
Keep an implementation-level unit test only for a consequential failure the stronger checks cannot reasonably detect, with the reason stated.
Delete tests that mirror private helpers, assert mock choreography, repeat equivalent cases or preserve obsolete architecture, with their exclusive fixtures, scripts and CI jobs; when a valid simplification breaks such tests, retire the assertions rather than rebuild the old code.
A mocked dependency cannot establish an integration or E2E claim; keep research and calibration evidence, and measure verification time, flakiness and rework, never coverage or test counts.

This policy follows the owner's testing priorities. [Callaway's test-deletion experiment](https://x.com/shcallaway/status/2106142042405453879) motivates the audit; its proposed benefits remain hypotheses.

## Implement and deliver

State the change, reason, risk and rollback before a nontrivial edit.
Migrate consumers before removing the old owner, those in other repositories we own included; check recovery, cleanup, cancellation and public errors before removing handlers, and keep validation at untrusted boundaries.
Run the real proof and required checks, telling implementation regressions from obsolete assertions, and finish the migration, deletion, release and served proof.
Report what disappeared (source, tests, generated files, bytes, measured runtime) and the surviving behavior; a no-change result names the candidates inspected and why each stays.

## Log the run

```bash
skill-run-log /simplify --target "<scope>: <N> files" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The simplified system only matches what it did before, and the outcome needs a better number | `/be-ambitious` | the measured baseline and the best known result to beat |
| Removal exposed a question about where the surviving concept should live | `/codebase-design` | the consumers and deletion-test results |
