---
name: pursue
description: "Generational leaps, not parameter tuning. Audits the system, designs a coherent set of architectural changes, builds them all, tests as a unit. Triggers: 'pursue this', 'think bigger', 'next generation', 'this approach isn't working', evolve plateau."
---

# Pursue — Generational Goal Pursuit

Most improvement comes from architectural shifts, not parameter tuning. `/evolve` runs tight experiment loops. `/pursue` redesigns the system, ships a generation, hands off to `/evolve` for fine-tuning.

Shared conventions in `_common.md`.

## Pursue vs evolve vs polish

| Signal | Skill |
|--------|-------|
| "Make this metric go up" | `/evolve` |
| "This approach isn't working" | `/pursue` |
| "Think bigger" | `/pursue` |
| Score plateau across 2+ evolve cycles | `/pursue` |
| Correctness fine, gap is rubric-driven | `/polish` |

## Resume

Read in order: `.evolve/current.json`, `.evolve/progress.md`, newest in `.evolve/pursuits/`, tail of `.evolve/experiments.jsonl`, project spec. If `current.json` names a different active skill within 24h, reconcile or dispatch `/governor` — don't start a new pursuit while another generation is in flight.

If the repo uses `docs/decisions/` (ADRs), `.bench/`, Linear, or another convention, adopt it via `.evolve/governor-config.json`.

If a prior baseline exists, run the smoke path once. >10% drift vs recorded → re-seed first (a generation built on a stale baseline regresses on re-measurement, not on merit).

## The cycle

```
AUDIT → DESIGN → REVIEW → BUILD → DIFF-AUDIT → TEST → EVALUATE → PERSIST
```

Each cycle ships a GENERATION — a coherent set of changes. `/evolve` fine-tunes within it.

## Audit

Read the actual code and `.evolve/` state. Not your memory. Not summaries.

Write `.evolve/pursuits/<date>-<goal-slug>.md`:

```markdown
# Pursuit: {goal}
Generation: {N}
Status: auditing

## Metric → product-value claim (REQUIRED before moving on)
For each metric in the goal, write one sentence:
"If this number moves, what user-visible product outcome moves with it?"

If you can't write it, the metric is wrong. Stop and rescope.
Pursue converges happily on proxy metrics — that's how "successful"
generations ship with no measurable product effect.

## System Audit
- What exists and works
- What exists but isn't integrated
- What was tested and failed (with WHY)
- What doesn't exist yet
- Measurement gaps

## Baselines (median of ≥3 runs)
Run each measurement ≥3 times. Record median + individual values.
If spread >10% of mean on any dimension, run 5 more and either
(a) note the metric is too noisy to evolve against, or
(b) tighten measurement (more scenarios, deterministic judge).
A single-run baseline causes false wins on Gen N and phantom regressions
on Gen N+1.

If a metric's product-value claim names a subjective outcome (writing
quality, conversation fit, scaffold usefulness, design match) and no
judge exists, dispatch `/eval-agent` to build one before baselining.

## Diagnosis
[root cause — what's architectural vs tunable]
```

## Design — think in generations

A generation = 5–20 coordinated changes + at least 1 architectural change + a clear thesis ("Gen N works because of shift X").

### The five rules

1. **Moonshot check.** Write one paragraph describing the 10× redesign (not 10%). Adopt or reject. If you can't name what you rejected, you didn't try hard enough.

2. **Match the codebase.** Before writing code that calls an existing API, find 3 existing callsites and match their pattern exactly — imports, auth wrappers, error handling, logging, file layout. Pattern-deviation is the #1 cause of post-merge criticals. Run the preflight:
   ```bash
   bash ${SKILL_DIR}/preflight.sh <pattern1> <pattern2> ...
   # e.g., preflight.sh secureFetch withSidecarUpstreamAuth
   ```

3. **Design for interaction.** Coupled changes ship together. Don't A/B test coupled changes.

4. **Include measurement.** If the eval can't detect the improvement, the eval must change too — new judges, new dimensions.

5. **Reject safe.** If every change is low-risk, this is `/evolve`, not `/pursue`. The point is bold bets.

