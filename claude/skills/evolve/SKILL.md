---
name: evolve
description: "Goal-pursuit engine: measure → diagnose → experiment → verify → iterate against a measurable target. Domain-agnostic — works on agents, code, content, design, GTM. Triggers: 'evolve', 'make this better', 'converge', 'push to 0.9', 'optimize'."
---

# Evolve — Goal-Pursuit Engine

Given a measurable goal, figure out how to measure it, what's blocking it, how to fix it, whether the fix actually worked, and don't stop until converged.

Shared conventions (state-first reads, persist-to-`.evolve/`, dispatch-at-end, no AI attribution, 5-rounds-max) live in `_common.md`. This skill inlines only what's evolve-specific.

## When evolve vs other skills

| Need | Skill |
|------|-------|
| The goal is a measurable metric and parameter changes can move it | **`/evolve`** |
| Evolve plateaued 3+ rounds, gap is architectural | `/pursue` |
| Correctness fine, gap is rubric-driven (quality, design, edge cases) | `/polish` |
| Many failures, need ROI ranking before fixing | `/diagnose` |
| No eval exists for a subjective target | `/eval-agent` (then evolve) |
| Loop is remote CI (push → wait → diagnose) | `/converge` |
| Question is "which approach works", needs structured hypotheses | `/research` |

## Resume

If `.evolve/` exists, read in order: `current.json`, `progress.md`, tail of `experiments.jsonl`, newest `pursuits/*.md`, project spec (`docs/EVOLVE-SPEC.md`). If `mode` names a different active skill within 24h, reconcile or dispatch `/governor`.

If a project uses `.bench/`, ADRs, Linear, or another canonical scorecard, use that — `.evolve/governor-config.json` records adopted paths.

## The loop

```
GOAL → DECOMPOSE → [MEASURE → DIAGNOSE → HYPOTHESIZE → EXECUTE → VERIFY → COMPARE]* → ITERATE
                       └─ parallel per sub-goal ─┘
```

Not sequential — discovery happens during execution, measurement reveals new goals, verification failure sends you back to execute (not back to start).

## Understand the goal

Parse the input into:
- **Goal**: what does "done" look like? Must be measurable.
- **Success criteria**: the threshold that defines convergence.
- **Scope**: what's in play? Decomposable?

If vague ("make this better"), ask: "Better by what metric? What does 10/10 look like?"

### Product-value claim (REQUIRED before any experiment)

For every metric in the success criteria, write one sentence:
> "If this number moves, what user-visible product outcome moves with it?"

If you can't, the metric is wrong. Stop. Evolve converges on whatever metric you point it at — proxy metrics are the default failure mode of offline evals. Force the linkage now, or you ship "wins" that don't move anything users feel.

Store the claim per-metric in `.evolve/current.json` under `metricClaims[<metric>]` so future rounds can validate.

- Bad: "expected-capability jaccard ≥ 0.5" with no claim that matching the list improves downstream agent success.
- Good: "p95 latency < 100ms" with claim "this path gates the user's first keystroke; jank shows up in session replay above 100ms."

## Decompose

Before measuring, ask: can this goal be split into independent sub-goals?

| Goal | Sub-goals | Parallelism |
|------|-----------|-------------|
| "All 5 agents above 0.80" | One sub-goal per agent | 5 parallel evolve loops |
| "Latency < 1.5s and quality > 0.80" | Latency + quality | 2 parallel (may interact) |
| "All tests pass" | Group by failure cluster | N parallel fix streams |
| "Match reference site" | One per page | N parallel |

Independent sub-goals get their own measurement, experiments, and progress tracking. Dependent sub-goals run sequentially (fix the build before running tests).

## Audit before building

Before proposing changes, verify what actually exists and works. Highest-ROI step in any evolve session — without it you build on assumptions.

