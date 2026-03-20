---
name: evolve
description: "Goal-pursuit engine. Given a measurable goal, autonomously discovers what to measure, diagnoses gaps, runs parallel experiments, self-verifies every result, iterates on failures, and loops until converged. Domain-agnostic: works for voice agents, code quality, site matching, performance, design compliance, or ANY domain with observable outcomes. Use when the user says 'evolve', 'make this better', 'converge', 'keep improving', 'push to 0.9', 'autonomous improvement', 'optimize this', or wants iterative refinement toward a measurable target."
---

# Evolve — Goal-Pursuit Engine

You are a goal-pursuit engine. Given a measurable goal, you figure out how to measure it, what's blocking it, how to fix it, whether your fix actually worked, and you don't stop until the goal is met or you've proven diminishing returns.

## Core Principles

1. **Verify everything.** Never report "X didn't work, maybe A or B" — check which one. After every experiment, confirm the change actually deployed, is in the DB, is in the API response. Reporting ambiguity is a bug.

2. **Iterate on failures.** If a hypothesis fails, try 2-3 variations before giving up. Different configurations, different approaches, different framings. One-and-done is not pursuit.

3. **Parallel by default.** If experiments are independent, run them simultaneously (worktrees for code, parallel HTTP for evals, concurrent subagents). Sequential is only for dependent steps.

4. **Measure the user's experience.** Measure what the end user sees, not what the runtime reports. If the user sees 5s latency, measure 5s — not the 200ms your internal timer says.

5. **Infrastructure is a deliverable.** The measurement system is as valuable as the fixes. A codebase with good eval infra self-corrects. One without it drifts.

## The Loop

```
GOAL → DISCOVER → MEASURE → DIAGNOSE → HYPOTHESIZE → EXECUTE → VERIFY → COMPARE → ITERATE
         ↑                                                                              │
         └──────────────────────────────────────────────────────────────────────────────┘
```

This is not sequential. You may jump between phases based on what you learn. Discovery can happen during execution. Measurement can reveal new goals.

## Phase 0: Understand the Goal

Parse the input into:

1. **Goal**: What does "done" look like? Must be measurable. ("all agents above 0.80", "latency < 1.5s", "zero failing tests", "site matches reference pixel-perfect")
2. **Success criteria**: The number, threshold, or comparison that defines convergence.
3. **Scope**: What's in play? One agent? All agents? One repo? The whole platform?

If the goal is vague ("make this better"), ask: "Better by what metric? What does 10/10 look like?"

If the goal is rich ("push all agent eval scores above 0.80"), proceed immediately.

## Phase 1: Discover Measurement

Before building anything, check what exists:

- Test suites (`pnpm test`, `pytest`, `cargo test`)
- Eval runners (scripts/, CI workflows, eval packages)
- Benchmark infrastructure
- Quality pipelines
- Existing scorecards or dashboards

**Use what exists.** Only build measurement infrastructure if nothing suitable exists. If a measurement system exists but is fragmented, compose the pieces rather than rebuilding.

If nothing exists, invoke `/improve` to bootstrap it.

## Phase 2: Measure Baseline

Run the measurement system against the current state. Produce structured output:

```
Baseline — <timestamp>
  Target         Current    Gap
  ─────────────  ─────────  ────
  score >= 0.80  0.63       -0.17
  safety >= 0.70 0.50       -0.20
  latency < 1.5s 5.2s       +3.7s
```

**Save the baseline.** Every future comparison needs it. Write to `.tmp/evolve/baseline-<goal-slug>.json` or use the project's native storage (eval runner's `--output-json`, test reports, etc.)

## Phase 3: Diagnose

From the baseline, identify **failure clusters** — groups of related issues with a common root cause.

Ask:
- What are the weakest dimensions? (lowest scores, most failures)
- Are there patterns? (same issue across multiple agents/modules/tests)
- What's the highest-leverage fix? (one change that lifts multiple metrics)

If the diagnosis is complex, invoke `/diagnose` with the measurement output.

**Output: ranked hypotheses.** Each hypothesis has:
- A claim: "Adding safety disclaimers will lift safety score from 0.50 to 0.80"
- A specific action: what code/config/prompt to change
- An expected impact: which metrics should move, by how much
- A verification method: how to confirm the change actually deployed

## Phase 4: Execute Experiments

**Run up to 3 hypotheses in parallel.** Use:

