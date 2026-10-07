---
name: deep-clean
description: Delete dead code, duplicated logic, low-value tests, obsolete tooling, and unnecessary abstractions.
---

# Deep Clean

Remove unnecessary implementations and their maintenance burden while preserving required user behavior.

## Find justified changes

1. Establish scope, public contracts, existing work, and required checks.
2. Audit whole subsystems, duplicate engines, dependencies, compatibility layers, tests, scripts, and CI work.
   Use existing tools and timings; treat their warnings as leads.
3. Find the maintained library owner before retaining or replacing a local implementation.
4. Check source callers, exports, configuration, registries, generated entrypoints, and dynamic imports before deletion.
   Establish external use before retiring a published API.
5. Name the surviving capability and real proof for each removal.
   Unify semantics, not merely similar syntax.

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

## Implement and verify

Migrate consumers before removing the old owner; preserve unrelated work.
Check recovery, cleanup, cancellation, and public errors before removing handlers.
Retain validation at untrusted boundaries and trace internal values before strengthening types.
Run affected real proofs and required validation, then complete authorized delivery.
Diagnose failures against required behavior; distinguish implementation regressions from obsolete assertions.
Retain decisions and evidence in existing task state across turns.
Reconcile the full diff, separating source, tests, generated files, bytes, and measured runtime savings.
A no-change result needs concrete findings about the candidates inspected.

## Log the run

```bash
skill-run-log /deep-clean --target "<scope>: <N> files" --verdict <VERDICT> --next /<skill-or-stop>
```
