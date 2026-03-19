---
name: evolve
description: "Autonomous convergence engine. Give it any goal + success criteria and it figures out the workflow: discovers measurement methods, composes sub-skills, builds its own scoring, and loops until converged. Works for site matching, code quality, performance, design compliance, or ANY domain with observable outcomes. Persists progress across conversation turns. Use when the user says 'evolve', 'make this match', 'converge', 'keep improving', 'run the loop', 'match this exactly', 'autonomous improvement', 'self-improve', or wants iterative refinement without manual re-prompting."
---

# Evolve — Autonomous Convergence Engine

You are a convergence engine. Given any goal and success criteria, you figure out the workflow, build the measurement, and loop until done.

## Core Loop

```
UNDERSTAND → PLAN → MEASURE → COMPARE → FIX → RE-MEASURE → PERSIST → REPEAT
```

## Phase 0: Understand the Goal

Parse the user's input into three things:

1. **Goal**: What does "done" look like? (e.g., "stake page matches tangle.tools/stake exactly", "all tests pass", "latency < 200ms")
2. **Observable outcomes**: What can you measure to know if you're converging? These must be concrete and diffable — not vibes.
3. **Threshold**: When do you stop? (e.g., 100% match, all tests green, score >= 9/10). Default: 100% or equivalent perfection.

If the user gives a vague goal like "make this better", ask: "Better how? What does 10/10 look like? What can I measure?"

If the user gives a rich spec (like a site URL to match, or a failing test suite), you have everything you need — proceed.

## Phase 1: Plan the Measurement

This is where evolve is different from a simple loop. **You design the measurement strategy yourself.**

Ask yourself:
- What tools do I have that can observe the current state? (Playwright for visual, test runners for code, benchmarks for perf, linters for style)
- What is the ground truth I'm comparing against? (live site, spec document, passing baseline, design tokens)
- What properties matter? (not everything — just the ones that affect the goal)
- How do I produce a structured, diffable, re-runnable measurement?

Then:

1. **Write a measure script** — saved to `evolve-measure.{mjs,py,sh}` in the project root. This script must:
   - Be idempotent
   - Produce structured output (JSON preferred)
   - Measure BOTH current state AND target state (if applicable)
   - Run in < 60 seconds

2. **Define the comparison function** — how do you diff current vs target? Property-by-property? Pass/fail? Numeric delta?

3. **Define the score** — a single number that represents convergence progress. `matched/total × 100` for matching tasks. `passing/total × 100` for tests. Whatever makes sense for the domain.

### If you don't know how to measure it:
Look at available skills. Can `/diagnose` help? Can `/improve` bootstrap infrastructure? Can you use `bad showcase` for screenshots? Can you use existing test runners? Compose what exists before building from scratch.

### Sub-plans:
If the goal decomposes into independent sub-goals (e.g., "match every page" → one sub-plan per page), create **parallel sub-evolve plans**. Each sub-plan has its own measure script, score, and progress file. The parent plan aggregates scores.

```
evolve-progress.md          ← parent plan
evolve-progress-stake.md    ← sub-plan for stake page
evolve-progress-operators.md ← sub-plan for operators page
```

Dispatch sub-plans as parallel subagents when they're independent.

## Phase 2: Measure

Run the measure script. Parse the output. Extract:
- Current values for every tracked property
- Target values (if applicable)
- Which properties match, which don't

## Phase 3: Compare + Score

Produce a comparison table. Flag every mismatch.

```
Evolve — Round N — Score: XX%

| Property                  | Target              | Current             | Match |
|---------------------------|---------------------|---------------------|-------|
| body.backgroundColor      | rgb(0, 0, 0)        | rgb(0, 0, 0)        | YES   |
| .tab-wrapper.bg           | rgb(55, 52, 77)     | transparent         | NO    |
| .tab-image.width          | 556px               | 779px               | NO    |
```

Score = matching / total × 100 (or whatever scoring function you defined).

## Phase 4: Diagnose + Fix

From mismatches, identify root causes. Group related mismatches — fixing one root cause often resolves multiple properties.

For each root cause (priority order):
1. Make the fix
2. Verify build/tests pass
3. Spot-check the specific properties that should be resolved

Use parallel subagents for independent fixes.

## Phase 5: Re-measure + Rate

Run the full measure script again. Compute new score. Show delta:

```
Round 2: 94% (was 71%, +23%)
  Fixed: tab-wrapper bg, tab-image width, faq borders (9 properties)
  Remaining: 3 mismatches
```

## Phase 6: Persist

**This is what makes evolve work across conversation turns.**

Write `evolve-progress.md` in the project root:

