---
name: reconcile
description: Decide whether an external claim or technique adds value by checking its evidence, existing capability, and transfer to the current system.
---

# Reconcile an external idea

Turn a paper, post, repository, or technique into an evidence-backed decision.
Do not adopt an idea because its terminology sounds new or reject it solely because our implementation has a different name.

## Read the claim and local capability

Read the relevant primary source, including the method or implementation supporting its conclusion.
Record the claim, actual evidence, mechanism, assumptions, and limitations.
A summary or abstract alone may not establish the part being considered.
Distinguish causal evidence from a plausible mechanism and an observed correlation.

Inspect the current system by behavior across relevant knowledge records, exports, implementations, and callers.
Record the searched surfaces and what is already present.
If source locations disagree, resolve the implementation used by the current project before claiming a capability is absent.
Report unavailable sources and command failures.

## Test whether the idea changes a decision

Compare the external approach with what the system does now.
Check relevant scale, data, resources, operating conditions, and required behavior.
A difference in conditions may require adaptation or further evidence rather than automatic rejection.

State the proposed benefit and the smallest check that could refute it.
Use existing observations or an isolated reproduction when they can answer the question.
Run the available check within the task's authority before deciding.
When evidence is insufficient, name the missing test and why its outcome would matter.

## Decide and record

| Verdict | Meaning |
|---|---|
| `ADOPT` | The technique is supported for the intended use; state the evidence and scope |
| `ADAPT` | A supported mechanism transfers with specific changes; state what differs and how it was checked |
| `REJECT` | Evidence or required behavior rules out adoption, the existing system is adequate, or no relevant decision changes |
| `DEFER` | A material uncertainty remains; identify the deciding test and the condition for running it |

Use the project's existing knowledge or decision record.
When its knowledge base uses `prior` pages, record the external claim as `external-unverified` until local reproduction supports promotion to `measured`.
Keep the external source and local result separately attributable, including actual run IDs and commands.
Use the project's current ingestion interface instead of assuming a copied API still applies.

For authorized adoption or adaptation, make the smallest change that implements the decision in the owning code or guidance and verify it.
Do not add a new rule, module, or duplicate implementation when the existing system already supplies the benefit.
A no-change decision is complete when its evidence is recorded; it does not require editing a file merely to demonstrate action.

## Log the run

```bash
skill-run-log /reconcile --target "<external claim or technique>" --verdict <ADOPT|ADAPT|REJECT|DEFER> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The decision supports a measured implementation experiment | `/evolve` | The source, baseline, and proposed change |
| Several unresolved mechanisms need research and experiment selection | `/hypothesize` | The claim, alternatives, and missing evidence |
| A runtime capability needs adoption in the active project | `/build-with-agent-runtime` | The required behavior and current implementation |
| The supported benefit is removal of unnecessary work | `/simplify` | The requirement, evidence, and affected callers |
