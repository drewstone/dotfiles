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

1. **Tests pass** — run the full test suite. Report pass/fail counts. For any test file ADDED in this diff, confirm it exercises real infra: real DB, real HTTP call, real sidecar — not `vi.fn()` / `mockFetch` / in-memory stubs standing in for the system under test. Mocks are fine at process boundaries; they are NOT fine as primary coverage of the new code. A mocked test passes while the production bug stays.
2. **No debug artifacts** — grep changed files for `console.log`, `print(`, `debugger`, `TODO`, `FIXME` that shouldn't ship.
3. **Build succeeds** — if the project has a build step, run it.
4. **No secrets** — scan changed files for patterns that look like API keys, passwords, or credentials.
5. **Changed behavior has a named regression** — every test added or modified in the diff should have a one-line comment or test name that describes the bug it would catch if the code regressed. Tests without a named regression are hope, not coverage.

## Report format

```
## Verification

| Check | Result |
|-------|--------|
| Tests | PASS (N passed, M failed) |
| Real-infra coverage | OK / N mocked tests covering new code |
| Git status | CLEAN / N uncommitted files |
| Debug artifacts | CLEAN / N found |
| Build | PASS / FAIL / N/A |
| Secrets scan | CLEAN / WARNING |
| Diff review | OK / N concerns |

Overall: SHIP IT / HOLD (reasons)
```

If any check fails, explain what needs fixing before shipping. Be specific.

## Stop condition + dispatch

- If `SHIP IT`: report complete, no further action.
- If `HOLD` with ≥1 FAIL: do NOT ship. Dispatch to the fix (`/pursue` if the fix is non-trivial, direct code edit if trivial), then re-run this skill.
- Never mark `SHIP IT` with HOLD reasons outstanding to "come back to later" — that's how defects ship.