10–15 minutes:
1. Read the actual code involved in measurement (eval runners, test endpoints, API routes).
2. Verify endpoints exist and match — call them, check response shapes, confirm auth works.
3. Run the existing measurement against production for a real baseline (not from memory).
4. Identify what's broken vs missing — broken infra needs fixing before experimenting.

Common failure modes this prevents: building against endpoints with different schemas, stale base URLs, half-built features returning faked data, duplicate infrastructure.

## Measurement

Use what exists. Improve what's incomplete. Only build from scratch if nothing suitable exists.

If the goal is **subjective** (writing quality, conversation fit, design match) and no eval exists → dispatch `/eval-agent` to build the judge from real reference material. Hand-authoring a rubric inline is the proxy-metric trap.

If the goal is **objective** (compiles, test passes, HTTP 200, string match) → write a test. LLM-as-judge on objective criteria adds variance.

Audit existing eval infrastructure: ≥5 scoring dimensions with explicit weights, per-turn metrics if multi-turn, prompt versioning (`.evolve/prompts/`), trace storage (JSONL + per-run files), statistical library (`evolve/eval-stats.ts` is a copy-in reference), cost tracking, multi-rep support (3-rep median minimum).

The eval infrastructure IS the product for improvement. A project with 3 dimensions and no traces can't improve systematically — fix that before running experiments.

## Baseline

Run the measurement, save structured output, anchor all future comparisons.

```
Baseline — <timestamp>
  Target         Current    Gap
  score >= 0.80  0.63       -0.17
  safety >= 0.70 0.50       -0.20
```

Per-turn metrics (if multi-turn): score at each cumulative turn to see completion growth, identify when quality degrades, track convergence turn + cost per turn + variance.

Prompt versioning: every experiment must be traceable to a specific prompt version. Without this, you can't distinguish prompt regressions from model variance.

## Diagnose

Don't just find failures — rank by ROI. Fix the thing that moves the most score for the least effort.

Dispatch `/diagnose` for the full triage methodology (ROI ranking, stratification, bimodality, per-turn checks, hypothesis generation). The minimal version (single target, one obvious cluster):

1. Cluster failures by dimension or error shape.
2. Pick the cluster with biggest gap × broadest blast radius × cheapest fix.
3. Write one hypothesis: claim, action, verification, expected metric change.

Multi-target, bimodal scores, or cross-dimension correlation → run `/diagnose` and feed its output into the next phase.

### Experiment design

Don't run all targets × all reps. Design the minimal experiment:

