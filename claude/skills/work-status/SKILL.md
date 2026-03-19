---
name: work-status
description: "Quick progress check on current work. Shows what's done, what's remaining, and what's broken. Use when the user says 'what's next', 'what's remaining', 'where are we', 'is everything done', or any variant of progress check."
---

# Work Status

Give a concise status report on the current work. Do NOT ask questions — just investigate and report.

## Gather (parallel where possible)

1. **Git status** — `git status` and `git diff --stat` to see uncommitted changes
2. **Recent commits** — `git log --oneline -5` to see what's been done
3. **Test results** — run the project's test suite (pytest, vitest, cargo test, etc.)
4. **TODOs/FIXMEs** — grep for TODO, FIXME, HACK, XXX in changed files
5. **Task list** — check if there's an active task list in this session

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
