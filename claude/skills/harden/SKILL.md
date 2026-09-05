---
name: harden
description: Test security boundaries, credentials, races, malformed input, and invariants; prove each fix.
---

# Harden

Test security and abuse resistance through the boundaries that enforce the product's requirements.
Prove weaknesses, fix their causes within scope, and preserve tests that catch recurrence.

## Investigate

1. Establish the authorized targets, test environment, sensitive data, and effects the tests may create.
   Use isolated test resources for destructive payloads, concurrent mutations, and recovery experiments.
2. Read the code and existing tests to map trust boundaries, authorization, parsers, secrets, storage, and external calls.
3. State the invariant for each selected boundary and choose an attack that could violate it.
   Rank work by consequence, reachability, and uncertainty.
4. Run the real implementation at the relevant boundary and capture a minimal reproduction.
   Test doubles may isolate unrelated dependencies; they must not replace the security behavior being tested.
5. Fix confirmed issues within scope and extend the existing regression tests.
   If no suitable test path exists, build the smallest one needed to demonstrate the failure and correction.

Read [adversarial cases](references/adversarial-cases.md) when selecting payloads for parsers, access control, outbound requests, credentials, or concurrent state changes.
Choose cases for boundaries present in the target, not for a fixed checklist quota.

## Evidence

Demonstrate impact with test identities and synthetic data rather than exposing credentials or unrelated user data.
Keep requests, relevant responses, code locations, test commands, state changes, and cleanup results.
A passing finite test supports the tested inputs and conditions; it does not prove that an invariant holds universally.
Keep untested attack paths and unverified hypotheses explicit.

For each finding, report the affected boundary, triggering input or state, evidence, impact, fix, regression result, and residual risk.
For continuing work, update the repository's existing security record or `.agent/harden/<date>-report.md`.

## Log the run

```bash
skill-run-log /harden --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Security fixes have failing CI | `/converge` | the failing checks and regression that must remain covered |
| A confirmed vulnerability has a useful static detection pattern | `/semgrep` | the vulnerable pattern and expected matches |
| A security change needs an independent code review | `/critical-audit` | the diff and preserved invariants |
| An authorized production fix needs live confirmation | `/deploy-proof` | the released artifact and safe behavior probe |
