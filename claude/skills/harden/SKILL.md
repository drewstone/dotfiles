---
name: harden
description: Test security boundaries, credentials, races, malformed input, and invariants, including Semgrep static scans; prove each fix.
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

## Static scans with Semgrep

Use a scan when the request names Semgrep or static coverage, or when a confirmed vulnerability has a useful detection pattern.
A completed static scan establishes coverage by the selected rules, not absence of vulnerabilities.

1. Identify the target, exclusions, languages, existing scan configuration, and installed Semgrep version.
   Use current CLI help for supported flags and output formats.
2. Select rules for the requested risks.
   Read [ruleset selection](references/semgrep-rulesets.md) when existing project rules do not cover the requested language or risk.
3. Check Pro support when cross-file analysis is needed; distinguish unavailable credentials from unsupported capability.
   A local scan request does not authorize source upload or a paid service beyond the session's authority.
4. Use `--metrics=off`, and save the exact command, engine, rules, rule revisions when available, exclusions, and output filenames.
5. Keep raw JSON, SARIF, logs, and exit statuses in a dedicated project or scratch directory.
   Inspect scanner errors and skipped paths even if the command succeeds.
6. Trace findings to reachable inputs and affected behavior before calling them confirmed defects, then fix and rescan as above.

For `important only` results, read [result filtering](references/semgrep-filtering.md) before filtering the raw JSON; use that mode for a focused security review unless the user requests `run all`.
For multiple scans, read [combining scan results](references/semgrep-combining.md) before dispatching or merging them.
Reconcile raw, filtered, and deduplicated counts against each artifact; a missing or failed scan remains incomplete even when other scans succeed.

## Evidence

Demonstrate impact with test identities and synthetic data rather than exposing credentials or unrelated user data.
Keep requests, relevant responses, code locations, test commands, state changes, and cleanup results.
A passing finite test supports the tested inputs and conditions; it does not prove that an invariant holds universally.
Keep untested attack paths and unverified hypotheses explicit.

For each finding, report the affected boundary, triggering input or state, evidence, impact, fix, regression result, and residual risk.
For scans, also report the engine, commands, rules, files scanned, exclusions, failures, false positives, and artifact paths.
For continuing work, update the repository's existing security record or `.agent/harden/<date>-report.md`.

## Log the run

```bash
skill-run-log /harden --target "<what this run targeted>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Security fixes have failing CI | `/converge` | the failing checks and regression that must remain covered |
| A security change needs an independent code review | `/critical-audit` | the diff and preserved invariants |
| Findings identify an unnecessary module | `/simplify` | the module, consumers, and findings |
| An authorized production fix needs live confirmation | `/ship` | the released artifact and safe behavior probe |
