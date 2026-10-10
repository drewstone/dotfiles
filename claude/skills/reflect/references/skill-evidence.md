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
A `skill-runs.jsonl` row without a matching session link is repository history, not proof that the inspected session used the skill.
Schema-2 rows carry that link (`session`, `transcriptPath`, `skillSha`), and `skill-runs.v2.jsonl` links the older rows it could match to a transcript.

## Read the scoreboard

`skill-scoreboard` reads every host's ledgers and prints each skill's signals in [the climb's reward order](../../../../docs/processes/climb.md#rewards-strongest-first), with denominators:
1. `outcome`: the run's pull requests on GitHub, merged and clean for 7 days, or reverted, hot-fixed, red after merge, or closed;
2. `corrected`: the operator's next message or interrupt, judged by a lexical labeler whose name and evidence each judgment records;
3. `judge/30`: the brief-judge score;
4. `claimed`: the author's own verdict.
A weaker signal never overrides a stronger one.
Pass rates count only runs whose 7-day windows have closed, because a failure can arrive at once while a pass takes 7 days.
Subagent runs have no direct operator channel, so their corrections stay unknown unless a parent records `skill-run-log --override`.
Split by skill version (`--by-version`) before attributing a change to a skill edit.

## Assess use and effects separately

Report observed uses, linked outcomes, comparable cases, and unknown links with their denominators.
Rank only on signals the scoreboard measured; do not rank effectiveness, success rates, redispatch, or override rates where those records are absent.
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
When the labeler misjudged a correction, record the right judgment with `skill-run-log --override --run <runId> [--no]`; an explicit judgment outranks the labeler.

Before proposing another skill, check whether an existing one owns the behavior and whether removing a conflicting rule resolves the failure.
Describe the distinct job, supporting cases, and comparison needed to test a proposed instruction.
Do not infer a universal rule from an unlinked count or a single favorable session.
