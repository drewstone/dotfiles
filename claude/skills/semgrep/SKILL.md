---
name: semgrep
description: Run Semgrep static analysis for security findings. Supports important-only or full scans, Semgrep Pro when available, merged SARIF, triage, and remediation plans.
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

Use this for static security analysis.
Run the real scanner; do not substitute grep-only guesses for Semgrep findings.

## Start

1. Confirm Semgrep is installed and identify repo languages.
2. Choose `important only` for high-confidence security or `run all` for broad coverage.
3. Use Semgrep Pro cross-file analysis when credentials/config allow it.
4. Split large scans by language or package only when it improves reliability.

## Flow

1. Run the selected ruleset and capture raw output.
2. Merge SARIF or JSON outputs when scanning in parallel.
3. Triage each finding against the source code before calling it real.
4. Rank by exploitability, impact, and confidence.
5. Fix real findings or produce a file:line remediation plan.
6. Re-run the relevant scan after fixes.

## Output

Report command, rulesets, files scanned, result counts, real findings, false positives, and artifact paths.
Use `references/full-reference.md` and `workflows/scan-workflow.md` for the full command workflow and ruleset matrix.

## Then consider

- `harden` when static findings imply exploitable security paths.
- `converge` when fixes must drive CI green.
