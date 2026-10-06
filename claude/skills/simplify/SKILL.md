---
name: simplify
description: Delete dead code, duplicated logic, low-value tests, obsolete tooling, and unnecessary abstractions; simplify what remains while preserving required behavior.
---

# Simplify

Delete unnecessary work before improving what remains.
Preserve required user behavior and public contracts unless their retirement is authorized.

## Decide what is necessary

1. Establish the user outcome, scope, Git state, repository instructions, public contracts, existing work, and required checks.
2. Audit whole subsystems, duplicate engines, dependencies, compatibility layers, tests, scripts, and CI work before polishing their internals.
   Use existing tools and timings; treat their warnings as leads.
3. Find the maintained library owner before retaining or replacing a local implementation.
4. Check real consumers: source callers, exports, configuration, registries, generated entrypoints, dynamic imports, and persisted records.
   Establish external use before retiring a published API.
5. Delete unnecessary behavior; simplify, optimize, then automate what survives.
   Name the surviving capability and real proof for each removal.

Count live consumers and persisted records before retaining compatibility.
With none, delete the obsolete path and its redundant checks.
With consumers, use the existing migration path, prove their cutover, then delete compatibility when the remaining count reaches zero.
Keep historical evidence distinct from executable compatibility; preserving records does not require maintaining two implementations.

Prefer maintained library implementations and direct calls over wrappers that add no policy.
Unify callers with the same semantics, not merely similar syntax; retain meaningful domain differences.
Measure removed concepts, maintenance, and execution cost separately from line counts.

## Retire low-value tests

Choose proof in this order:

1. Full E2E through the shipped flow, with real dependencies; use production test accounts where authorized.
2. Integration across real data, API, persistence, process, and package boundaries.
3. Golden cases from representative real data, including consequential regressions and edge cases.

Presume implementation-level unit tests are removable.
Keep one only for a consequential failure that these stronger checks cannot reasonably detect; state the reason.
Delete tests that mirror private helpers, assert mock choreography, repeat equivalent cases, or preserve obsolete architecture.
Remove their exclusive fixtures, mocks, scripts, and CI jobs after checking remaining consumers.
When a valid simplification breaks such tests, retire the obsolete assertions rather than rebuilding the old implementation.

Reuse surviving proof; replacing every deleted test recreates the burden.
A mocked dependency cannot establish an integration or E2E claim.
Keep real boundary failures detectable, and preserve historical research and calibration evidence.
Measure verification time, invocations, flakiness, and agent rework where available; coverage percentages and test counts are not success targets.

This policy follows Drew's testing priorities.
[Callaway's test-deletion experiment](https://x.com/shcallaway/status/2106142042405453879) motivates the audit; its proposed benefits remain hypotheses.

## Implement and deliver

State the nontrivial change, reason, risk, and rollback before editing.
Migrate consumers before removing the old owner; preserve unrelated work and historical evidence.
Check recovery, cleanup, cancellation, and public errors before removing handlers.
Retain validation at untrusted boundaries and trace internal values before strengthening types.
Run the smallest sufficient real proof and required repository checks; reuse results whose inputs remain valid.
Diagnose failures against required behavior; distinguish implementation regressions from obsolete assertions.
Finish the authorized consumer migration, deletion, release, and served proof.

Reconcile the full diff, separating source, tests, generated files, bytes, and measured runtime savings.
Report what disappeared, the surviving behavior, measured effects, and missing evidence.
A no-change result needs concrete findings about the candidates inspected; stop when none justifies further work within scope.

## Log the run

```bash
skill-run-log /simplify --target "<scope>: <N> files" --verdict <VERDICT> --next /<next-skill-or-stop>
```
