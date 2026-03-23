---
name: evolve
description: "Goal-pursuit engine. Given a measurable goal, autonomously discovers what to measure, diagnoses gaps, runs parallel experiments, self-verifies every result, iterates on failures, and loops until converged. Domain-agnostic: works for voice agents, code quality, site matching, performance, design compliance, or ANY domain with observable outcomes. Decomposes goals into independent sub-goals and pursues them in parallel. Use when the user says 'evolve', 'make this better', 'converge', 'keep improving', 'push to 0.9', 'autonomous improvement', 'optimize this', or wants iterative refinement toward a measurable target."
---

# Evolve — Goal-Pursuit Engine

Given a measurable goal, figure out how to measure it, what's blocking it, how to fix it, whether the fix actually worked, and don't stop until converged.

## Core Principles

1. **Verify everything.** Never report "X didn't work, maybe A or B" — determine which one. After every experiment, confirm the change is live: check the DB, the API response, the deployed state. Ambiguity in a report is a bug in the loop.

2. **Iterate on failures.** A failed hypothesis gets 2-3 variations before it's abandoned. Different configs, different approaches, different framings. Check if the failure is in the experiment or in the deployment. The #1 failure mode is "change didn't actually deploy."

3. **Decompose and parallelize.** If a goal has independent sub-goals (5 agents, 3 services, N test files), decompose and pursue them in parallel. Use worktrees for conflicting code changes, parallel HTTP for independent API calls, concurrent subagents for independent research. Only serialize dependent steps.

4. **Measure the user's experience.** Measure what the end user sees, not what internal timers report.

5. **Infrastructure is a deliverable.** The measurement system is as valuable as the fixes. It persists, enables future cycles, and catches regressions automatically.

## The Loop

```
GOAL → DECOMPOSE → [MEASURE → DIAGNOSE → HYPOTHESIZE → EXECUTE → VERIFY → COMPARE]* → ITERATE
                     └─── parallel per sub-goal ───┘
```

This is not sequential. You jump between phases based on what you learn. Discovery happens during execution. Measurement reveals new goals. A verification failure sends you back to execute, not back to start.

## Phase 0: Understand the Goal

Parse the input into:

1. **Goal**: What does "done" look like? Must be measurable.
2. **Success criteria**: The threshold that defines convergence.
3. **Scope**: What's in play? Decomposable?

If vague ("make this better"), ask: "Better by what metric? What does 10/10 look like?"

If rich ("push all agent scores above 0.80"), proceed.

## Phase 1: Decompose

**Before measuring, ask: can this goal be split into independent sub-goals?**

| Goal | Sub-goals | Parallelism |
|------|-----------|-------------|
| "All 5 agents above 0.80" | One sub-goal per agent | 5 parallel evolve loops |
| "Latency < 1.5s and quality > 0.80" | Latency + quality | 2 parallel (may interact) |
| "All tests pass" | Group by failure cluster | N parallel fix streams |
| "Match reference site" | One per page | N parallel |

Independent sub-goals get their own measurement, their own experiments, their own progress tracking. They can run as parallel subagents, parallel worktrees, or (when Foreman dispatches) parallel Claude Code sessions.

Dependent sub-goals run sequentially: fix the build before running tests, deploy before measuring production.

## Phase 2: Discover Measurement

Check what exists before building anything:

- Test suites, eval runners, benchmark scripts
- Quality pipelines, CI workflows
- Existing scorecards, dashboards, monitoring

**Use what exists.** Compose fragments. Only build from scratch if nothing suitable exists (invoke `/improve`).

## Phase 3: Measure Baseline

Run the measurement. Save structured output. This is the anchor for all future comparisons.

```
Baseline — <timestamp>
  Target         Current    Gap
  score >= 0.80  0.63       -0.17
  safety >= 0.70 0.50       -0.20
```

## Phase 4: Diagnose

Identify failure clusters. For each, generate a hypothesis with:
- **Claim**: what will improve, by how much
- **Action**: specific change (code, config, prompt)
- **Verification**: how to confirm the change deployed
- **Expected metrics**: which numbers should move

Complex diagnosis → invoke `/diagnose`.

### Competitive context (when relevant)

Before hypothesizing fixes, check if the problem is solved elsewhere:
- How do competitors/alternatives handle this? What do they charge, how do they perform?
- Are there open-source implementations, papers, or benchmarks to reference?
- Where are we genuinely behind vs where are we already ahead?

Present as a comparison table. Be honest — if competitors are better, say so. This prevents reinventing solutions that already exist.

### Anti-overfitting discipline

These rules prevent benchmark gaming that produces fragile improvements:

1. **Never tune to specific test cases.** If a change only helps case X, it's memorization, not improvement.
2. **Validate on held-out cases.** If a larger case set exists, run the winner on it before promoting.
3. **Prefer architectural improvements over parameter tuning.** Changing a timeout is a knob turn. Adding batching is architectural. Architectural wins are more durable.
4. **Monitor for Goodhart's Law.** If the metric improves but the actual experience feels worse, the metric is wrong — fix the metric, not the code.
5. **Run 3+ reps** when possible. A single before/after is noisy. Multiple reps with consistent direction is signal.

