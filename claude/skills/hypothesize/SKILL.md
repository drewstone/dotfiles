---
name: hypothesize
description: Decide what to try next when progress stalls or an external idea appears: test the limiting constraint, research mechanisms, and pick deciding tests.
---

# Hypothesize

Use this when the next useful approach is unclear, attempts keep varying the same unsupported idea, a constraint or target may be limiting progress, or a paper, post, repository, or technique may change a decision.
Finish with supported candidates and deciding experiments, or an evidenced no-change decision; keeping a sound target or design is a valid result.

## Establish the constraint

Read prior attempts and measure the actual path before naming the limiting cause.
State the current outcome, its execution conditions, and the evidence linking the limit to a mechanism.
If available checks cannot establish that link, run the missing check within scope or record exactly what remains unavailable; do not present a suspected constraint as measured.

Separate:

- physical or information limits supported by evidence;
- required security, integrity, and product behavior;
- contractual or operational choices that need an authorized decision to change;
- historical implementation choices and untested assumptions.

A service commitment is a requirement, not a law of physics, and an implementation limit is not necessarily a fundamental bound.
Prefer eliminating unnecessary work, then simplifying the remaining work.
Read [constraint-changing options](references/constraint-options.md) when the path forward requires a different problem formulation, dependency, execution model, or metric.
Change a metric only when it fails to represent the required outcome; a bounded metric or a modest remaining improvement does not justify changing the goal.

## Investigate before proposing

Read the goal, measured constraints, existing capability, and prior rejected approaches.
Research relevant primary sources and implementations by mechanism, not just by the project's terminology.
Record what each source actually establishes and whether its assumptions match the current system.
Distinguish reproduced local evidence, external evidence, causal reasoning, and an unsupported guess.
Do not treat missing accessible research as proof that no prior art exists.
Use the research tools available within scope; this skill does not implicitly request a special research mode or new spending authority.

## Check an external claim

Read the relevant primary source, including the method or implementation supporting its conclusion; a summary or abstract alone may not establish the part being considered.
Record the claim, actual evidence, mechanism, assumptions, and limitations, distinguishing causal evidence from a plausible mechanism and an observed correlation.
Inspect the current system by behavior across relevant knowledge records, exports, implementations, and callers, and record the searched surfaces.
If source locations disagree, resolve the implementation the current project uses before claiming a capability is absent.
Do not adopt an idea because its terminology sounds new, or reject it solely because our implementation has a different name.

Compare the external approach with what the system does now under the relevant scale, data, resources, operating conditions, and required behavior.
State the proposed benefit and the smallest check that could refute it, and run the available check within the task's authority before deciding.

| Verdict | Meaning |
|---|---|
| `ADOPT` | The technique is supported for the intended use; state the evidence and scope |
| `ADAPT` | A supported mechanism transfers with specific changes; state what differs and how it was checked |
| `REJECT` | Evidence or required behavior rules out adoption, the existing system is adequate, or no relevant decision changes |
| `DEFER` | A material uncertainty remains; identify the deciding test and the condition for running it |

When the project's knowledge base uses `prior` pages, record the external claim as `external-unverified` until local reproduction supports promotion to `measured`.
Keep the external source and local result separately attributable, and use the project's current ingestion interface.
For authorized adoption, make the smallest change in the owning code or guidance and verify it; a no-change decision is complete when its evidence is recorded.

## Form and compare candidates

For each viable candidate, record:

- the mechanism and required user outcome;
- supporting and contrary evidence with source locations;
- assumptions that remain untested;
- the expected effect in real units when estimable, otherwise the uncertainty;
- experiment and operating costs, dependencies, and risk;
- the smallest observation that would refute the useful-effect claim.

Include deleting work or using an existing simpler solution when it meets the requirement.
Seek a different mechanism when the current family cannot address the demonstrated cause.
Do not invent alternatives, probabilities, or improvement multipliers to fill a table.
Read [candidate comparison](references/candidate-comparison.md) when tradeoffs or dependent experiments make the order unclear.

## Record the choice

Write `.agent/hypotheses/<date>-<slug>.md` with sources, the measured constraint and required invariants when examined, candidates, rejected alternatives, deciding tests, and the recommended sequence.
For each deciding test, record resource limits, acceptance criteria, permitted regressions, and stopping conditions before a build.
For sampled or noisy comparisons, read [comparison design](../evolve/references/STATS.md).
A temporary regression is neither required nor evidence of architectural progress.
A single supported candidate, or no justified change, is a valid result.
This skill selects experiments; subsequent execution follows the completed analysis and the task's existing authority.

## Log the run

```bash
skill-run-log /hypothesize --target "<outcome, constraint, or external claim>" --verdict <VERDICT|ADOPT|ADAPT|REJECT|DEFER> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A scoped change has a deciding experiment | `/evolve` | The hypothesis, baseline, and test |
| The chosen mechanism requires an architectural build | `/pursue` | The candidate, alternatives, and required behavior |
| The constraint still needs measurement on the actual path | `/ground-truth` | The missing evidence and execution boundary |
| Unnecessary work can be removed directly | `/simplify` | The candidate, required behavior, and affected callers |
| A runtime capability needs adoption in the active project | `/build-with-agent-runtime` | The required behavior and current implementation |
