---
name: reflect
description: Review completed work against its evidence, identify repeated causes and useful practices, and retain justified corrections.
---

# Reflect

Use this to learn from work already performed in a session, project, or portfolio.
Judge outcomes against the user's objective; invocation counts and self-grades do not establish effectiveness.

## Inspect the work

1. Define the scope and period.
   Read relevant prior reflections and `~/.claude/reflections/INDEX.md` when present.
   Reconcile open actions with current state.
2. Collect relevant transcripts, run artifacts, repository history, reviews, checks, release evidence, and user corrections.
   Record important sources you could not inspect and why.
3. Compare requested outcomes with observed results; label facts and interpretations.
4. Trace recurring problems to prior corrections and explain why they failed, were not applied, or remain unverified.
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

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Eligible actions need routing against the active objective | `/governor` | Findings, evidence, and scope |
| A measured process problem has a testable correction | `/evolve` | Baseline and proposed change |
| Related failures need a causal explanation | `/diagnose` | Outcomes and shared symptom |
| An authorized action needs coordination | `/orchestrate` | Work, dependencies, and completion checks |
| A material claim lacks an available check | `/verify` | Claim, artifact, and required check |
| Context replacement risks unfinished work | `/session-continuity` | Reflection and exact continuation state |
