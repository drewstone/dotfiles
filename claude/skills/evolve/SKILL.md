---
name: evolve
description: "Full autonomous improvement cycle: analyze the codebase, diagnose what's failing, propose fixes, test them experimentally, promote winners, repeat. Orchestrates /improve → /diagnose → /research as composable sub-skills. Use when the user says 'evolve', 'make this better', 'autonomous improvement', 'self-improve', 'run the loop', 'optimize everything', or wants the full improvement cycle without manually invoking each step."
---

# Evolve — Autonomous Improvement Cycle

You are an autonomous staff research engineer. One invocation, full cycle. No hand-holding.

## The Loop

```
BOOTSTRAP → MEASURE → DIAGNOSE → EXPERIMENT → PROMOTE → REPEAT
```

Evolve is an **orchestrator**, not a standalone workflow. It composes three sub-skills and adds the outer loop (branching, promotion, iteration).

## Phase 1: Bootstrap (invoke /improve)

Check if experiment infrastructure exists:

1. Look for `scripts/measure.*`, `scripts/experiment.*`, `scripts/analyze.*`, or equivalent
2. Look for existing benchmark/test runners (`pnpm test`, `cargo test`, `pytest`, etc.)

**If experiment infrastructure exists:** skip to Phase 2.

**If not:** invoke `/improve` to build it. Wait for it to complete. Verify the measure script runs and produces structured output.

## Phase 2: Measure + Diagnose (invoke /diagnose)

1. Run the project's measure script (or test suite) to establish baseline numbers
2. If failures exist, invoke `/diagnose` with the output. It will:
   - Extract and classify failure traces
   - Cluster by root cause
   - Rank by impact / fix complexity
   - Generate hypotheses with specific fix proposals

**Output:** Baseline scorecard + ranked hypotheses from /diagnose.

```
Baseline — <date>
  Tests:       X/Y passing
  Benchmarks:  X% pass rate, $X/case, Xs avg
  Lint/types:  clean / N errors
  Key failures: <list>
```

## Phase 3: Experiment (invoke /research for each hypothesis)

For each top hypothesis from Phase 2 (max 3 per invocation):

1. **Create a branch** — `git checkout -b experiment/<hypothesis-id>`
2. **Implement the fix** — write the code
3. **Run gates** — lint, type check, tests. If gates fail, fix or abandon.
4. **Assess result:**
   - Run the measure script on the branch
   - Compare against baseline numbers from Phase 2
   - **Clear win** (failures fixed, no regressions) → proceed to promote
   - **Mixed** (some improvement, some regression) → analyze tradeoff, ask user if ambiguous
   - **No improvement or regression** → abandon, log findings, try next hypothesis

If the project has a research pipeline (A/B runner, experiment scripts), invoke `/research` to run a controlled experiment instead of manual before/after comparison.

## Phase 4: Promote

If the experiment produced a clear win:

1. Ensure all gates pass on the branch
2. Open a PR with:
   - What was diagnosed
   - What was changed
   - Experiment results (before/after numbers)
3. Report to the user

## Phase 5: Iterate

After promoting (or exhausting hypotheses):

1. Update the scorecard — show before/after
2. If more failure clusters remain, continue to the next hypothesis
3. If all high-impact clusters are addressed, report diminishing returns
4. Propose the next cycle's focus area

## Orchestration Rules

- **Compose, don't duplicate.** Use /improve, /diagnose, /research for their respective phases. Don't reimplement their logic.
- **Parallelize discovery.** Phase 1 should launch 2-3 subagents exploring different aspects simultaneously.
- **Don't rebuild existing infra.** If the project has `pnpm test`, use it. If it has a research pipeline, use it.
- **One hypothesis at a time for code changes.** Test one fix, merge it, re-baseline, then test the next.
- **Cost gate.** Before running anything that costs money (LLM benchmarks, cloud resources), estimate cost and present to the user. Proceed only with approval or if estimated cost < $5.
- **Time gate.** If an experiment will take >30 minutes, tell the user and offer to run in background.
- **Anti-overfitting.** If a fix only helps the specific failing test but doesn't generalize, it's a test-specific hack, not an improvement. Flag it.
- **Maximum 3 hypotheses per invocation.** After 3, report progress and let the user decide whether to continue.

## Adaptive Behavior

### If the project has rich experiment infrastructure:
Skip Phase 1. Go straight to Measure → Diagnose → use the existing pipeline.

### If the project is greenfield with no tests:
Phase 1 (/improve) builds the test infrastructure. Phase 2 becomes "run the tests I just wrote." The hypothesis is "the code has bugs these tests will reveal."

### If the project is an AI/agent system:
The full loop applies. Use /research for experiments. Cost and latency matter alongside accuracy.

## Output Per Cycle

```
Evolve Cycle <N> — <project name>
Date: <date>

Baseline:
  <scorecard>

Diagnosed: <N> failure clusters (via /diagnose)
  1. <cluster> — <N> failures, <root cause>
  2. <cluster> — <N> failures, <root cause>

Hypotheses tested: <N>
  1. <hypothesis> — <outcome> <branch/PR link if promoted>
  2. <hypothesis> — <outcome>

Scorecard After:
  <updated scorecard with deltas>

Cumulative improvement:
  <metric>: <start> → <now> (<delta>)

Next cycle recommendation:
  <what to focus on next>
```
