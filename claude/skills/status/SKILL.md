---
name: status
description: "Quick status check on current work. Shows what's done, what's remaining, what's broken. Use when the user says 'what's next', 'what's remaining', 'status', 'where are we', 'is everything done', or any variant of progress check."
---

# Status Check

Give a concise status report on the current work. Do NOT ask questions — just investigate and report.

## Pre-loaded Context

### Git Status
!`git status --short 2>/dev/null`

### Recent Changes
!`git diff --stat 2>/dev/null`

### Recent Commits
!`git log --oneline -5 2>/dev/null`

## Additional Checks (parallel where possible)

1. **Test results** — run the project's test suite (pytest, vitest, cargo test, etc.)
2. **TODOs/FIXMEs** — grep for TODO, FIXME, HACK, XXX in changed files
3. **Task list** — check if there's an active task list in this session

## Report format

```
## Status

### Done
- <completed items, with file paths>

### Remaining
- <items not yet started or in progress>

### Broken
- <failing tests, errors, blockers>

### Uncommitted Changes
- <files modified but not committed>

### Next Step
<the single most important thing to do next>
```

Keep it short. No filler. Lead with what matters.
