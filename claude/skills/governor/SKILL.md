---
name: governor
description: Read current work, choose the next improvement skill, dispatch it once, and stop.
---

# Governor

Use this only to choose the next skill.
It does not perform the work; it dispatches once and exits.

## Inputs

1. Read `.evolve/` state, recent skill runs, progress, scorecards, and active pursuit files.
2. Read git status and recent commits if the repo is active.
3. Identify the user's current objective and whether progress is measured, blocked, or unclear.

## Decision

- `ground-truth`: about to optimize, debug, or benchmark a live system with no measured end-to-end breakdown of the real path. Stand up the harness before touching a fix, or you tune a number that is only true in a narrower context than you think.
- `calibrate-before-measure`: an eval, A/B, or benchmark is about to run but nobody proved the metric can see the effect being claimed, or that the task is hard enough to need the capability. Calibrate first; otherwise you measure the wrong thing for three experiments straight.
- `hypothesize`: about to optimize but "what to try" isn't obvious, or the field keeps repeating one idea, or no one surveyed how the world beats this ceiling — build a researched, ranked portfolio before spending compute.
- `evolve`: measurable target, metric can still move, and the next bet is clear (or `/hypothesize` already ranked it).
- `converge`: CI is red on the working branch. Nothing downstream is trustworthy until it is green, so fix root causes and land it before dispatching anything else.
- `autopsy`: a single result came back null, surprising, or too good. Root-cause that one result before believing it, and separate a real effect from an artifact, a no-op, saturation, or a measurement bug.
- `verify`: the work looks finished and is about to ship. Prove it with tests, git state, and the real artifact rather than declaring done.
- `handoff`: the session is ending or context is nearly exhausted with work still in flight. Write the brief so the next session resumes instead of re-deriving.
- `polish`: fixed-quality cleanup on existing work.
- `pursue`: current approach is wrong or needs a designed generation.
- `meta-harness`: architecture evolution can be automated against a benchmark.
- `breakout`: near the target or plateaued across 2+ pursue/meta-harness cycles — the ceiling *is* the target. Question and raise it before climbing again.
- `eval-agent`: no evaluator exists for a subjective target.
- `eval-harness-diagnose`: an eval harness exists but pass/fail is suspect — deltas can't be attributed, or repeated auth/route/judge/baseline failures suggest harness contamination, not agent failure.
- `diagnose`: many failures need clustering and ROI order.
- `finalize`: an experiment/pursuit branch carries several mixed changes worth shipping — split it into clean atomic PRs before landing.
- `reflect`: the useful work is learning from sessions/projects.
- `stop`: no useful next skill or the task is already complete.

## Output

Return one line: `Next: /skill — reason, target, and first check`.
If dispatching would be unsafe, return `Stop:` with the blocking fact.

Use `references/full-reference.md` for the full decision matrix and state details.

## Then consider

Stop after dispatch; the selected skill owns the next turn.
