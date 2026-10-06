---
name: research-lead-interface
description: Answer questions about active research, agent fleets, progress, topology, resources, and next decisions from current evidence.
---

# Research lead interface

Translate the user's question into the decision they need.
Inspect the relevant records before answering.
Scale the response to that decision: a status fact may need one sentence; a comparison may need a table.

## Establish the current state

- For activity, inspect authoritative liveness, invocations, terminal records, and the latest meaningful action.
- For progress, inspect retained artifacts, checks, changed decisions, and unresolved claims.
- For topology, inspect actual parent edges, executed children, and artifact consumption.
- For resources, inspect measured usage, elapsed time, concurrency, capacity, and explicit unknowns.
- For capability, distinguish current source, installed packages, and observed behavior on the active route.

A registration establishes intent.
A process establishes activity.
A useful artifact establishes output.
An independent check establishes only the claim it tested.
Keep those statements separate.

For recurring fleet reviews or a broad research audit, read the [fleet review question register](references/fleet-review.md).
Use its 12 core questions, evidence records, and triggered deeper reviews.
Verify the actual scheduled command and loaded inputs before claiming automated question coverage.
For fleet comparisons, recursion, efficiency, or account questions, read [topology and resources](references/topology-and-resources.md).

## Answer the human question

Lead with what is happening, what useful work exists, and what remains uncertain.
Say plainly when the fleet is idle.
Name the actual stop cause and the corrective action already underway.
Include the observation time and evidence location when they affect the decision.

Distinguish agent-authored claims, observed events, independent findings, and analyst interpretations where the difference matters.
An unknown outside assessment does not establish absent research progress.
Repeated tool calls or tokens alone do not establish progress either.
Preserve the original acceptance criteria and report stricter interpretations separately.

Explain necessary technical terms through their effect on the research.
Keep internal identifiers in evidence links unless the identity itself answers the question.
Use diagrams only when they clarify an observed relationship.

## Act on the finding

Recommend the smallest action that can resolve the important uncertainty or advance useful work.
Continue actions already authorized by the active task.
Respect current ownership, resource limits, and uncertain admissions before launching replacements.
If idle capacity cannot be used, state the concrete constraint and its owner.
Keep optional analysis from delaying authorized research execution.

## Log the run

```bash
skill-run-log /research-lead-interface --target "<question/run/fleet>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill or reference | What to pass |
|---|---|---|
| Behavioral causes or artifact consumption need trace inspection | [Trace workflows](references/trace-workflows.md) | Exact runs, native sessions, time window, and unanswered questions |
| The finding requires operating an authorized run | `/operate` | Current state, bounds, and the next action |
| A comparative conclusion needs deeper analysis | `/report` | The measured population, artifacts, and remaining uncertainty |
| A surprising result needs causal investigation | `/diagnose` | Exact run records and competing explanations |
| Several agents' work needs a full account | `/play-report` | Observed topology, artifacts, and operator contributions |
