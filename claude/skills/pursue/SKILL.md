---
name: pursue
description: "Meta-skill for relentless goal pursuit through generational leaps, not just incremental tuning. Audits the full system, designs bold architectural changes, builds them completely, tests as a unit, and tracks with a pursuit document. The orchestrator above /evolve — it thinks in generations while evolve thinks in experiments. Use when the user says 'pursue this', 'keep going until done', 'don't stop', 'relentlessly optimize', 'think bigger', 'next generation', or wants transformative improvement toward a measurable target."
---

# Pursue — Generational Goal Pursuit

Most improvement comes from architectural shifts, not parameter tuning. `/evolve` runs tight experiment loops. `/pursue` redesigns the system, ships a generation, then hands off to `/evolve` for fine-tuning.

## Start Here

If `.evolve/` exists, read in order before designing:
1. `.evolve/current.json`
2. `.evolve/progress.md`
3. Newest file in `.evolve/pursuits/`
4. Tail of `.evolve/experiments.jsonl`
5. Any project spec (`docs/EVOLVE-SPEC.md`)

## Fit Check — before bootstrapping

Before planting state or designing a generation:

1. **Repo shape check.** `/pursue` fits optimization, product, and greenfield repos. It does NOT fit library repos whose public API constrains "bold bets" — `/polish` or `/harden` are usually right there.
2. **Resume check.** If `.evolve/current.json` names a different active skill within the last 24h, reconcile — continue in-flight work or dispatch `/governor` to decide. Don't start a new pursuit while another skill's generation is mid-flight.
3. **State adapter.** If the repo uses `docs/decisions/` (ADRs), `.bench/`, Linear, or another convention, adopt it — don't force `.evolve/` onto a mature repo that has its own pattern. `.evolve/governor-config.json` (if written by `/governor`) names the adapted paths.
4. **Baseline drift.** If a prior baseline exists, run the eval's smoke path once. If it diverges >10% from the recorded number, baseline is stale — re-seed before designing against it (a generation built on a stale baseline regresses on re-measurement, not on merit).

If any of these surface uncertainty, dispatch `/governor` — don't guess.

## When Pursue vs Evolve

| Signal | Skill |
|--------|-------|
| "Make this metric go up" | `/evolve` |
| "This approach isn't working" | `/pursue` |
| "Think bigger" | `/pursue` |
| Score plateau across 2+ evolve cycles | `/pursue` |

## The Cycle

```
AUDIT → DESIGN → REVIEW → BUILD → DIFF-AUDIT → TEST → EVALUATE → PERSIST
```

Each cycle ships a GENERATION — a coherent set of changes. `/evolve` fine-tunes within it.

## Phase 0: Audit

Read the actual code and `.evolve/` state. Not your memory. Not summaries.

Write `.evolve/pursuits/<date>-<goal-slug>.md`:

```markdown
# Pursuit: {goal}
Generation: {N}
Status: auditing

## Metric → product-value claim (REQUIRED before moving on)
For each metric in the goal, write one sentence:
"If this number moves, what user-visible product outcome moves with it?"

If you can't write it, the metric is wrong. Stop and rescope with the
operator. Pursue converges happily on proxy metrics if you don't force
the linkage now — that's how "successful" generations ship with no
measurable product effect.

## System Audit
- What exists and works
- What exists but isn't integrated
- What was tested and failed (with WHY)
- What doesn't exist yet
- Measurement gaps

## Baselines (median of ≥3 runs)
Run each measurement ≥3 times. Record the median AND the individual
run values. If spread is >10% of the mean on any dimension, run 5 more
and either (a) note the metric is too noisy to evolve against, or
(b) tighten the measurement (more scenarios, deterministic judge).

A single-run baseline causes false wins on Gen N and phantom regressions
on Gen N+1 — the same variant looks great or terrible depending on
which run you sampled.

If a metric's product-value claim names a subjective outcome (writing
quality, conversation fit, scaffold usefulness, design match) and no
judge exists, dispatch `/eval-agent` to build one before baselining.
Hand-authoring a judge inline during pursue defeats the proxy-metric
gate — the whole point is to measure against real reference material,
not against whatever rubric you invent under deadline pressure.

## Diagnosis
[root cause — what's architectural vs tunable]
```

## Phase 1: Design — Think in Generations

A generation = 5–20 coordinated changes + at least 1 architectural change + a clear thesis ("Gen N works because of shift X").

### The five rules

1. **Moonshot check.** Write one paragraph describing the 10x redesign (not 10%). Explicitly adopt or reject it. If you can't name what you rejected, you didn't try hard enough.

2. **Match the codebase.** Before writing code that calls an existing API or does an existing operation, find 3 existing callsites and match their pattern exactly — imports, auth wrappers, error handling, logging, file layout. Pattern-deviation bugs are the #1 cause of post-merge criticals. Run the preflight:
   ```bash
   bash ${SKILL_DIR}/preflight.sh <pattern1> <pattern2> ...
   ```
   (e.g., `preflight.sh secureFetch withSidecarUpstreamAuth`)

3. **Design for interaction.** Coupled changes ship together. Don't A/B test coupled changes.

4. **Include measurement.** If the eval can't detect the improvement, the eval must change too — new judges, new dimensions.

5. **Reject safe.** If every change is low-risk, this is `/evolve`, not `/pursue`. The point is bold bets.

### Spec addition

