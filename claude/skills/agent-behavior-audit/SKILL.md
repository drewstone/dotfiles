---
name: agent-behavior-audit
description: Audit whether an autonomous agent observes state, uses tools, and follows its promised behavior and user intent.
---

# Agent behavior audit

Use this when a product claim about autonomy needs proof.
Treat labels, documentation, and the agent's account of its work as claims until execution records support them.

## Audit the promised behavior

1. Identify the user task, granted authority, and behavior the product promises.
   Require learning across runs only when the product claims that capability.
2. Collect the relevant prompts, traces, tool results, outputs, and state changes under their actual run identities.
3. Check whether the agent observed the state needed for its decision, performed the action, and checked the resulting effect.
4. Compare its decisions with the user mandate, including permissions, completion conditions, and handling of failures.
5. For a learning claim, trace feedback to a later changed decision and its outcome.
   A reflection file alone does not show learning.
6. Distinguish observed defects from missing evidence.
   For each defect, identify the earliest decision or component that explains it.

Read [the evidence guide](references/evidence.md) when records disagree, side effects need attribution, or the scope includes several agents.

## Report

For each behavior claim, give the evidence, verdict, user impact, and correction or missing check.
Keep legitimate deterministic behavior separate from unsupported claims of autonomous behavior.
Run available checks within the task's authority before leaving a claim unresolved.
An audit request alone does not authorize changes to the audited product.

## Log the run

```bash
skill-run-log /agent-behavior-audit --target "<behavior and runs>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A confirmed defect crosses a security or data boundary | `/harden` | The reproduction and affected boundary |
| The coding backend failed to expose permissions, questions, plans, hooks, or MCP | `/harness-escalation-audit` | The backend and missing surface |
| A recurring behavior needs an executable regression case | `/eval-engineering` | The claim and passing/failing traces |
| A valid behavior measure has a known improvement to test | `/evolve` | The baseline, failing traces, and proposed change |