### Spec addition

```markdown
## Generation {N} Design

### Thesis
[one sentence: why Gen N is dramatically better]

### Moonshot considered
[the 10× redesign — adopted or rejected, with reason]

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

## Adversarial review

**Mandatory** for changes touching: auth, crypto, TLS, data boundaries, concurrency, external APIs, lifecycle (create/delete), or any trust boundary. Skip only for one-file reversible changes.

1. **Map the change.** Every file, process, event, external dependency.
2. **Spawn adversarial perspectives in parallel.** Security, reliability, performance, UX, red team. Each produces verdict + concerns (severity) + alternative + would-block flag.
3. **Enumerate failure modes mechanically.** For each spawn/fetch/write/event/shared-resource: what fails, how it manifests, propagates, recovers.
4. **Red team round.** Day 1, day 30, day 90. Under load, partial failure, concurrent users, adversarial input. Each attack: mitigated / accepted / blocks plan.
5. **Pick the strongest plan, not the highest-scoring.** 8/8/8/8 beats 9/9/9/3 — the 3 is the hole that fails.
6. **Capture the decision** in the pursuit spec.

Done well, saves more time than it spends. Done as ritual, worse than nothing.

### Blocking gate

Before advancing to Build, answer in the pursuit spec. Any yes = review is blocking.

- Does any diff file touch auth, crypto, TLS, signing, or trust boundaries?
- Does any diff file touch billing, payments, subscriptions, credits?
- Total diff >5 files or >300 lines?
- Add or modify an external API endpoint?
- Modify lifecycle operations (create, delete, provision)?
- Introduce concurrency, locking, or shared mutable state?

All no → mark gate passed in spec: `Review gate: passed (all-no)`.

This exists because two independent reflections (blueprint-agent hosting, agent-dev-container skills-workflow) documented review being silently skipped on trust-boundary changes and CRITs being caught post-merge.

## Build — complete before testing

Build ALL coupled changes before testing any. No A/B on coupled changes.

A generation is complete or it's nothing. No "coming soon," no TODO markers on critical paths, no "wire it next round." If the change requires three files to ship and you've built two, you have not built a generation — you've accumulated debt. Finish.

Track in the spec:

```markdown
### Build Status
| # | Change | Status | Files | Tests |
```

Integration checklist: compiles, no conflicts, measurement updated, checkpoints work.

## Test

Run the complete pipeline end-to-end with ALL changes active. Full eval battery. Compare to previous generation baselines.

## Diff audit — catch pattern deviations

Before declaring done, audit the diff. Does new code match codebase patterns? Reuse existing utilities? Every branch covered?

**Preferred:** dispatch `/critical-audit --diff-only`. It serializes reviewers (no 429s), outputs a fix-plan keyed by `file:line`, persists under `.evolve/critical-audit/` so Evaluate can compare.

**Fallback:** `bash ${SKILL_DIR}/diff-audit.sh`.

Either path: fix every CRITICAL and HIGH before Evaluate. Skip only for one-file reversible changes. Three independent reflections (skills-workflow, hosting-skill-workflow, gpu-providers-session) show CRITs landing in main because this step was treated as optional — it is not.

## Evaluate

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

## Persist — hand off to evolve

1. Update pursuit spec with results.
2. Append to `.evolve/experiments.jsonl` (schema in `evolve/schema.md`).
3. Update baselines.
4. Write `.evolve/progress.md`.
5. Write `.evolve/current.json`: `mode: "evolve", generation: N, activePursuit: null`.
6. Append to `.evolve/skill-runs.jsonl`.
7. End with explicit dispatch: `Next: /evolve targeting <X> against baseline <Y>`.

If new judges were added, run them on previous-gen artifacts to establish backward-compatible baselines.

## Rules

1. Audit before designing.
2. Design before building.
3. Match the codebase before writing new code.
4. Build the whole generation before testing.
5. Diff-audit before declaring done.
6. Persist in `.evolve/`.
7. Think in generations. Take risks. Evaluate honestly.
