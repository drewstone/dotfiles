---
name: reflect
description: "Meta-analyze sessions and projects to extract patterns, product insights, research directions, and automation opportunities. Can analyze the current session, a specific project, or dispatch parallel sub-agents to reflect across ALL recent sessions and aggregate findings. Use when the user says 'reflect', 'meta-analyze', 'what patterns do you see', 'what should we automate', 'extract insights', 'what are we learning', 'grade this run', 'weekly reflection', or wants to step back and examine the work itself."
---

# Reflect — Session & Project Meta-Analysis

You are stepping out of the work to examine the work. Not "what should I build next" but "what is this session/project teaching us that we're not seeing?"

## Modes

### Mode 1: Single Session Reflect
Analyze the current conversation. Default when no arguments given.

### Mode 2: Project Reflect
Analyze a specific project's state, history, and trajectory.
```
/reflect on ~/code/phony
```

### Mode 3: Portfolio Reflect (parallel dispatch)
Analyze ALL recent sessions across projects. Dispatches sub-agents per project/batch, then aggregates.
```
/reflect on everything from this week
/reflect portfolio — grade all recent runs
```

For portfolio mode, use this pipeline:
1. Call `portfolio_status` to see all goals and decisions
2. Group decisions by project
3. For each project with recent activity, dispatch a sub-agent (via `dispatch_skill` with `/reflect` or direct prompt) to analyze that project's sessions and outcomes
4. Aggregate all sub-agent results into a single report
5. Cross-pollinate: what patterns appear across multiple projects?

## What to Analyze

### Session Patterns

Read the conversation history. Extract:

**Recurring flows** — things the operator does repeatedly:
```
FLOW: [trigger] → [steps] → [outcome]
Frequency: how often
Automation potential: could this be a skill, cron job, or tool?
```

**Operator questions that reveal gaps**:
```
QUESTION: [what they asked]
IMPLICATION: [what capability is missing]
PRODUCT SIGNAL: [what this means for the product]
```

**Pivots and corrections** — when did the operator redirect? What assumption was wrong?

### Run Grading

For completed dispatch runs, grade on:

| Dimension | Score | Evidence |
|---|---|---|
| **Goal achievement** | 1-10 | Did the dispatched sessions accomplish what was asked? |
| **Code quality** | 1-10 | Tests added, architecture improved, no regressions? |
| **Efficiency** | 1-10 | How many sessions needed? Any wasted dispatches? |
| **Self-correction** | 1-10 | Did failures get redispatched? Did the system adapt? |
| **Learning** | 1-10 | Were outcomes logged? Did confidence update? Learnings extracted? |
| **Overall** | 1-10 | Would the operator approve this run without changes? |

Include specific evidence for each score. No hand-waving.

### Project Health Assessment

For each active project:
- **Trajectory**: improving, stalled, or degrading?
- **Test coverage**: what % and is it meaningful?
- **Architecture**: clean or accumulating debt?
- **Next highest-value action**: what skill should be dispatched next?

### Cross-Project Patterns (portfolio mode)

Look across ALL projects for:
- **Shared problems**: same bug pattern in multiple projects?
- **Skill effectiveness**: which skills produce the best outcomes across projects?
- **Operator taste**: what does the operator consistently approve/reject?
- **Product signals**: pain points that could be products
- **Research directions**: unsolved problems worth investigating

### Skill & System Assessment

Evaluate how well the skills and tooling are working:
- Which skills have the highest success rate?
- Which skills get redispatched most (indicating initial failure)?
- Are prompts specific enough? Too long? Too short?
- Is the confidence model calibrated? (high confidence should correlate with success)
- What new skills would help based on observed patterns?

## Output Format

```markdown
# Reflect: [scope]
Date: [date]

## Run Grade: [X/10]
[table with dimension scores and evidence]

## Session Flow Analysis
[numbered flows with trigger → steps → outcome]

## Project Health
[per-project assessment with trajectory and next action]

## Cross-Project Patterns
[patterns that appear across multiple projects]

## Skill Effectiveness
[which skills work best, which need improvement]

## Product Signals
[ideas with reasoning and who would pay]

## Proposed Automations
[skills, tools, cron jobs with implementation sketch]

## Action Items
[concrete next steps, ordered by impact]
```

## Where to Store Results (MANDATORY — always persist)

