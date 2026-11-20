---
name: harden
description: Test security boundaries, credentials, races, malformed input, and invariants, including Semgrep static scans; prove each fix.
---

# Harden

Excellent hardening attacks each boundary the way a skilled adversary would, proves every weakness with a minimal reproduction, and fixes the cause in its owner so the whole class of attack fails, with a regression test that shows it.

## Set the bar

Before testing, [set the bar](../be-ambitious/SKILL.md#set-the-bar): the best known attack on this kind of boundary (an OWASP class, a CVE in a comparable system, a public exploit write-up) with its source, our current exposure, the target (that class closed), and the check that shows it.

## Investigate

1. Establish the authorized targets and test environment, with isolated resources for destructive payloads, concurrent mutations and recovery experiments, and map trust boundaries, authorization, parsers, secrets, storage and external calls.
2. State the invariant for each boundary and the attack that could break it, ranking by consequence, reachability and uncertainty; read [adversarial cases](references/adversarial-cases.md) for parsers, access control, outbound requests, credentials and concurrent state, choosing cases for boundaries the target has rather than a checklist quota.
3. Run the real implementation at the boundary and capture a minimal reproduction; test doubles may isolate unrelated dependencies, never the security behavior under test.
4. Fix each confirmed issue in the code that owns it, across every path and caller with the same weakness ([AGENTS.md](../../AGENTS.md) rule 1), and extend the regression tests; with no suitable test path, build one that shows the failure and the correction.

## Static scans with Semgrep

Scan when the request names Semgrep or static coverage, or when a confirmed vulnerability has a useful detection pattern; a completed scan establishes coverage by the selected rules, not absence of vulnerabilities.

1. Identify target, exclusions, languages, existing scan configuration and installed Semgrep version, then select rules for the requested risks; read [ruleset selection](references/semgrep-rulesets.md) when project rules do not cover the language or risk.
2. Check Pro support when cross-file analysis is needed, distinguishing missing credentials from unsupported capability; a local scan request never authorizes source upload or a paid service.
3. Use `--metrics=off`, and save the exact command, engine, rules and their revisions, exclusions, raw JSON, SARIF, logs and exit statuses in a dedicated directory; inspect scanner errors and skipped paths.
4. Trace findings to reachable inputs and affected behavior before confirming them, then fix and rescan.

For `important only` results, read [result filtering](references/semgrep-filtering.md) before filtering the raw JSON, and use that mode for a focused review unless the user asks for `run all`.
For several scans, read [combining scan results](references/semgrep-combining.md); reconcile raw, filtered and deduplicated counts per artifact, and a missing or failed scan leaves the run incomplete.

## Evidence

Demonstrate impact with test identities and synthetic data, never exposed credentials or unrelated user data; a passing finite test supports its inputs, not the universal invariant, so keep untested attack paths explicit.
Report for each finding the boundary, trigger, evidence, impact, fix, regression result and residual risk (for scans also engine, rules, files, exclusions, failures and false positives) in the repository's security record or `.agent/harden/<date>-report.md`.

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