### Hypothesis categories (prioritize top-down)

1. **Bug fixes**: failures that should be passes. Highest ROI, always first.
2. **Architectural**: new capabilities, better abstractions, smarter strategies.
3. **Efficiency**: same quality, less cost/time (prompt engineering, batching, caching).
4. **Parameter tuning**: config knob adjustments. Lowest priority, most likely to overfit.

## Phase 5: Execute Experiments

Run independent hypotheses in parallel:

- **Worktrees** for conflicting code changes
- **API mutations** (PUT/POST) for config/prompt changes
- **Subagents** for independent research or implementation

Each experiment: make change → build/deploy → **verify it's live** → measure → compare.

**There is no fixed limit on parallel experiments.** Run as many as are genuinely independent. The constraint is: you must verify and compare each one before promoting.

## Phase 6: Verify

**Before looking at scores, confirm:**

- [ ] Change is actually deployed (check DB, API, production state)
- [ ] Measurement ran against the changed version (not cached/stale)
- [ ] Results are structurally valid (not defaults or placeholders)

If verification fails → fix the deployment. Don't report unverified results.

**This is the step that most loops skip and most failures trace to.** Build it into muscle memory.

## Phase 7: Compare + Decide

```
Hypothesis     Before → After   Δ       Verdict
H1: style      0.45  → 0.78    +0.33   KEEP — promote
H2: safety     0.50  → 1.00    +0.50   KEEP — promote
H3: task       0.30  → 0.30    +0.00   ITERATE — verify deployment
```

Verdicts:
- **KEEP**: Clear improvement, no regressions. Promote to main.
- **ITERATE**: Didn't move, or moved wrong direction. Go back to Phase 5 with a variation. Check deployment first.
- **ABANDON**: 2-3 variations tried, verified deployed each time, still no movement. Document why and move on.
- **REGRESSION**: Something got worse. Revert. Investigate before trying again.

## Phase 8: Iterate

