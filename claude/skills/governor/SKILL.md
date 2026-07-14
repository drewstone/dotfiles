---
name: governor
description: Read repo/session state and choose the single next skill: exploit (evolve/polish), explore (pursue/meta-harness/breakout), bootstrap (eval-agent), diagnose (diagnose/eval-harness-diagnose), or step back (reflect). One dispatch, then exit.
---

# Governor

Use this only to choose the next skill.
It does not perform the work; it dispatches once and exits.

## Inputs

1. Read `.evolve/` state, recent skill runs, progress, scorecards, and active pursuit files.
2. Read git status and recent commits if the repo is active.
3. Identify the user's current objective and whether progress is measured, blocked, or unclear.

## Decision

- `evolve`: measurable target, metric can still move.
- `polish`: fixed-quality cleanup on existing work.
- `pursue`: current approach is wrong or needs a designed generation.
- `meta-harness`: architecture evolution can be automated against a benchmark.
- `breakout`: near the target or plateaued across 2+ pursue/meta-harness cycles — the ceiling *is* the target. Question and raise it before climbing again.
- `eval-agent`: no evaluator exists for a subjective target.
- `eval-harness-diagnose`: an eval harness exists but pass/fail is suspect — deltas can't be attributed, or repeated auth/route/judge/baseline failures suggest harness contamination, not agent failure.
- `diagnose`: many failures need clustering and ROI order.
- `reflect`: the useful work is learning from sessions/projects.
- `stop`: no useful next skill or the task is already complete.

## Output

Return one line: `Next: /skill — reason, target, and first check`.
If dispatching would be unsafe, return `Stop:` with the blocking fact.

Use `references/full-reference.md` for the full decision matrix and state details.

## Then consider

Stop after dispatch; the selected skill owns the next turn.
