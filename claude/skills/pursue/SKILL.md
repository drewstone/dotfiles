---
name: pursue
description: "Meta-skill for relentless goal pursuit through generational leaps, not just incremental tuning. Audits the full system, designs bold architectural changes, builds them completely, tests as a unit, and tracks with a pursuit document. The orchestrator above /evolve — it thinks in generations while evolve thinks in experiments. Use when the user says 'pursue this', 'keep going until done', 'don't stop', 'relentlessly optimize', 'think bigger', 'next generation', or wants transformative improvement toward a measurable target."
---

# Pursue — Generational Goal Pursuit

The key insight: **most improvement comes from architectural shifts, not parameter tuning.** Evolve runs tight experiment loops (measure → tweak → measure). Pursue steps back, redesigns the system, ships a new generation, THEN hands off to evolve for fine-tuning.

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
AUDIT → DESIGN → BUILD → INTEGRATE → TEST → EVALUATE → PERSIST
  │        │                                               │
  │        └── bold architectural changes, not tweaks       │
  │                                                        │
  └── next generation starts here ─────────────────────────┘
```

This is NOT iterative in the same way evolve is. Each pursuit cycle ships a GENERATION — a coherent set of changes that transform the system. Then evolve fine-tunes within that generation.

## Phase 0: Audit — Map the Full System State

Before proposing changes, understand EVERYTHING:

1. **Read all code** involved in the pipeline/system
2. **Read all experiment history** (`.evolve/experiments.jsonl`, evolve-progress.md)
3. **Read all feedback** (user feedback in memory, reading notes, bug reports)
4. **Run current measurements** to get honest baselines
5. **Identify what was built but never tested**, what was tested but never integrated, what needs cleanup

### Write the Pursuit Spec

Create `pursue-{goal}.md` in the project root:

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

1. Update `pursue-{goal}.md` with results
2. Update `.evolve/experiments.jsonl` with the generation experiment
3. Update baselines for all metrics
4. Write `evolve-progress.md` with the new starting point
5. The system is now ready for `/evolve` to fine-tune within this generation

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

1. **Audit before designing.** Read the actual code and data, not your memory of it.
2. **Design before building.** Write the pursuit spec. Get the thesis clear.
3. **Build completely before testing.** No partial testing of interacting changes.
4. **Test the whole system.** Generational changes need end-to-end runs.
5. **Evaluate honestly.** If it's worse, say so. Revert. Don't rationalize.
6. **Persist everything.** The pursuit spec, build status, and results survive sessions.
7. **Think in generations.** Each pursuit cycle should feel like a version bump, not a patch.
8. **Take risks.** Safe changes belong in /evolve. Pursue is for bold bets.
9. **Research the domain.** Don't just engineer — understand how experts solve this problem.
10. **One generation at a time.** Finish Gen N before starting Gen N+1.
