---
name: reflect
description: Review completed work against its evidence, identify repeated causes and useful practices, and retain justified corrections.
---

# Reflect

An excellent reflection finds the cause that keeps recurring after its last correction and removes it at the highest level that works, so the same mistake cannot happen again, and proves the change against a real past instance.
Judge outcomes against the user's objective and the bar the work set; invocation counts and self-grades do not establish effectiveness.

## Inspect the work

1. Define the scope and period, and inspect the evidence that explains outcomes ([session efficiency](references/session-efficiency.md) for stalled or repetitive coding sessions), naming sources you could not inspect.
2. What changed for the user, and what remains unproved?
3. Which recurring cause survived a prior correction, and why?
4. Did the work set a target against the best known result, and did it reach it? A period of passing checks with no target above the baseline is a finding.

Read [portfolio analysis](references/portfolio.md) for work across projects or sessions with different conditions, and [skill evidence](references/skill-evidence.md) before attributing outcomes or user overrides to a skill.

## Choose what should change

Rank findings by consequence, recurrence, scope and confidence in the cause, with costs or savings only when evidence supports them.
Search the owning guidance, skills and memory first; extend an existing owner, and create a new rule or skill only for a distinct job.
Fix a mistake that has recurred at the highest level that works: architecture (one owner, one supported path, the wrong import fails), then types, then a lint or check whose error names the fix, then a test, and written rules last, for judgment calls; prove a new check fails on a real past instance.
Derived from cursor/plugins correct (MIT).

A change to operator guidance (AGENTS.md, CLAUDE.md, a skill, `docs/processes/`, or project memory) must pass [the operator scenarios](../_probes/operator-scenarios.md) before it merges: every scenario that passed before the change still passes, and the pull request states both scores.
A change meant to raise agents' targets also reruns [the ambition probe](../_probes/ambition/README.md) and states its three arms' rates.

After a run, `traces analyze <session>` on your own session surfaces the pattern you cannot see from inside it; name the one systemic fix.

## Preserve the findings

Retained learning goes to the auto-memory directory or a climb-ledger row, not a reflections file, with counts and denominators.

## Climb

A reflection measures the operator and its tools ([the climb](../../../docs/processes/climb.md)).
- Score every prediction made in the period with `climb-log score` (hit rate, Brier score and calibration from the tool's verdicts) and list the open ones with `climb-log open` ([the ledger](../../../docs/processes/climb.md#predictions-a-program-checks)).
- Record each correction from the person served as a ledger row with its theme, and count recurrences after a change; a recurring theme escalates to a check or architecture.
- Measure the period with [`scripts/self-audit`](scripts/self-audit) over its session files, and keep its counts: guardrail matches, rework (repeated commands, rollbacks, revert commits with `--repo`) and stall minutes. A match is a lead: read it in the transcript before calling it a violation. [The self-audit reference](references/self-audit.md) says where the files and incident times live.
- For each incident, state the time to detect and to recover; chart every count with a time axis or three or more values ([report evidence rule](../report/SKILL.md#state-what-the-evidence-supports)).
- Keep two one-line outcomes from [the level-up passes](../../../docs/processes/climb.md#how-to-think-the-level-up-passes): the red team (how this conclusion is wrong, and the evidence that would change it) and bigger (the ten-times version, and what it would take).

## Log the run

```bash
skill-run-log /reflect --target "<scope and period>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The period's work met its checks but never set a target above its baseline | `/be-ambitious` | the hill, its baseline and the best known result |
| A correction is a skill, AGENTS.md or doc change | `/writing-for-agents` | the finding, its evidence and the owning file |
