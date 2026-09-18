# Evidence for skill conclusions

Read this before claiming a skill helped, harmed, or caused a user override.
Inventory and invocation history describe use; effectiveness needs outcome evidence.

| Evidence level | Required record | Supported conclusion |
|---|---|---|
| Observed | An explicit invocation or successful instruction read in a trace | The session invoked or inspected the skill |
| Linked | A session identity connects skill use with the task outcome | What happened in that case, without generalizing causation |
| Comparative | Matched baseline and skill-enabled cases with independently labeled outcomes | An estimated benefit or harm under the comparison's conditions |

Keep actual session IDs, trace spans, instruction identity, and outcome references.
Distinguish a mentioned skill from a successful read and a read from applied instructions.
A `.agent/skill-runs.jsonl` row without a matching session link is repository history, not proof that the inspected session used the skill.

## Assess use and effects separately

Report observed uses, linked outcomes, comparable cases, and unknown links with their denominators.
Do not rank effectiveness, success rates, redispatch, or override rates when the needed records are absent.
Match task difficulty, model, execution conditions, user authority, and outcome definition before comparing enabled and baseline cases.
Read [comparison design](../../evolve/references/STATS.md) when a sampled effectiveness claim is required.

An outcome after an instruction does not prove that the instruction caused it.
Check whether the agent applied the relevant behavior and whether other changes could explain the outcome.
A current edit improving clarity is not measured evidence of better task performance.

## Interpret user corrections

Link the proposed dispatch, actual user instruction, active objective, and subsequent work.
A later task change is not automatically an override of an earlier recommendation.
Record only observed overrides in the reflection and preserve the original append-only records.
Leave `operatorOverride` unknown when the necessary link is absent.

Before proposing another skill, check whether an existing one owns the behavior and whether removing a conflicting rule resolves the failure.
Describe the distinct job, supporting cases, and comparison needed to test a proposed instruction.
Do not infer a universal rule from an unlinked count or a single favorable session.
