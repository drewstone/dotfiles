---
name: governor
description: Read repo/session state and choose the single next skill: exploit with evolve/polish, explore with pursue/meta-harness, bootstrap with eval-agent, or step back with reflect.
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
- `eval-agent`: no evaluator exists for a subjective target.
- `diagnose`: many failures need clustering and ROI order.
- `reflect`: the useful work is learning from sessions/projects.
- `stop`: no useful next skill or the task is already complete.

## Output

Return one line: `Next: /skill — reason, target, and first check`.
If dispatching would be unsafe, return `Stop:` with the blocking fact.

Use `references/full-reference.md` for the full decision matrix and state details.

## Then consider

Stop after dispatch; the selected skill owns the next turn.