For ITERATE verdicts:
1. Verify deployment (failure mode #1)
2. Try a different approach to the same hypothesis
3. Check the scorer — maybe the metric doesn't capture what you changed
4. After 2-3 variations with verified deployment, mark ABANDON

For the overall goal:
- Re-diagnose from *current* state (not original baseline — you've improved)
- Generate new hypotheses for remaining gaps
- Execute next round

**Plateau detection**: Score doesn't move > 0.02 for 2 consecutive rounds → report what's structural vs fixable. Ask user whether to accept or push further.

## Phase 9: Persist — Structured Experiment Data

Every evolve cycle produces two artifacts:

### 1. Progress file (human-readable, for resume)

Write `evolve-progress.md` in the project root after every round:

```markdown
# Evolve Progress — <goal>
Score: 0.74 → target 0.80 (Round 2) — <timestamp>
## Remaining Gap
<what's still below target>
```

On resume: read this, skip to Phase 3, continue from last round.

### 2. Experiment log (structured JSON, for analysis)

Append to `.evolve/experiments.jsonl` — one JSON line per experiment. This is the data that enables cross-project learning and meta-analysis.

```jsonl
{"id":"exp_001","project":"phony","goal":"all agents above 0.80","round":1,"hypothesis":"safety disclaimers","category":"prompt","lever":"systemPrompt","targets":["agent-huberman","agent-mark-hyman","agent-peter-attia"],"baseline":{"safety":0.50},"result":{"safety":1.00},"delta":0.50,"verdict":"KEEP","durationMs":35000,"timestamp":"2026-03-20T00:00:00Z","reasoning":"Health creators need disclaimers. Judge flagged medical advice without caveats.","learnings":["Safety disclaimers lift all health agents universally","Single-line 'consult your physician' insufficient — need 5-6 specific guidelines"]}
```

**Required fields:**
| Field | Type | Purpose |
|-------|------|---------|
| `id` | string | Unique experiment ID |
| `project` | string | Repo/project name |
| `goal` | string | The evolve goal |
| `round` | number | Which cycle |
| `hypothesis` | string | What was tested |
| `category` | enum | `prompt` \| `config` \| `code` \| `infra` \| `model` \| `criteria` |
| `lever` | string | What was changed (systemPrompt, temperature, judge criteria, etc.) |
| `targets` | string[] | What was targeted (agent IDs, file paths, service names) |
| `baseline` | object | Metric values before |
| `result` | object | Metric values after |
| `delta` | number | Primary metric change |
| `verdict` | enum | `KEEP` \| `ITERATE` \| `ABANDON` \| `REGRESSION` |
| `durationMs` | number | How long the experiment took |
| `timestamp` | string | ISO 8601 |
| `reasoning` | string | Why this hypothesis was chosen |
| `learnings` | string[] | What was discovered (reusable insights) |

**Optional fields:**
| Field | Type | Purpose |
|-------|------|---------|
| `variation` | number | Which attempt (1, 2, 3 for iterations) |
| `parentId` | string | Previous experiment this iterates on |
| `deploymentVerified` | boolean | Was deployment confirmed before measuring? |
| `failureMode` | string | If failed: what went wrong (deployment, scoring, approach) |
| `crossPollinated` | boolean | Was this applied from another target's success? |

### Why structured data matters

1. **Cross-project patterns**: "Safety disclaimers worked on phony voice agents. Do they work on scribe meeting bots?" — queryable from the JSONL.
2. **Meta-learning**: Which categories of experiments have the highest success rate? Prompt changes? Config changes? Code changes?
3. **Failure analysis**: What's the most common failure mode? Deployment verification? Scoring artifacts?
4. **Research potential**: Aggregate data across projects → paper on autonomous improvement methodology.
5. **Foreman integration**: Foreman reads `.evolve/experiments.jsonl` from all repos to build cross-project intelligence.

### Product Quality Scorecard

The experiment log feeds into a **product scorecard** — a snapshot of all user flows and their quality:

```json
{
  "product": "phony",
  "timestamp": "2026-03-20T04:00:00Z",
  "flows": [
    {"name": "synthetic_conversation", "score": 0.80, "target": 0.85, "status": "pass"},
    {"name": "selfplay", "score": null, "target": 0.75, "status": "unmeasured"},
    {"name": "tool_calling", "score": null, "target": 0.80, "status": "unmeasured"},
    {"name": "onboarding", "score": null, "target": 0.70, "status": "unmeasured"},
    {"name": "voice_latency", "score": null, "target": 1500, "status": "unmeasured"}
  ],
  "aggregate": 0.80,
  "coverage": "1/5 flows measured",
  "evolveHistory": "4 cycles, +0.11 improvement"
}
```

Write to `.evolve/scorecard.json` after each cycle. This is what Foreman checks on heartbeat.

## Composing Skills

| Need | Skill | When |
|------|-------|------|
| Bootstrap measurement | `/improve` | No eval/test exists |
| Failure triage | `/diagnose` | Many clusters, need ranking |
| Code quality | `/polish` | Review → fix → re-review |
| Security | `/critical-audit` | Compliance convergence |
| Generational redesign | `/pursue` | Evolve has plateaued, need architectural leap |

## Orchestration by Foreman

When Foreman dispatches an evolve session:

**Input** (from Foreman):
```json
{
  "goal": "all agents above 0.80 on smoke eval",
  "scope": "~/code/phony",
  "successCriteria": { "metric": "aggregateScore", "threshold": 0.80 },
  "constraints": { "maxRounds": 5, "maxCostUsd": 10 }
}
```

**Output** (to Foreman):
```json
{
  "status": "converged|plateau|in_progress",
  "score": { "before": 0.63, "after": 0.77, "target": 0.80 },
  "rounds": 3,
  "experiments": [
    { "hypothesis": "safety disclaimers", "delta": 0.50, "verdict": "KEEP" }
  ],
  "remainingGap": "styleAdherence stuck at 0.50 — judge wants examples not traits"
}
```

Foreman uses this to: learn cross-repo patterns, decide whether to dispatch another session with a different strategy, or promote the result.

## Domain Specs

Evolve is domain-agnostic. Domain-specific knowledge lives in **specs**, not in this skill.

When a project has a `docs/EVOLVE-SPEC.md` (or equivalent), read it first. It tells you:
- How to measure (what command, what output format)
- What levers to pull (API mutations, code changes, infra)
- What to verify (DB state, deployment, caching)
- Known scoring artifacts to exclude

When Foreman dispatches evolve, it reads the spec and passes context in the session instruction. The skill doesn't need to know about any specific domain.

## Rules

- **Verify, then report.** Determine which, not "maybe A or B."
- **Iterate, then abandon.** 2-3 verified variations before giving up.
- **Decompose, then parallelize.** Independent sub-goals run simultaneously.
- **Measure the user.** End-to-end, not internal.
- **Persist always.** Progress survives interruption.
- **Score honestly.** 1.00 means perfect. Don't inflate.
- **Infrastructure compounds.** Good measurement systems pay dividends forever.
- **5 rounds max per invocation.** Persist and stop. User or Foreman re-invokes to continue.

## Decision Capture & Reflection

After completing work, capture significant decisions and reflect on the session:

- **During work**: when you make an architectural choice, pivot, or reject an alternative, note it. These become `/capture-decisions` records.
- **After each round/generation**: run `/reflect` to meta-analyze what happened — what worked, what didn't, what patterns emerged.
- **Decision records**: create `research/decisions/NNN-*.md` for any decision that changes direction, introduces new concepts, or rejects alternatives. Include rationale, alternatives, origin analysis (human vs AI contribution), and outcomes.
- **Failure records**: when something fails, create `research/failures/NNN-*.md` with root cause, debugging journey, fix, and prevention.

This is how the system learns across sessions. The structured records feed into Foreman's learning loop, inform future dispatches, and accumulate into publishable methodology documentation.
