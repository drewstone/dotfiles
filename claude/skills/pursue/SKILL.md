---
name: pursue
description: "Meta-skill for relentless goal pursuit. Decomposes a goal into independent sub-goals, selects the right skills for each, dispatches parallel work streams, collects results, learns what worked, and iterates until converged. The orchestrator above /evolve — it doesn't do experiments itself, it decides which experiments to run and in what order. Use when the user says 'pursue this', 'keep going until done', 'don't stop', 'relentlessly optimize', 'orchestrate this', or wants multi-stream parallel improvement toward a measurable target."
---

# Pursue — Multi-Stream Goal Orchestrator

You don't do the work. You decide what work to do, dispatch it, verify the results, and decide what to do next. You are the outer loop around skills like `/evolve`, `/polish`, `/diagnose`.

## When to Use

- Goal is large enough to decompose (multiple agents, multiple dimensions, multiple repos)
- Multiple independent work streams can run in parallel
- The right approach isn't obvious — you need to discover it
- Work spans multiple sessions or invocations

For single-stream improvement (one agent, one dimension), use `/evolve` directly.

## The Loop

```
GOAL → DECOMPOSE → DISPATCH → COLLECT → LEARN → RE-DISPATCH
                     │                              │
                     └── parallel /evolve sessions ──┘
```

## Phase 1: Decompose the Goal

Split into independent sub-goals. Each sub-goal must be:
- **Independently measurable** (its own metric, its own baseline)
- **Independently actionable** (fixing one doesn't require fixing another first)
- **Convergence-trackable** (you can tell if it's making progress)

Examples:
| Goal | Sub-goals |
|------|-----------|
| "All agents above 0.80" | 5 sub-goals, one per agent |
| "Platform quality + latency" | 2 sub-goals: quality stream + latency stream |
| "Ship feature X at quality Y" | Build stream + quality stream (dependent: build first) |

Dependent sub-goals get sequenced. Independent ones run in parallel.

## Phase 2: Select Skills per Sub-goal

| Sub-goal type | Skill | Why |
|---------------|-------|-----|
| Improve a metric | `/evolve` | Measure→diagnose→experiment→verify loop |
| Fix failing things | `/diagnose` → fix | Identify root causes, then fix |
| Code quality gate | `/polish` | Review→fix→re-review until 9+ |
| Security gate | `/critical-audit` | Audit→fix→re-audit |
| Research unknowns | `/research` | When you don't know what lever to pull |
| Build missing infra | `/improve` | When measurement doesn't exist yet |

Don't always reach for `/evolve`. Sometimes `/polish` is the right tool. Sometimes you just need `/diagnose` to understand what's wrong before deciding how to fix it.

## Phase 3: Dispatch

Launch sub-goals as parallel work streams:

```
/pursue "all agents above 0.80"
  ├─ Stream 1: /evolve agent-huberman --goal "above 0.80"     [worktree]
  ├─ Stream 2: /evolve agent-attia --goal "above 0.80"        [worktree]
  ├─ Stream 3: /evolve agent-rogan --goal "above 0.80"        [worktree]
  ├─ Stream 4: /research "why styleAdherence stuck at 0.50"   [subagent]
  └─ Stream 5: /improve "add style context to judge criteria" [subagent]
```

Use:
- **Worktrees** for code changes that might conflict
- **Subagents** for research/investigation that doesn't change code
- **Sequential dispatch** for dependent streams (build before test)

## Phase 4: Collect Results

As streams complete, collect:
- Score before/after per sub-goal
- What worked (hypotheses that produced lift)
- What didn't (hypotheses that failed, and WHY)
- What was discovered (new information that changes the plan)

## Phase 5: Learn + Re-dispatch

This is what makes pursue different from just running `/evolve` N times:

1. **Cross-pollinate**: If safety disclaimers worked for Huberman, apply them to Attia too
2. **Revise strategy**: If styleAdherence is structural (judge limitation), stop trying prompt fixes and switch to a code fix stream
3. **Re-prioritize**: If one agent jumped from 0.63 to 0.81, shift resources to the one still at 0.65
4. **Discover dependencies**: If latency fix enables quality improvement, sequence them

Then dispatch the next round of streams.

## Phase 6: Converge

Stop when:
- All sub-goals met → CONVERGED
- Score plateau for 2 rounds across all streams → report structural blockers
- Budget/time exhausted → persist progress for next invocation

## Progress Tracking

```markdown
# Pursue Progress — <goal>
Status: in_progress | converged | plateau
Target: all agents above 0.80

## Streams
| Stream | Sub-goal | Skill | Score | Status |
|--------|----------|-------|-------|--------|
| 1 | Huberman > 0.80 | /evolve | 0.81 | converged |
| 2 | Attia > 0.80 | /evolve | 0.69 | round 2 |
| 3 | styleAdherence | /research | — | investigating |

## Cross-Stream Learnings
- Safety disclaimers: +0.30 lift on all health agents (apply universally)
- styleAdherence: judge limitation, not prompt issue (needs code fix)

## Next Actions
- Stream 2: iterate Attia taskCompletion (currently 0.53)
- Stream 3: implement judge style context awareness
```

## Rules

- **Decompose before dispatching.** Don't run one big evolve session for a multi-part goal.
- **Cross-pollinate wins.** What works for one sub-goal may work for others.
- **Kill dead streams.** If a stream plateaus, reassign resources.
- **Track learnings, not just scores.** The WHY matters more than the number.
- **Verify stream results.** Don't trust sub-skill self-reports — spot-check.
- **Persist everything.** Progress survives session boundaries.
