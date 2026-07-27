---
name: agent-behavior-audit
description: Audit whether an autonomous agent observes state, uses tools, learns, and follows user intent.
---

# Agent Behavior Audit

Use this when product claims about autonomy need proof.
Treat UI labels, docs, and architecture diagrams as claims until traces or tool records prove them.

## Flow

1. Identify the promised agent behavior and the real user task.
2. Collect traces, logs, tool calls, state changes, prompts, outputs, and run artifacts.
3. Check whether the agent observed real state before acting.
4. Check whether it used real tools or only narrated actions.
5. Check whether it reflected on outcomes and changed behavior across turns/runs.
6. Compare actual behavior to user intent and product claims.
7. Classify gaps as fake action, blind action, no learning, bad incentives, or missing observability.

## Output

Report claim, evidence, verdict, impact, and required fix for each behavior gap.
Use `references/full-reference.md` for the full question list and red flags.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Observed fake success, silent fallback, or credential exposure (≥1 finding) | `/harden` | the finding's file:line + the exact prompt/input that reproduces it |
| The gap is the coding backend not surfacing permissions, questions, plans, hooks, or MCP | `/harness-escalation-audit` | the harness name + the surface it failed to expose |
| ≥3 behavior defects and no case scores this behavior | `/eval-agent` | the defect list as candidate rubric items + 2 pass and 2 fail transcripts |
| A behavior score exists and sits below target for ≥2 runs | `/evolve` | the score as baseline metric, its noise floor, and the failing transcripts |
| 0 P1 findings and score ≥ 8/10 | `/reflect` | the audit artifact path + this run's `.agent/skill-runs.jsonl` row |

## Log the run

On completion, append one line so `/reflect` and `/governor` can grade this skill later:

```bash
skill-run-log /agent-behavior-audit --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```