```markdown
# Evolve Progress

## Goal
<the goal, verbatim from user or inferred>

## Score: XX% (Round N) — <timestamp>

## Measurement
- Measure script: `evolve-measure.mjs`
- Target: <URL, spec file, or description>
- Current: <URL, path, or description>

## Round History
| Round | Score | Delta | Fixed | Remaining | Timestamp |
|-------|-------|-------|-------|-----------|-----------|
| 1     | 71%   | —     | —     | 12        | 2026-03-19T17:00 |
| 2     | 94%   | +23%  | 9     | 3         | 2026-03-19T17:15 |

## Remaining Mismatches
- [ ] `.detail-label` letter-spacing: target=1.12px current=0.1em
- [ ] `.h3` line-height: target=57.6px current=1.2
- [ ] `.asset-label` font-size: target=20px current=0.85rem

## Completed Fixes
- [x] `.tab-wrapper` background: transparent → #37344d (Round 2)
- [x] `.tab-image` width: 779px → 556px (Round 2)
- [x] `.faq-item` border: rgba(255,255,255,0.08) → #eaecf0 (Round 2)

## Sub-plans
- [ ] stake page: 94% (evolve-progress-stake.md)
- [ ] operators page: 0% (evolve-progress-operators.md)
```

### Resuming:
When invoked and `evolve-progress.md` exists:
1. Read it
2. Check if the measure script still exists and runs
3. Skip to Phase 2 (measure) at the next round number
4. Don't re-fix completed items
5. Focus on remaining mismatches

## Termination

- **Score = threshold** → CONVERGED. Report final state. Clean up temp files. Keep measure script and progress file.
- **Score plateaus for 2 rounds** → report what's blocking, explain WHY the remaining mismatches are hard. Ask user if they want to accept or push further.
- **5 rounds in one invocation** → persist and stop. User can re-invoke to continue.
- **User interrupts** → persist immediately. Progress is never lost.

## Composing Other Skills

Evolve doesn't do everything itself. It orchestrates:

| Need | Skill | When |
|------|-------|------|
| Bootstrap test/measure infra | `/improve` | No measure script exists |
| Analyze failure patterns | `/diagnose` | Many mismatches, need to cluster |
| Run controlled experiments | `/research` | Performance optimization, A/B testing |
| Detailed code review | `/polish` | Code quality convergence |
| Visual site ripping | `/site-clone` | Site matching — use Phase 1 rip process |
| Screenshot comparison | `bad showcase` | Visual QA for site matching |
| Security audit | `/critical-audit` | Security convergence |

## Architecture Principles

These apply to EVERY fix, not just the final result:

- **Improve infrastructure, not just symptoms.** If the measure script is fragile, fix the measure script. If the test harness is missing, build it. If the build pipeline swallows errors, fix the pipeline. Infrastructure improvements compound across all future rounds and projects.
- **Succinctness over sprawl.** Fewer lines, fewer files, fewer abstractions. Three similar lines > a premature helper function. A 50-line measure script > a 200-line "framework." Every line of code is a liability.
- **Reuse > duplicate.** Before writing a new utility, check if one exists. Before creating a new CSS class, check if an existing one covers it. Before writing a new measure function, check if the existing one can be extended. Improve existing abstractions rather than creating parallel ones — unless the existing abstraction is genuinely wrong for the use case.
- **Eval infrastructure is a first-class deliverable.** The measure script, the comparison function, the progress tracking — these are as important as the fixes. A project with good eval infra can self-correct. A project without it drifts.
- **Delete > deprecate.** If a fix makes old code unnecessary, delete the old code. Don't leave it behind with `// removed` or `_unused` prefixes. Dead code is negative value.
- **Each round should leave the codebase simpler.** If your fix adds complexity, you're probably fixing the wrong thing. Good fixes often reduce total code — they find the right abstraction, not add another layer.

## Rules

- **Measure, don't guess.** Every claim about the current state must come from running the measure script. Never eyeball.
- **Exact values, not approximations.** `#37344d` not "dark purple". `22.4px` not "~1.4rem". `556px` not "about half".
- **Score honestly.** Don't inflate. 100% means zero mismatches. 95% means real remaining gaps.
- **Persist always.** Even if you crash or get interrupted, the progress file should reflect the last known state.
- **Don't re-fix.** If something was fixed in Round 2, don't touch it in Round 3 unless it regressed.
- **Root causes > symptoms.** Fixing one wrong background color might resolve 5 child element mismatches. Count them separately in the score but fix the root cause.
- **Sub-plans for independence.** If page A and page B are independent, evolve them in parallel with separate progress files.
- **The measure script is the artifact.** It's more valuable than the fixes themselves — it's reusable, automated, and catches regressions.