```markdown
## Generation {N} Design

### Thesis
[one sentence: why Gen N is dramatically better]

### Moonshot considered
[the 10x redesign — adopted or rejected, with reason]

### Codebase conventions matched
- Auth: [pattern + existing callsites]
- Errors: [pattern + existing callsites]
- Logging: [pattern + existing callsites]

### Changes (ordered by impact)
#### Architectural (must ship together)
#### Measurement
#### Infrastructure

### Alternatives
- [approach X] — rejected because [reason]

### Risk + Success criteria
- [what could go wrong, rollback plan, reversibility]
- [metric → from → to]
```

## Phase 1.5: Review — Adversarial Audit

**Mandatory** for changes touching: auth, crypto, TLS, data boundaries, concurrency, external APIs, lifecycle (create/delete), or any trust boundary. Skip only for one-file reversible changes.

1. **Map the change.** Every file, process, event, external dependency.
2. **Spawn adversarial perspectives in parallel.** Security, reliability, performance, UX, red team. Each produces: verdict + concerns (with severity) + alternative + would-block flag.
3. **Enumerate failure modes mechanically.** For each spawn/fetch/write/event/shared-resource: what fails, how it manifests, how it propagates, how it recovers.
4. **Red team round.** Day 1, day 30, day 90. Under load, partial failure, concurrent users, adversarial input. Each attack: mitigated / accepted / blocks plan.
5. **Pick the strongest plan, not the highest-scoring.** 8/8/8/8 beats 9/9/9/3 — the 3 is the hole that fails.
6. **Capture the decision** in the pursuit spec.

Done well, saves more time than it spends. Done as ritual, worse than nothing.

### Phase 1.5 blocking gate

Before advancing to Phase 2 Build, answer each question in the pursuit
spec. If ANY answer is yes, Phase 1.5 Review is blocking — you cannot
skip it, only defer a one-file reversible shim.

- Does any diff file touch auth, crypto, TLS, signing, or trust boundaries?
- Does any diff file touch billing, payments, subscriptions, credits?
- Is the total diff >5 files or >300 lines?
- Does the change add or modify an external API endpoint?
- Does the change modify lifecycle operations (create, delete, provision)?
- Does the change introduce concurrency, locking, or shared mutable state?

If all answers are no, mark the gate passed in the spec with the literal
line `Phase 1.5 gate: passed (all-no)`. This exists because two
independent reflections (blueprint-agent hosting, agent-dev-container
skills-workflow) documented Phase 1.5 being silently skipped on
trust-boundary changes and CRITs being caught post-merge.

## Phase 2: Build — Complete Before Testing

Build ALL coupled changes before testing any. No A/B on coupled changes.

**Boil the ocean.** A generation is complete or it's nothing. No "coming
soon," no TODO markers on critical paths, no "we'll wire it up next
round." If the change requires three files to ship and you've built two,
you have not built a generation — you've accumulated debt. Finish.

Track in the spec:

```markdown
### Build Status
| # | Change | Status | Files | Tests |
|---|--------|--------|-------|-------|
```

Integration checklist: compiles, no conflicts, measurement updated, checkpoints work.

## Phase 3: Test

Run the complete pipeline end-to-end with ALL changes active. Full eval battery. Compare to previous generation baselines.

## Phase 3.5: Diff Audit — Catch Pattern Deviations

Before declaring done, audit the diff. Focus: does new code match codebase patterns? Does it reuse existing utilities? Does every branch have test coverage?

**Preferred path**: dispatch `/critical-audit --diff-only`. It serializes
its reviewers (no 429s), outputs a fix-plan keyed by file:line, and
persists the run under `.evolve/critical-audit/` so Phase 4 can compare
against it.

**Fallback**: if `/critical-audit --diff-only` isn't available in this
environment, run the shell helper:

```bash
bash ${SKILL_DIR}/diff-audit.sh
```

Either path: fix every CRITICAL and HIGH before Phase 4. Skip only for
one-file reversible changes. Three independent reflections
(skills-workflow, hosting-skill-workflow, gpu-providers-session) show
CRITs landing in main because this step was treated as optional — it
is not.

## Phase 4: Evaluate

```markdown
## Generation {N} Results

### Scores
| Judge | Prev | Now | Δ | Verdict |

### Human assessment
[read actual output. rate honestly. quote passages.]

### What worked / didn't / surprised
### Verdict: ADVANCE / PARTIAL / REVERT
### Seeds for Gen {N+1}
```

## Phase 5: Persist — Hand Off to Evolve

1. Update pursuit spec with results.
2. Append to `.evolve/experiments.jsonl`.
3. Update baselines.
4. Write `.evolve/progress.md`.
5. Write `.evolve/current.json`: `mode: "evolve", generation: N, activePursuit: null`.
6. **End every pursue session with an explicit handoff line**: "Run `/evolve` targeting X against baseline Y."

If new judges were added, run them on previous-gen artifacts to establish backward-compatible baselines.

## Rules

1. Audit before designing.
2. Design before building.
3. Match the codebase before writing new code.
4. Build whole generation before testing.
5. Diff-audit before declaring done.
6. Persist in `.evolve/`.
7. Think in generations. Take risks. Evaluate honestly.

## Related Skills

```
/pursue          ← generational design + coordination
  ├── /research  ← investigate alternatives before designing
  ├── /evolve    ← fine-tune after the generation ships
  ├── /diagnose  ← when results are surprising
  ├── /polish    ← final quality pass before shipping
  └── /reflect   ← after each generation, extract learnings
```