Every reflection produces artifacts in THREE places:

### 1. Project-level (`.evolve/reflections/`)
Write the full reflection to `.evolve/reflections/YYYY-MM-DD-HHMMSS.md` in the current project. This is the canonical record — it lives with the code it analyzes.

```bash
# Example path
.evolve/reflections/2026-04-02-143042.md
```

If `.evolve/` doesn't exist, create it. If `reflections/` doesn't exist, create it.

### 2. Global cross-project index (`~/.claude/reflections/`)
Append a one-line summary to `~/.claude/reflections/INDEX.md`. This enables portfolio-level analysis across projects without reading every project's `.evolve/`.

```markdown
# Reflections Index
- [2026-04-02] starter-foundry — 8.5/10, 30 commits, TS migration + 8 gen routing architecture [.evolve/reflections/2026-04-02-143042.md]
- [2026-03-28] phony — 7/10, voice agent eval convergence [.evolve/reflections/2026-03-28-091523.md]
```

For significant sessions, also write a full reflection copy to `~/.claude/reflections/YYYY-MM-DD-project-slug.md` for offline reference.

### 3. Memory (key learnings only)
Save project-specific insights to Claude Code memory (`memory/` in the project's `.claude/projects/` dir). These are the durable takeaways — anti-patterns discovered, operator preferences learned, architectural decisions worth remembering.

Do NOT put the full reflection in memory — it's too long. Extract the 3-5 most important learnings.

### 4. Optional: Foreman / ops-board
If running, call `log_outcome` with learnings and `POST /api/taste` with taste signals. If the ops-board is available, create tasks for action items.

## Scheduling

This should run periodically:
- **After every major run**: grade the dispatches, extract learnings
- **Weekly**: full portfolio reflect — analyze all sessions, cross-pollinate
- **Before planning**: reflect before deciding what to work on next

If Foreman is running with confidence >= 0.6 on `/reflect`, it can auto-dispatch reflections on a schedule.

## Rules

1. **Read the actual data, not your summary of it.** Go back to the decisions, the outcomes, the session content.
2. **Be specific.** Every claim needs evidence. "The run went well" is useless. "7 dispatches, 6 succeeded, 4x test coverage" is useful.
3. **Grade honestly.** An 8/10 run with clear deductions is more useful than a 10/10 with no criticism.
4. **Think commercially.** "Who would pay for this?" filters product ideas.
5. **Think recursively.** This reflection is itself a session. What does IT reveal?
6. **Propose actions.** Every insight should have a next step.
7. **Cross-pollinate.** The best insights come from patterns across projects, not within one.

## Skill Dispatch (required at end of every reflection)

Don't just identify patterns — route to the skill that fixes them:

| Signal | Dispatch | Evidence threshold |
|--------|----------|--------------------|
| Metric to optimize | `/evolve` with target + baseline | Score below target for 2+ runs |
| Architectural gap | `/pursue` with thesis | Evolve plateaued 3+ rounds |
| Unsolved problem | `/research` with question | No known solution in codebase |
| Missing measurement | `/improve` with scope | Can't measure what matters |
| Unexplained failures | `/diagnose` with traces | Pass rate < 80% with no root cause |
| Same error repeated | Fix code directly | Pattern in 3+ traces |

**Every reflection MUST end with an explicit dispatch**: "Next: run `/evolve` targeting X with baseline Y" or "Next: run `/pursue` — evolve has plateaued." Make it executable, not suggestive.

## Data Sources

If the project has measurement infrastructure, use it:
- `.evolve/experiments.jsonl` — experiment history, verdicts, learnings
- `.evolve/scorecard.json` — all measured flows with scores and targets
- Per-turn metrics (if available) — identify which conversation turns degrade quality
- Prompt registry (if available) — correlate insights with which prompt versions produced them
- Trace store (if available) — read actual failure traces, not summaries

## Relationship to Other Skills

```
/reflect                         ← meta-analysis, grading, pattern extraction
  ├── /evolve                    ← if reflection reveals a metric to optimize
  ├── /pursue                    ← if reflection reveals an architectural gap
  ├── /research                  ← if reflection reveals an unsolved problem
  ├── /improve                   ← if reflection reveals missing measurement
  └── /diagnose                  ← if reflection reveals unexplained failures
```

/reflect decides which other skill to invoke next. It's "step back and think" before "lean in and build."
