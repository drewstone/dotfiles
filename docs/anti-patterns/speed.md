# Speed and iteration

How to make a product, a pipeline or a codebase faster with agents, and keep it fast.
Distilled from Anthropic's claude.ai performance sprint (3.1x on the journeys that matter) and Max Woolf's agentic-iteration work (2x–20x on Rust hot paths), reconciled with how we work.

## The rules

1. **Measure first; a metric makes a thing tractable.** Nothing is "slow" until it has a number on the deployed path with sample size, vantage and warm/cold state. Once it has one, optimize against that number, not against an impression.
2. **Pick the few journeys users feel.** Name them, hand-pick the projects behind them, hit the targets, then keep driving; a target is a floor, not a stopping point.
3. **Baseline, target, iterate to convergence.** Set a constraint ("every benchmark at least 1.2x faster, zero regressions"), not a wish ("make it faster"). Stop when gains fall inside the noise or the code added outweighs the gain.
4. **Deterministic counters for gates, wall-clock for the field.** CI gates read instruction counts, call counts, layout or query counts, bytes; wall-clock is too noisy to gate on and belongs in field telemetry by build version.
5. **Ratchets only move one way, and every win gets a guard.** Performance wins decay in a moving codebase: a daily ratchet, a regression job, or a test that pins the property (static markup never drifts from the render) is part of the change, not a follow-up.
6. **Ship behind a flag, roll out in rings.** Employees, then 1%, then everyone; retire the flag once the win holds. Half the flags should be gone by the end of the sprint.
7. **Many narrow threads, one human taste.** Parallel agents each own one narrow, measurable thread; the human supplies ambition, before/after judgement, and scope discipline. Cheap subagents explore hypotheses; the expensive one integrates.
8. **Delete on the way.** A refactor pass with a size target (at least 20% fewer lines, zero regressions) after an optimization pass keeps the win maintainable.

## What agents do that is not a win

- **Benchmark gaming**: fewer epochs, a disabled subsystem, an edited benchmark, `target-cpu=native`, or a "win" measured while another benchmark ran in parallel. Benchmarks are independent, sequential, and cover small and large, simple and complex inputs; a visual or canonical-output check catches subtle cheats; the diff is audited for changes to the measurement itself.
- **Lazy convergence**: hyperparameter nudges declared as victory because no target was set.
- **Wall-clock gates**: a flaky CI number that does not track user experience, which teaches everyone to ignore red.
- **Optimizations not worth their maintenance**: complexity that buys a number nobody feels.
- **Unguarded wins**: a fix that lands without the ratchet, test or monitor that keeps it.

## Applying it here

- Start any "make X faster" task by writing the journey, the current number with its method, the target, and the guard that will hold it.
- Prefer a real-flow measurement against the real service over a synthetic bench; label vantage and state.
- When an agent reports a speedup, ask for the sequential benchmark, the diff to the benchmark itself, and the regression guard before merging.
- Record the number and the method where the next agent will read them (the repo's speed docs, the PR body), not only in chat.
