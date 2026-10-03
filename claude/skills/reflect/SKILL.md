---
name: reflect
description: Review completed work against its evidence, identify repeated causes and useful practices, and retain justified corrections.
---

# Reflect

Use this to learn from work already performed in a session, project, or portfolio.
Judge outcomes against the user's objective; invocation counts and self-grades do not establish effectiveness.

## Inspect the work

1. Define the scope and period.
   Which prior findings in `~/.claude/reflections/INDEX.md` bear on this work?
   Reconcile open actions with current state.
2. Inspect the evidence needed to explain outcomes; use [session efficiency](references/session-efficiency.md) for stalled or repetitive coding sessions.
   Record important sources you could not inspect and why.
3. What changed for the user, and what remains unproved? Separate facts from interpretation.
4. Which recurring cause survived a prior correction, and what evidence explains why?
5. Identify practices supported by outcomes and failures worth correcting.

Read [portfolio analysis](references/portfolio.md) for work across projects or sessions with different conditions.
Read [skill evidence](references/skill-evidence.md) before attributing outcomes or user overrides to a skill.

## Choose what should change

Rank findings by consequence, recurrence or exposure, scope, and confidence in the cause.
Include measured costs or projected savings only when evidence supports them; include units and label estimates and assumptions.
Search the owning guidance, skills, and memory before recording a durable correction.
Extend an existing owner, and delete unnecessary requirements before adding procedures.
Create a new rule or skill only when evidence supports its distinct job.
Leave sound work unchanged.

Carry authorized corrections through verification; for analysis-only work, report the correction and evidence.

## Preserve the findings

Write the canonical reflection to `.agent/reflections/YYYY-MM-DD-HHMMSS.md`, or the project's adopted path.
Add a concise link to `~/.claude/reflections/INDEX.md` without copying the reflection again.
Record scope, sources, outcomes, repeated causes, changes, verification, and unresolved decisions.
Use counts and denominators for frequency claims; retain unknowns and sampling limits.
A reflection needs neither a grade, a fixed section list, nor a forced next action.

## Log the run

```bash
skill-run-log /reflect --target "<scope and period>" --verdict <VERDICT> --next /<skill-or-stop>
```
