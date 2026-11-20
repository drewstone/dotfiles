---
name: verify
description: Run relevant tests, builds, checks, and git inspection; report proof and unchecked work.
---

# Verify

Excellent verification runs the check that would fail if the claim were false, on the revision being delivered, and says exactly what it did not cover.
A clean or fully pushed branch still needs the requested verification.

## Establish coverage

1. Identify the target, revision, comparison base, and the user's completion requirements.
2. Read git state, staged and unstaged changes, and the complete relevant branch diff.
3. Read the repository's checks and the tests that cover the changed behavior, applying the [test-value policy](../simplify/SKILL.md#retire-low-value-tests): real flows, integration boundaries and golden data.
4. Check changed files for exposed credentials and debug artifacts that would reach the delivered result, reading each candidate in context.

## Run and assess

Run the affected checks and the repository's enforced validation where the repository's process says to run them; when the layer names a gate host for builds and test suites, run them there, not on this machine.
Reuse valid results until changes invalidate them, and collect each exit status when checks run concurrently.
Confirm regression coverage can catch the behavior it claims to protect; a test double cannot stand in for the integration behavior a test claims.
With no build or test command, inspect the artifact with structural, link, syntax or behavioral checks and state that coverage instead of implying a suite ran.
Diagnose failures and fix them across every caller they reach when fixes are part of the request; keep report-only verification read-only.

## Result

Report each check's type and `PASS`, `FAIL`, `UNCHECKED` or `N/A` with its evidence, counts, exclusions, environment limits and open concerns, naming the verified revision and any change made after it.
Report whether the verified result beats the baseline or bar the work set, or only matches what existed.
A ready-for-release verdict means the requested verification passed; it does not grant deployment authority.

## Log the run

```bash
skill-run-log /verify --target "<what this run targeted>" --verdict <PASS|FAIL|PARTIAL|BLOCKED> [--pr <PR URL>] --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The checks pass but the work only matches what already existed, with no gain over the baseline or the best known result | `/be-ambitious` | the number to beat and the check that would show a gain |
| A failure's cause is unclear | `/diagnose` | the failing command, output and revision |
