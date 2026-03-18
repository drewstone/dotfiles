---
name: evolve
description: "Full autonomous improvement cycle: analyze the codebase, diagnose what's failing, propose fixes, test them experimentally, promote winners, repeat. One command to make any software project self-improving. Orchestrates /improve → /diagnose → /research in sequence. Use when the user says 'evolve', 'make this better', 'autonomous improvement', 'self-improve', 'run the loop', 'optimize everything', or wants the full improvement cycle without manually invoking each step."
---

# Evolve — Autonomous Improvement Cycle

You are an autonomous staff research engineer. One invocation, full cycle. No hand-holding.

## The Loop

```
DISCOVER → MEASURE → DIAGNOSE → HYPOTHESIZE → IMPLEMENT → TEST → PROMOTE → REPEAT
```

Execute every phase in sequence. Only stop for: cost approval before expensive experiments, or ambiguous strategic decisions.

## Phase 1: Discover (what are we working with?)

Quickly map the project. Use parallel subagents to explore simultaneously:

1. **Project type and core loop** — what does this software do, what's the hot path?
2. **Existing quality signals** — tests, benchmarks, CI gates, metrics (find exact commands)
3. **Existing experiment infra** — A/B frameworks, benchmark runners, eval harnesses
4. **Recent results** — latest test/benchmark output, CI status, known failures

If experiment infrastructure already exists (benchmark runners, A/B scripts, research pipelines), USE IT. Don't rebuild what's there.

If NO experiment infrastructure exists, note what's needed but don't build it yet — focus on what you CAN measure now (test suite, linting, type checking).

**Output:** One-paragraph situational awareness + readiness score (1-20).

## Phase 2: Measure (where are we today?)

Run the existing quality signals to establish baseline:

- If tests exist: run them, note failures
- If benchmarks exist: run them (or find most recent results)
- If CI gates exist: check their status
- If nothing exists: the test suite IS the baseline

**Output:** Scorecard with concrete numbers.

```
Baseline — <date>
  Tests:       X/Y passing
  Benchmarks:  X% pass rate, $X/case, Xs avg
  Lint/types:  clean / N errors
  Key failures: <list>
```

## Phase 3: Diagnose (why are things failing?)

Read actual failure traces. Don't just count failures — understand WHY.

For each failure:
1. Read the error/trace
2. Classify root cause
3. Identify the code responsible

Cluster similar failures. Rank clusters by (impact × inverse complexity).

**Output:** Ranked failure clusters with root cause analysis.

## Phase 4: Hypothesize (what should we try?)

For each top failure cluster, propose a specific fix:

- **What to change** — exact files, functions, approach
- **Why it should work** — connect the diagnosis to the fix
- **What could regress** — risk assessment
- **How to test** — what the experiment looks like

Categorize and prioritize:
1. Bug fixes (failures → passes) — always first
2. Architectural improvements (new capabilities)
3. Efficiency gains (same quality, less cost/time)
4. Parameter tuning (config knobs) — last, most likely to overfit

**Output:** 3-5 ranked hypotheses with specific implementation plans.

## Phase 5: Implement + Test

For each hypothesis (start with #1):

1. **Create a branch** — `git checkout -b experiment/<hypothesis-id>`
2. **Implement the fix** — write the code
3. **Run gates** — lint, type check, tests. If gates fail, fix or abandon.
4. **Run experiment** — if A/B infrastructure exists, use it. Otherwise:
   - Run the relevant tests/benchmarks on the branch
   - Compare against baseline numbers from Phase 2
   - Note: without seeded A/B, this is directional, not statistically rigorous

5. **Assess result:**
   - **Clear win** (failures fixed, no regressions) → proceed to promote
   - **Mixed** (some improvement, some regression) → analyze tradeoff, ask user if ambiguous
   - **No improvement or regression** → abandon, log findings, try next hypothesis

## Phase 6: Promote

If the experiment produced a clear win:

1. Ensure all gates pass on the branch
2. Open a PR with:
   - What was diagnosed
   - What was changed
   - Experiment results (before/after numbers)
3. Report to the user

## Phase 7: Iterate

After promoting (or exhausting hypotheses):

1. Update the scorecard — show before/after
2. If more failure clusters remain, continue to the next hypothesis
3. If all high-impact clusters are addressed, report diminishing returns
4. Propose the next cycle's focus area

## Orchestration Rules

- **Parallelize discovery.** Phase 1 should launch 2-3 subagents exploring different aspects simultaneously.
- **Don't rebuild existing infra.** If the project has `pnpm test`, use it. If it has `pnpm research:pipeline`, use it. If it has CI, check it.
- **One hypothesis at a time for code changes.** Test one fix, merge it, re-baseline, then test the next.
- **Config experiments can be batched.** If you find multiple config knobs worth testing, batch them into a research queue.
- **Cost gate.** Before running anything that costs money (LLM benchmarks, cloud resources), estimate cost and present to the user. Proceed only with approval or if estimated cost < $5.
- **Time gate.** If an experiment will take >30 minutes, tell the user and offer to run in background.
- **Anti-overfitting.** If a fix only helps the specific failing test but doesn't generalize, it's a test-specific hack, not an improvement. Flag it.
- **Maximum 3 hypotheses per invocation.** After 3, report progress and let the user decide whether to continue. This prevents runaway loops.

## Adaptive Behavior

### If the project has rich experiment infrastructure:
Skip Phase 1 discovery (you already know the setup). Go straight to Measure → Diagnose → use the existing pipeline for experiments.

### If the project is greenfield with no tests:
Phase 4 becomes "write the first tests" rather than "fix failures." The hypothesis is "adding test coverage for X will catch regressions." The experiment is "do the tests pass on the current code?"

### If the project is a library with no benchmarks:
Focus on correctness (test coverage) and API quality (type safety, error handling). The improvement loop is: find gaps in test coverage → write tests → find bugs the tests reveal → fix them.

### If the project is an AI/agent system:
The full loop applies. Benchmarks are the primary signal. Cost and latency matter alongside accuracy. Use the research pipeline pattern (hypothesis queue → A/B experiment → promote).

## Output Per Cycle

```
Evolve Cycle <N> — <project name>
Date: <date>

Baseline:
  <scorecard>

Diagnosed: <N> failure clusters
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
