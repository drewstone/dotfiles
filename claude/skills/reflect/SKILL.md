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
4. What did the work discover, improve or rule out? Check a claimed gain against its baseline.

Read [portfolio analysis](references/portfolio.md) for work across projects or sessions with different conditions, and [skill evidence](references/skill-evidence.md) before attributing outcomes or user overrides to a skill.

## Choose what should change

Rank findings by consequence, recurrence, scope and confidence in the cause, with costs or savings only when evidence supports them.
Search the owning guidance, skills and memory first; extend an existing owner, and create a new rule or skill only for a distinct job.
Fix a mistake that has recurred at the highest level that works: architecture (one owner, one supported path, the wrong import fails), then types, then a lint or check whose error names the fix, then a test, and written rules last, for judgment calls; prove a new check fails on a real past instance.
Derived from cursor/plugins correct (MIT).

Use an [operator scenario](../_probes/operator-scenarios.md) when it exercises the changed decision. The [ambition probe](../_probes/ambition/README.md) can compare approaches to quantified improvement tasks.

After a run, `traces analyze <session>` on your own session surfaces the pattern you cannot see from inside it; name the one systemic fix.

## Preserve the findings

Retained learning goes to the auto-memory directory or a climb-ledger row, not a reflections file, with counts and denominators.

## Climb

For a project measuring operator performance, inspect its registered predictions, corrections and recurrence after a change. [Self-audit](references/self-audit.md) can locate repeated work and stalls in session records. Check the underlying decisions before attributing an effect to a rule.

## Log the run

```bash
skill-run-log /reflect --target "<scope and period>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The period's work met its checks but never set a target above its baseline | `/be-ambitious` | the hill, its baseline and the best known result |
| A correction is a skill, AGENTS.md or doc change | `/writing-for-agents` | the finding, its evidence and the owning file |
