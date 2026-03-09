---
name: verify
description: "Verify work is complete and correct before shipping. Runs tests, checks git status, confirms nothing is broken or missing. Use when the user says 'verify', 'are you sure', 'is this done', 'double check', 'confirm everything works', or any variant of completion verification."
---

# Verify Before Ship

Perform a thorough verification that work is complete and ready to ship. Do NOT ask questions — run checks and report.

## Checks (run in parallel)

1. **Tests pass** — run the full test suite. Report pass/fail counts.
2. **Git clean** — `git status` to confirm all intended changes are staged/committed. Flag untracked files that look like they should be committed.
3. **No debug artifacts** — grep changed files for `console.log`, `print(`, `debugger`, `TODO`, `FIXME` that shouldn't ship.
4. **Build succeeds** — if the project has a build step, run it.
5. **No secrets** — scan changed files for patterns that look like API keys, passwords, or credentials.
6. **Diff review** — `git diff` (or `git diff HEAD` if committed) to sanity-check the changes are what was intended. Flag anything suspicious.

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
