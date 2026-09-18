---
name: reflect
description: Review completed work against its evidence, identify repeated causes and useful practices, and retain justified corrections.
---

# Reflect

Use this to learn from work already performed in a session, project, or portfolio.
Judge outcomes against the actual user objective; invocation counts and self-grades do not establish effectiveness.

## Inspect the work

1. Define the scope and period.
   Read relevant prior reflections and `~/.claude/reflections/INDEX.md` when present.
   Reconcile open actions with current state before repeating them.
2. Collect transcripts, run artifacts, repository history, reviews, checks, release evidence, and user corrections relevant to that scope.
   Record what was not inspected and why.
3. Compare requested outcomes with observed results and distinguish facts from interpretations.
4. Trace a repeated problem to the earlier correction and why it failed, was not applied, or remains unverified.
5. Identify practices worth retaining from outcome evidence as well as failures worth correcting.

Read [portfolio analysis](references/portfolio.md) when the scope spans projects or sessions with different conditions.
Read [skill evidence](references/skill-evidence.md) before attributing outcomes or user overrides to a skill.

## Choose what should change

Rank findings by consequence, recurrence or exposure, affected scope, and confidence in the cause.
Include measured cost and projected savings when available, with units and assumptions.
Do not manufacture a number for a qualitative finding or treat an estimate as observed savings.

Search the owning guidance, existing skills, and relevant memory before writing a durable correction.
Extend the existing instruction when it already owns the issue.
Delete an unnecessary requirement before adding a new procedure.
Create a new rule or skill only when its distinct job and evidence justify it; no note or automation quota applies.
Leave sound work unchanged.

Carry authorized corrections through verification instead of replacing unfinished work with an action list.
For analysis-only scope, provide the concrete correction and evidence without changing the target.

## Preserve the findings

Write the canonical reflection to `.agent/reflections/YYYY-MM-DD-HHMMSS.md`, or the project's adopted reflection path.
Append a concise entry with a resolvable link to `~/.claude/reflections/INDEX.md`.
Do not make a second full copy of the same reflection.

Record scope, source identities, outcomes, supported findings, repeated causes, changes made, verification, and unresolved decisions.
Use counts and denominators for frequency claims, and retain unknowns and sampling limits.
A reflection does not need a grade, a fixed section list, or a forced next action.

## Log the run

```bash
skill-run-log /reflect --target "<scope and period>" --verdict <VERDICT> --next /<skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Competing eligible actions need routing against the active objective | `/governor` | The findings, evidence, and scope |
| A measured process problem has a testable correction | `/evolve` | The baseline and proposed change |
| Related failures still need a causal explanation | `/diagnose` | The linked outcomes and shared symptom |
| An authorized action requires coordinating distinct workflows | `/orchestrate` | The work, dependencies, and completion checks |
| A material claim still lacks an available check | `/verify` | The claim, artifact, and required check |
| Context replacement threatens unfinished work | `/session-continuity` | The reflection and exact continuation state |
