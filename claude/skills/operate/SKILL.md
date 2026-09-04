---
name: operate
description: Launch, inspect, steer, resume, and stop a discovery run while the profiled system performs the research and independent checks judge it.
---

# Operate

Operate the discovery system without becoming its hidden researcher.

## Keep the line visible

| Fact | Producer |
|---|---|
| Execution state, profile identity, trace, cost, failure, and recovery | Operator and shared stack |
| Claims about the research subject | Profiled discovery system |
| Acceptance and comparison | Independent checks |

An operator may introduce a preregistered synthetic fact solely to prove that a check can accept or reject it.
Never use that fact to support the research result.
Label the intervention and require the system to produce any real counterpart itself.

## Before launch

Register criteria that could fail.
For every mechanism claimed by the run, name an observable event.
For a recursive learning claim, require every observation below unless the preregistration excludes it with a reason:

- a root-authored child profile and a child-authored grandchild profile;
- exact parent and child profile identities;
- a checked descendant artifact consumed by an ancestor;
- a profile or strategy revision caused by recorded evidence;
- continuation after a context replacement or process restart;
- rejection of a seeded false claim;
- complete execution, cost, trace, and assessment records.

Check that the task can surprise you and that the assessment rejects a realistic bad result.

## While running

1. Inspect authoritative Runtime or Sandbox state before acting.
2. Treat silence, age, and a quiet stream as observations, never as proof of death.
3. Fill available parallel capacity only with evidence-backed, nonduplicate work inside the remaining resource limits.
4. Use stable assignment keys so a restart cannot repeat completed work.
5. Observe progress before steering.
   Steer when evidence shows drift, a missed artifact, or a stalled approach.
6. Resume durable work after context replacement without asking the user to restate the active goal.
7. Preserve partial artifacts and every rejected or failed path.

Stop research only for an explicit resource limit, user cancellation, checked success, or a demonstrated dead end.
Transport polling may be bounded so it can return control; that bound never declares the research dead.
A dead end requires trace-backed rejection of every eligible approach, or proof that each remaining approach needs unavailable authority or resources.

## At settlement

Report system facts before research findings.
Show every attempt, missing value, resource asymmetry, and unmatched comparison before the verdict.
Do not promote a result whose claimed mechanism did not fire.

## Log the run

```bash
skill-run-log /operate --target "<pursuit/campaign>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| One run is null, surprising, or too good | `/autopsy` | the run ID and raw artifacts |
| Several runs share a confirmed failure | `/diagnose` | all failures and the confirmed example |
| A claimed execution step cannot be observed | `/ground-truth` | the invisible step and real execution path |
| A worker ignored state, tools, or user intent | `/agent-behavior-audit` | the trace span and missed state |
| The proof passed and a paired comparison is ready | `/arena-experiment` | the full tasks, arms, and resource contract |
