---
name: reflect
description: "Meta-analyze sessions and projects for patterns, product signals, automation opportunities. Modes: single session, specific project, parallel across all recent sessions. Triggers: 'reflect', 'meta-analyze', 'what patterns', 'grade this run', 'weekly reflection'."
---

# Reflect — Session & Project Meta-Analysis

You are stepping out of the work to examine the work. Not "what should I build next" but "what is this session/project teaching us that we're not seeing?"

Shared conventions in `_common.md`.

## Modes

**Single session** — analyze the current conversation. Default.

**Project** — `/reflect on /path/to/project`. Analyze that project's state, history, trajectory.

**Portfolio (parallel dispatch)** — `/reflect on everything from this week`. Dispatches sub-agents per project, aggregates findings.

For portfolio: enumerate active projects (recent git activity in common working dirs), group by recency, analyze `.evolve/` state + git history + session transcripts per project, aggregate, cross-pollinate (patterns appearing across projects).

## What to analyze

### Session patterns

**Recurring flows** — things the operator does repeatedly:
```
FLOW: [trigger] → [steps] → [outcome]
Frequency: how often
Automation potential: skill, cron job, tool?
```

**Operator questions revealing gaps**:
```
QUESTION: [what they asked]
IMPLICATION: [what capability is missing]
PRODUCT SIGNAL: [what this means for the product]
```

**Pivots and corrections** — when did the operator redirect? What assumption was wrong?

### Run grading

For completed dispatch runs, grade with evidence (no hand-waving):

| Dimension | 1–10 | Evidence |
|---|---|---|
| Goal achievement | | Did the dispatched sessions accomplish what was asked? |
| Code quality | | Tests added, architecture improved, no regressions? |
| Efficiency | | How many sessions needed? Wasted dispatches? |
| Self-correction | | Did failures get redispatched? Did the system adapt? |
| Learning | | Outcomes logged? Confidence updated? Learnings extracted? |
| Overall | | Would the operator approve without changes? |

### Project health

For each active project: trajectory (improving/stalled/degrading), test coverage % (and is it meaningful?), architecture (clean or accumulating debt?), next highest-value action (which skill should be dispatched next?).

### Cross-project patterns (portfolio mode)

- Shared problems (same bug pattern in multiple projects?)
- Skill effectiveness (which produce best outcomes across projects?)
- Operator taste (what consistently approved/rejected?)
- Product signals (pain points that could be products)
- Research directions (unsolved problems worth investigating)

### Skill & system assessment

Classify every skill conclusion before ranking it:

| Status | Required evidence | Allowed conclusion |
|---|---|---|
| Observed | A trace shows an explicit invocation or successful document read | The session inspected or invoked the skill. No quality claim. |
| Linked | One session ID connects skill use and a task outcome | Describe the case. Do not generalize. |
| Comparative | Matched baseline and skill-enabled cases with outcome labels | Estimate benefit or harm, with `n` and uncertainty. |

`.evolve/skill-runs.jsonl` without a matching session ID is repository history, not proof that a selected session used or benefited from a skill.
Never rank success rate, redispatch rate, overrides, prompt quality, or confidence calibration when the needed links are absent; report the missing link instead.

Propose a new skill only when all four are true:

1. The same outcome-defined failure appears in at least 5 independent sessions.
2. Trace evidence shows that no existing skill already covers the workflow.
3. The proposed instruction is narrower than the repeated failure.
4. A fresh comparison can measure the result against a baseline.

## Output format

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

## Skill Effectiveness

| Skill | Observed uses | Outcomes linked | Comparison | Status | Next action |
|---|---:|---:|---|---|---|

Use `not measured` rather than a score when outcomes or a fair comparison are absent.

## Product Signals

## Proposed Automations
[skills, tools, cron jobs with implementation sketch]

## Action Items
[concrete next steps, ordered by impact]
```

## Storage

Every reflection persists in two places:

1. **Project-level**: `.evolve/reflections/YYYY-MM-DD-HHMMSS.md` in the current project — canonical, lives with the code it analyzes. Create `.evolve/reflections/` if missing.
2. **Global index**: append a one-line summary to `~/.claude/reflections/INDEX.md`:
   ```
   - [2026-04-25] starter-foundry — 8.5/10, 30 commits, TS migration + 8 gen routing [.evolve/reflections/2026-04-25-143042.md]
   ```
   For significant sessions, also write a full copy to `~/.claude/reflections/YYYY-MM-DD-project-slug.md`.

Extract 3–5 durable learnings to memory (`memory/`) — anti-patterns discovered, operator preferences learned, architectural decisions worth remembering. Don't put the full reflection in memory; it's too long.

If the project uses an ops board, create tasks for action items.

Do not append a manual `.evolve/skill-runs.jsonl` line as evidence of effectiveness.
When the runner supports it, emit a structured record with session ID, skill name and version, activation type, and outcome reference.

## When to run

- After every major run: grade dispatches, extract learnings.
- Weekly: full portfolio reflect — analyze all sessions, cross-pollinate.
- Before planning: reflect before deciding what to work on next.

## Skill dispatch (required at end)

Don't just identify patterns — route to the skill that fixes them:

| Signal | Dispatch | Threshold |
|--------|----------|-----------|
| Metric to optimize | `/evolve` with target + baseline | Below target for 2+ runs |
| Architectural gap | `/pursue` with thesis | Evolve plateaued 3+ rounds |
| Unsolved problem | `/research` with question | No known solution in codebase |
| Missing measurement | `/eval-agent` with scope | Can't measure what matters |
| Unexplained failures | `/diagnose` with traces | Pass rate <80% with no root cause |
| Same error repeated 3+ traces | Fix code directly |  |

End with explicit, executable dispatch: `Next: /evolve targeting X with baseline Y` or `Next: /pursue — evolve has plateaued`. Not suggestive — executable.

## Data sources

If the project has measurement infrastructure, use it:
- `.evolve/experiments.jsonl` — verdicts, learnings (schema in `evolve/schema.md`)
- `.evolve/scorecard.json` — measured flows with scores and targets
- `.evolve/skill-runs.jsonl` — repository history; use for context only unless rows link to the analyzed session ID
- `.evolve/governor.jsonl` — governor decisions + operator overrides
- Per-turn metrics if available
- Prompt registry if available
- Trace store if available — use actual trace IDs, explicit skill events or successful document reads, and outcome links

## Rules

1. Read the actual data, not your summary of it.
2. Be specific. Every claim needs evidence. "Run went well" = useless. "7 dispatches, 6 succeeded, +12pp" = useful.
3. Grade honestly. An 8/10 with clear deductions beats a 10/10 with no criticism.
4. Think commercially. "Who would pay for this?" filters product ideas.
5. Think recursively. This reflection is itself a session — what does IT reveal?
6. Propose actions. Every insight has a next step.
7. Cross-pollinate. Best insights come from patterns across projects, not within one.
8. Do not confuse a skill catalog, a document read, or unlinked history with a successful intervention.
