---
name: pursue
description: "Meta-skill for relentless goal pursuit through generational leaps, not just incremental tuning. Audits the full system, designs bold architectural changes, builds them completely, tests as a unit, and tracks with a pursuit document. The orchestrator above /evolve — it thinks in generations while evolve thinks in experiments. Use when the user says 'pursue this', 'keep going until done', 'don't stop', 'relentlessly optimize', 'think bigger', 'next generation', or wants transformative improvement toward a measurable target."
---

# Pursue — Generational Goal Pursuit

The key insight: **most improvement comes from architectural shifts, not parameter tuning.** Evolve runs tight experiment loops (measure → tweak → measure). Pursue steps back, redesigns the system, ships a new generation, THEN hands off to evolve for fine-tuning.

## Start Here

If `.evolve/` exists, read in this order before designing:
1. `.evolve/current.json`
2. `.evolve/progress.md`
3. The newest file in `.evolve/pursuits/`
4. The tail of `.evolve/experiments.jsonl`
5. Any project spec such as `docs/EVOLVE-SPEC.md`

## When to Use Pursue vs Evolve

| Signal | Skill |
|--------|-------|
| "Make this metric go up" | `/evolve` |
| "This whole approach isn't working" | `/pursue` |
| "The system needs to be fundamentally better" | `/pursue` |
| "We keep tweaking but nothing moves" | `/pursue` (evolve has plateaued) |
| "Think bigger" | `/pursue` |
| Score plateau across 2+ evolve cycles | `/pursue` (time to redesign, not retry) |

## The Pursuit Cycle

```
AUDIT → DESIGN → REVIEW → BUILD → INTEGRATE → TEST → EVALUATE → PERSIST
  │        │       │                                              │
  │        │       └── adversarial multi-perspective audit         │
  │        └── bold architectural changes, not tweaks              │
  │                                                                │
  └── next generation starts here ──────────────────────────────────┘
```

This is NOT iterative in the same way evolve is. Each pursuit cycle ships a GENERATION — a coherent set of changes that transform the system. Then evolve fine-tunes within that generation.

The REVIEW phase exists to surface architectural mistakes before code is written. Use it when the change is non-trivially distributed: touches multiple components, modifies a lifecycle or trust boundary, spawns long-lived processes, is hard to roll back, or ships to users before the next evolve loop can correct it. For a one-file reversible change, skip it.

## Phase 0: Audit — Map the Full System State

Before proposing changes, understand EVERYTHING:

1. **Read all code** involved in the pipeline/system
2. **Read all experiment history** (`.evolve/current.json`, `.evolve/progress.md`, `.evolve/experiments.jsonl`, `.evolve/pursuits/`)
3. **Read all feedback** (user feedback in memory, reading notes, bug reports)
4. **Run current measurements** to get honest baselines
5. **Identify what was built but never tested**, what was tested but never integrated, what needs cleanup

### Write the Pursuit Spec

`.evolve/` is the canonical repo-local state directory for this workflow. Do not write `pursue-*.md` files into the repo root.

Create `.evolve/pursuits/<date>-<goal-slug>.md`:

```markdown
# Pursuit: {goal}
Generation: {N}
Date: {date}
Status: auditing | designing | building | testing | evaluated

## System Audit
### What exists and works
- [list everything built, tested, producing value]

### What exists but isn't integrated
- [code that was written but never wired in, or wired in but never tested end-to-end]

### What was tested and failed
- [experiments that didn't work, with WHY]

### What doesn't exist yet
- [capabilities the system needs but doesn't have]

### User feedback not yet addressed
- [direct quotes from user about what's wrong]

### Measurement gaps
- [things we should measure but don't]

## Current Baselines
[run all measurements, record honest numbers]

## Diagnosis
[root cause analysis — why is the system at its current level?
 distinguish symptoms from causes.
 what's architectural vs what's tunable?]
```

This is the foundation. Don't skip it. Don't summarize from memory — re-read the actual code and data.

## Phase 1: Design — Think in Generations

Based on the audit, design the next generation. A generation is:

- **5-20 coordinated changes** that ship together
- **At least 1 architectural change** (not just prompt/config tweaks)
- **A clear thesis**: "Generation N works because of X fundamental shift"

### Design Principles

1. **Take risks.** If you're only proposing safe, incremental changes, you're doing evolve, not pursue. The point of pursue is to make bold bets.

2. **Research alternatives.** Before building, research how the problem is solved elsewhere. Read papers, study competitors, examine different paradigms. What would a human expert do differently?