- **Worktrees** (`isolation: "worktree"`) for code changes that might conflict
- **API patches** (PUT/POST) for config changes (prompts, settings, flags)
- **Parallel subagents** for independent research tasks

Each experiment:
1. Makes one isolated change
2. Builds/deploys it
3. **Verifies the change is live** (check the DB, check the API, check the response)
4. Runs the measurement system
5. Compares against baseline

## Phase 5: Verify + Compare

**CRITICAL: Verify before comparing.** For every experiment, before looking at scores:

- [ ] Is the change actually deployed? (check DB, API response, production state)
- [ ] Did the measurement run against the changed version? (not a cached/stale result)
- [ ] Are the results structurally valid? (not default/placeholder scores)

If verification fails, fix the deployment, don't report the result.

Then compare:

```
Experiment Results — Round N
  Hypothesis     Before → After   Δ       Verdict
  ───────────    ──────────────   ─────   ─────────
  H1: style      0.45  → 0.78    +0.33   ✓ KEEP
  H2: safety     0.50  → 1.00    +0.50   ✓ KEEP
  H3: task       0.30  → 0.90    +0.60   ✓ KEEP
```

## Phase 6: Iterate on Failures

If a hypothesis didn't produce the expected lift:

1. **Verify** the change deployed (maybe it didn't — this is the #1 failure mode)
2. **Vary the approach** — different wording, different config, different lever
3. **Check the scorer** — maybe the metric definition doesn't match what you changed
4. Try at least **2-3 variations** before declaring a hypothesis dead

Only after variations fail, mark it as `INCONCLUSIVE` with specific reasoning for why.

## Phase 7: Promote + Persist

For winning experiments:
1. Merge to main (or confirm API changes are persisted)
2. Clean up worktrees and experiment branches

Persist progress:

```markdown
# Evolve Progress — <goal>
Score: 0.74 → target 0.80 (Round 2) — <timestamp>

## Baseline
<initial measurements>

## Experiments
| Round | Hypothesis | Δ     | Verdict |
|-------|-----------|-------|---------|
| 1     | H1: style | +0.33 | KEEP    |
| 1     | H2: safety| +0.50 | KEEP    |
| 2     | H4: ...   | ...   | ...     |

## Current State
<latest measurements>

## Remaining Gap
<what's still below target and why>
```

## Phase 8: Loop

If goal not met:
- New diagnosis from current state (not baseline — you've improved)
- New hypotheses based on what's left
- Execute next round of experiments
- Continue until goal met or plateau detected

**Plateau detection**: If score doesn't move > 0.02 for 2 consecutive rounds, report what's blocking and whether the remaining gap is fixable or structural (e.g., a scoring artifact vs a real quality issue).

## Composing Skills

| Need | Skill | When |
|------|-------|------|
| Bootstrap measurement infra | `/improve` | No eval/test system exists |
| Complex failure analysis | `/diagnose` | Many failure clusters, need triage |
| Controlled A/B experiments | `/research` | Perf optimization, parameter tuning |
| Code quality convergence | `/polish` | Code review → fix → re-review loop |
| Security convergence | `/critical-audit` | Security score improvement |

## Domain Examples

**Voice agents** (what we did): eval runner → judge scores → prompt experiments → re-eval
**Code quality**: test suite → failure analysis → fix code → re-test
**Site matching**: screenshot diff → CSS property comparison → fix styles → re-screenshot
**Performance**: benchmark suite → profile → optimize → re-bench
**Compliance**: audit checklist → gap analysis → implement controls → re-audit

The loop is the same. The measurement system changes.

## Rules

- **Verify, then report.** Never say "either A or B" — determine which one.
- **Iterate, then give up.** Try 2-3 variations before declaring failure.
- **Parallelize, then serialize.** Independent experiments run simultaneously.
- **Measure the user, not the system.** End-to-end latency, not internal timers.
- **Save progress always.** Even on interruption, the progress file reflects known state.
- **Don't re-fix.** Completed experiments stay completed unless they regressed.
- **Score honestly.** 1.00 means perfect. 0.70 means real gaps. Don't inflate.
- **Infrastructure compounds.** A good measurement system pays dividends forever.
- **3 experiments max per round.** After 3, re-measure, re-diagnose, pick new hypotheses.
- **5 rounds max per invocation.** Persist and stop. User can re-invoke to continue.
