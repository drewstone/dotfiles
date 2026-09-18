---
name: semgrep
description: Run and triage Semgrep security scans with SARIF output and focused remediation.
allowed-tools:
  - Bash
  - Read
  - Glob
  - Task
  - AskUserQuestion
  - TaskCreate
  - TaskList
  - TaskUpdate
---

# Semgrep

Run Semgrep against the requested source and triage its findings against the real code.
A completed static scan establishes coverage by the selected rules, not absence of vulnerabilities.

## Select and run

1. Identify the target, exclusions, languages, existing scan configuration, and installed Semgrep version.
   Use current CLI help for supported flags and output formats.
2. Select rules for the requested risks.
   Read [ruleset selection](references/rulesets.md) when existing project rules do not cover the requested language or risk.
3. Use the configured engine and existing authorization.
   Check Pro support when cross-file analysis is needed; distinguish unavailable credentials from unsupported capability.
   A local scan request does not authorize source upload or a paid service beyond the session's authority.
4. Save the exact command, engine, rules, rule revisions when available, exclusions, and output filenames in the run record.
   Use `--metrics=off` for scan and validation commands.
5. Run the scanner and keep raw JSON, SARIF, logs, and exit statuses in a dedicated project or scratch directory.
   Inspect scanner errors and skipped paths even if the command succeeds.
6. Trace findings to reachable inputs and affected behavior before calling them confirmed defects.
   Fix confirmed findings when repair is in scope, then repeat the relevant scan and regression checks.

For `important only` results, read [result filtering](references/result-filtering.md) before filtering the raw JSON.
Use that mode for a focused security review unless the user requests `run all` or another coverage policy.
Retain findings with missing metadata for manual triage and identify their uncertainty.

For multiple scans, read [combining scan results](references/combining-results.md) before dispatching or merging them.
Split by language or package only when it helps completion and preserves cross-file coverage.
Delegation is optional and subject to the available authority and resources.

## Report

Report the engine, commands, rules, files scanned, exclusions, failures, findings, confirmed defects, false positives, and artifact paths.
Reconcile counts against each artifact and keep raw, filtered, and deduplicated counts distinct.
Missing or failed scans remain incomplete even when other scans succeed.

## Log the run

```bash
skill-run-log /semgrep --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A reachable finding needs adversarial confirmation | `/harden` | the rule, source location, and input path |
| A fix causes failing CI | `/converge` | the failing check and corrected behavior |
| Findings identify an unnecessary module within cleanup scope | `/deep-clean` | the module, consumers, and findings |