3. **Think about the user's experience.** Not the metrics — the actual experience. What does it feel like to read the output? To use the tool? To look at the results?

4. **Design for the interaction between changes.** Sequential drafting + claim registry + persistent sessions interact. Design them as a system, not as independent features.

5. **Include measurement changes.** If the current eval can't detect the improvement you're targeting, the eval must change too. New judges, new dimensions, calibration changes.

### Write the Design Section

Add to the pursuit spec:

```markdown
## Generation {N} Design

### Thesis
[one sentence: why this generation will be dramatically better]

### Changes (ordered by impact)

#### Architectural (must ship together)
1. [change] — [why it matters] — [risk level]
2. ...

#### Prompt/Config (independent, can test separately)
3. ...

#### Measurement (eval changes)
4. ...

#### Infrastructure (reliability, observability)
5. ...

### Alternatives Considered
- [approach A] — rejected because [reason]
- [approach B] — rejected because [reason]

### Risk Assessment
- [what could go wrong with this design?]
- [what's the rollback plan?]
- [which changes are reversible vs irreversible?]

### Success Criteria
- [metric] from [baseline] to [target]
- [metric] from [baseline] to [target]
- Overall: [what does "this generation worked" look like?]
```

## Phase 1.5: Review — Adversarial Audit Before Build

Most architectural mistakes are visible to *some* perspective at design time and invisible to all of them at build time. The point of this phase is to surface those mistakes before code is written, while alternatives are still cheap.

Do this when the change is non-trivially distributed: it touches multiple components, modifies a lifecycle or trust boundary, spawns long-lived processes, is hard to roll back, or ships to users before the next evolve loop. For a one-file reversible change, skip this phase.

The shape of the review is a sketch, not a contract. Adapt to the project.

1. **Map the change.** List every component the change touches — files, processes, events, external systems, trust boundaries, anything downstream depends on. If you cannot fit the map on a page, the change is large enough to need every step below.

2. **Get adversarial perspectives, in parallel.** Spawn sub-agents (or otherwise solicit independent viewpoints) that critique the design from angles that match the change. Common ones include architecture/coupling, reliability/failure modes, security/trust, performance, cost, product/UX, testability, maintainability, and a deliberate red team that tries to break the plan. Pick the angles that matter for *this* change — there is no canonical set. Each perspective should produce a short, structured response: a verdict, a few specific concerns with severity, an alternative they would consider, and whether they would block the plan.

3. **Enumerate failure modes mechanically.** For every spawn, fetch, write, event, and shared resource in the map, ask: what fails, how it manifests, how it propagates, how it recovers. This is not speculative — it is a checklist. Skip nothing.

4. **Run a red-team round.** Assume the plan ships exactly as written. What breaks on day 1? Day 30? Day 90? Under load, under partial failure, under concurrent users, under adversarial input? Surface attacks; do not let yourself fix them in the same breath. Each attack then needs a written disposition: mitigated (and how), accepted (and why), or it blocks the plan.

5. **Pick the strongest plan, not the highest-scoring one.** When comparing alternatives, the chosen plan is the one with no fatal weakness — not the one with the best average. A plan that scores 9/9/9/3 loses to a plan that scores 8/8/8/8, because the 3 is a hole that will eventually fall through. Write down what you gave up and why.

6. **Capture the decision.** Record the map, the perspectives, the failure modes, the red-team output, the chosen plan, and the conditions the build phase has to satisfy (resolved blocks, mitigated concerns). This becomes the build-phase checklist and a permanent record of what was considered and rejected.

The point of all six steps is the same: **make the cost of being wrong show up before you write code**. Done well, this phase saves more time than it spends. Done as a checkbox ritual, it is worse than nothing — so adapt the depth to the actual stakes of the change.

### Audit history belongs in the pursuit doc, not in the code

The review phase produces a lot of useful structure: persona names, plan letters, score matrices, "Plan B vetoed by Reliability." All of that is **session-local context**. It belongs in the pursuit doc you write to `.evolve/pursuits/<date>-<slug>.md`, where future agents can read it as history. **It does not belong in code comments, type docstrings, or commit messages**, because:

- A future agent reading the code six months from now has no idea what "Plan D-prime" was. The label is meaningless without the audit doc next to it.
- "Plan D-prime success criterion" in a docstring tells the reader nothing actionable. "≥95% of runs hit this within the deadline" tells them the actionable target — write *that* instead.
- Persona names ("Adversarial Red Team review surfaced X") are noise; the *finding* is the signal. Write the finding as a normal technical statement.
- Build-phase comments should describe *the code's behavior and the why behind it*, not the design process that produced it.

