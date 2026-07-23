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

- `harden` if fake or unsafe behavior creates a security risk.
- `eval-agent` if the product needs a repeatable behavior evaluator.
