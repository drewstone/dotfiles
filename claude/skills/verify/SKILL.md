---
name: verify
description: "Verify work is complete and correct before shipping. Runs tests, checks git status, confirms nothing is broken or missing. Use when the user says 'verify', 'are you sure', 'is this done', 'double check', 'confirm everything works', or any variant of completion verification."
---

# Verify Before Ship

Perform a thorough verification that work is complete and ready to ship. Do NOT ask questions — run checks and report.

## Pre-loaded Context

### Git Status
!`git status --short 2>/dev/null`

### Staged Changes
!`git diff --cached --stat 2>/dev/null`

### Unstaged Changes
!`git diff --stat 2>/dev/null`

### Changed Files (full diff for review)
!`git diff HEAD 2>/dev/null | head -200`

## Additional Checks (run in parallel)

1. **Tests pass** — run the full test suite. Report pass/fail counts.
2. **No debug artifacts** — grep changed files for `console.log`, `print(`, `debugger`, `TODO`, `FIXME` that shouldn't ship.
3. **Build succeeds** — if the project has a build step, run it.
4. **No secrets** — scan changed files for patterns that look like API keys, passwords, or credentials.

## Report format

```
## Verification

| Check | Result |
|-------|--------|
| Tests | PASS (N passed, M failed) |
| Git status | CLEAN / N uncommitted files |
| Debug artifacts | CLEAN / N found |
| Build | PASS / FAIL / N/A |
| Secrets scan | CLEAN / WARNING |
| Diff review | OK / N concerns |

Overall: SHIP IT / HOLD (reasons)
```

If any check fails, explain what needs fixing before shipping. Be specific.