When the build phase quotes from the review, **paraphrase the rationale into a project-agnostic technical statement**. "This is idempotent because two concurrent calls in the same workspace would corrupt the pnpm store" is correct. "This is idempotent per Reliability finding #4 in the Plan D' review" is wrong, even though it's the same fact, because the second form is unreadable to anyone who wasn't in the audit room.

Same rule for commit messages: describe what the change does and why the code is shaped that way, not which audit phase ranked which alternative. The pursuit doc is the audit log; the code is the result.

## Phase 2: Build — Complete Before Testing

Build ALL changes for the generation before testing any of them. This is critical — you cannot A/B test interacting changes independently. Partial testing gives misleading results.

### Build Checklist

For each change in the design:

```markdown
### Build Status
| # | Change | Status | Files Changed | Tests |
|---|--------|--------|---------------|-------|
| 1 | Sequential drafting | ✅ built | orchestrator.ts | needs e2e |
| 2 | Claim registry | ✅ built | orchestrator.ts | needs e2e |
| 3 | Persistent sessions | ❌ not started | agent.ts | — |
| 4 | Workspace CLAUDE.md | ❌ not started | orchestrator.ts | — |
```

**Do not test until all changes marked "must ship together" are built.** Individual testing of interacting changes wastes time and produces false signals.

### Integration Checklist

After building, verify integration:
- [ ] All changes compile together (`npm run build`)
- [ ] No changes conflict (e.g., two features modifying the same function differently)
- [ ] Measurement system updated (new judges registered, baselines recorded)
- [ ] Artifact collection captures new outputs
- [ ] Resume/checkpoint still works with new phases

## Phase 3: Test — Run the Full System

Run the complete pipeline end-to-end with ALL generation changes active. This is one test, not N tests.

- Run the full pipeline (not a subset — generational changes need full-system testing)
- Record everything (traces, artifacts, workspace snapshot)
- Run the FULL eval battery (all judges, including new ones)
- Compare against the previous generation's baselines

## Phase 4: Evaluate — Honest Assessment

```markdown
## Generation {N} Results

### Scores
| Judge | Gen {N-1} | Gen {N} | Δ | Verdict |
|-------|-----------|---------|---|---------|
| ... | ... | ... | ... | ... |

### Human Assessment
[read the actual output. rate it honestly. quote specific passages.]

### What Worked
[changes that produced measurable improvement]

### What Didn't Work
[changes that didn't move the needle, with diagnosis]

### What Surprised Us
[unexpected results — good or bad]

### Verdict
ADVANCE: This generation is better. Promote to main.
PARTIAL: Some changes helped, some didn't. Cherry-pick winners.
REVERT: This generation is worse. Roll back and rethink.

### Next Generation Seeds
[ideas for Gen {N+1} based on what we learned]
```

## Phase 5: Persist — Hand Off to Evolve

After a generation is evaluated and promoted:

1. Update `.evolve/pursuits/<date>-<goal-slug>.md` with results
2. Update `.evolve/experiments.jsonl` with the generation experiment
3. Update baselines for all metrics
4. Write `.evolve/progress.md` with the new starting point for the next evolve loop
5. Write `.evolve/current.json` with the current generation, active pursuit path, and latest status
6. The system is now ready for `/evolve` to fine-tune within this generation

**Pursue ships generations. Evolve fine-tunes within them.**

## Relationship to Other Skills

```
/pursue                          ← generational design + coordination
  ├── /research                  ← investigate alternatives before designing
  ├── builds code directly       ← architectural changes are too big for /evolve
  ├── /evolve (post-generation)  ← fine-tune within the generation
  ├── /diagnose                  ← when results are surprising
  └── /polish                    ← final quality pass before shipping
```

## Rules

1. **Audit before designing.** Read the actual code and `.evolve/` state, not your memory of it.
2. **Design before building.** Write the pursuit spec and thesis first.
3. **Build the whole generation before testing.** No partial testing of interacting changes.
4. **Persist everything in `.evolve/`.** Specs, handoff state, and results all live there.
5. **Think in generations.** Take risks, evaluate honestly, and finish Gen N before starting Gen N+1.

## Decision Capture & Reflection

- Record major design decisions and pivots with `/capture-decisions` when available.
- Run `/reflect` after each generation to capture what worked, what failed, and what the next generation should try.
- Put durable writeups in `research/decisions/` and `research/failures/` when the repo uses them.