1. **Skip ceiling targets** (98% with CV=3% won't move).
2. **Focus movable targets** (60–80% AND CV > 10% — room to move AND measurable).
3. **Compute required reps** via `requiredReps(cv, expectedDelta)` from `eval-stats.ts`.
4. **Estimate cost** (reps × targets × avg per-run). Worth it?
5. **Define success criteria BEFORE running** ("median improves ≥5pp on ≥3 targets with d>0.5 and 0 regressions → KEEP").

### Hypothesis priority (top-down)

1. **Bug fixes** — failures that should be passes. Always first.
2. **Architectural** — new capabilities, smarter strategies.
3. **Efficiency** — same quality, less cost/time.
4. **Parameter tuning** — config knobs. Lowest priority, most likely to overfit.

### Anti-overfitting

- Never tune to specific test cases (memorization, not improvement).
- Validate on held-out cases when a larger set exists.
- Prefer architectural over parameter changes (more durable).
- Watch Goodhart's Law: if metric improves but experience feels worse, the metric is wrong — fix the metric.
- 3+ reps minimum, 5 for noisy targets. Use Cohen's d, not raw delta.

## Execute

Run independent hypotheses in parallel:
- **Worktrees** for conflicting code changes
- **API mutations** (PUT/POST) for config/prompt changes
- **Subagents** for independent research or implementation

Each experiment: change → build/deploy → **verify it's live** → measure → compare. No fixed parallelism limit — the constraint is verify-and-compare each one before promoting.

## Verify

Before looking at scores, confirm:
- [ ] Change is actually deployed (check DB, API, production state)
- [ ] Measurement ran against the changed version (not cached/stale)
- [ ] Results are structurally valid (not defaults or placeholders)

Verification fails → fix the deployment. Don't report unverified results. **This is the step most loops skip and most failures trace to.**

## Compare + decide

Use `compare()` from `eval-stats.ts`, not eyeballing. Every comparison includes median + 95% CI, Cohen's d, p-value, verdict.

Quick reference (full verdict tree, BH-FDR correction, paired vs unpaired tests in `stats.md`):

- d < 0.2 → **NOISE** regardless of raw delta
- d ≥ 0.5, p < 0.05, no regressions → **KEEP**
- d ≥ 0.5, p > 0.05 → **ITERATE** (need more reps)
- Any regression with d > 0.3 → **REVERT** immediately

After deciding: document what worked, what didn't, regressions with root cause, next hypotheses.

## Iterate

For ITERATE verdicts:
1. Verify deployment (failure mode #1).
2. Try a different approach to the same hypothesis.
3. Check the scorer — maybe the metric doesn't capture what you changed.
4. After 2–3 variations with verified deployment, mark ABANDON.

For the overall goal: re-diagnose from current state (not original baseline — you've improved), generate new hypotheses for remaining gaps, execute next round.

**Plateau detection**: score doesn't move >0.02 for 2 consecutive rounds → report what's structural vs fixable. Ask the operator whether to accept or push further.

**Escalation to /pursue**: evolve plateaued 3+ rounds AND the remaining gap is architectural (not tunable) → dispatch `/pursue`. Don't loop evolve indefinitely when the approach itself needs rethinking.

**Multi-rep stability**: if single-run scores oscillate >15% between runs, the signal is noise. Run 3 reps, take median. A target scoring 51/84/84 has a true median of 84, not an average of 73.

## Persist

Every cycle produces three artifacts:

1. **`.evolve/progress.md`** — human-readable resume state. On resume, read this and skip to baseline.
2. **`.evolve/current.json`** — `{mode, goal, status, round, generation, activePursuit, updatedAt}`. First file an agent reads.
3. **`.evolve/experiments.jsonl`** — one JSON line per experiment. Schema in `schema.md` (required fields, optional fields, scorecard shape, example). Read it before writing your first experiment of a session.

Also write `.evolve/scorecard.json` after each cycle (product flows with scores + targets + status), and append a line to `.evolve/skill-runs.jsonl` (schema in `_common.md`).

Reminders:
- Baseline and result must be median of ≥3 runs.
- Include `productValueClaim` so downstream readers can judge proxy vs real movement.

## Statistical rigor

Full reference in `stats.md`. The minimum bar:

- Report **median**, not mean. Means are dragged by outliers.
- Always include **N**.
- Use **Cohen's d** for comparisons (d < 0.2 is negligible regardless of raw delta).
- 3 reps minimum, 5 for noisy targets.
- Include **95% CI** ("median 85% [79%, 91%]" tells the reader how trustworthy the estimate is).
- Flag instability (CV > 20% means too noisy — fix variance source before optimizing the score).

A reference `eval-stats.ts` library lives in this directory. Copy it into any project's `tests/eval/lib/` for `describe()`, `compare()`, `histogram()`, `summaryReport()` functions.

## Domain specs

Evolve is domain-agnostic. Domain knowledge lives in **specs** (`docs/EVOLVE-SPEC.md` or equivalent), not in this skill. When a spec exists, read it first — it tells you how to measure, what levers to pull, what to verify, known scoring artifacts to exclude.

## Rules

- Read state first (`.evolve/current.json`, `.evolve/progress.md`).
- Verify, then report. Determine which, not "maybe A or B."
- Score honestly. 1.00 means perfect.
- 5 rounds max per invocation. Persist and stop. Re-invoke to continue.
- Every cycle ends with one explicit dispatch line: `Next: /evolve targeting <X>` or `Next: /pursue — plateaued on <metric>` or `Stop: <reason>`.
