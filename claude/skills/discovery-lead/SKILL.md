---
name: discovery-lead
description: Build a discovery system from its first AgentProfile, handed sources, resource limits, and independently checked results.
---

# Discovery lead

Build a system that sources its own problems, performs the research, and produces independently checked results.
Keep the observer's contribution distinguishable from the system's.

## Assign authority

| Owner | Responsibility |
|---|---|
| Outermost observer | Initial root `AgentProfile`, handed sources, resource limits, the fixed invariants, and the authorization to start |
| Profiled system | Its problems, research strategy, organization, descendant profiles, experiments, measurement, and evidence-driven revisions |
| Runtime and Sandbox | Execution, recursion, identities, budgets, joins, recovery, cancellation, and remote placement |
| Independent assessment | Checks and comparisons commissioned from outside the authoring lineage, which the measured system cannot change |

The observer authors the initial root profile; the measured system authors subsequent candidate profiles.
Hand the system sources, resources, and the fixed invariants.
Do not hand it a problem, a decomposition, a team shape, or a research method.
Fix independence, stated unknowns, and immutable evidence, and leave the measurement to the system.
Label any later observer intervention so it cannot be mistaken for autonomous improvement.
Do not let the measured system alter its own assessment, allocation, or accepted result.

## Build and prove

1. Read existing results and raw run records before creating another system or spending on another run.
2. Register the capability claim about the system, the useful-effect threshold when comparing systems, and the evidence that would refute it.
   That claim is about the system, not about its research subject.
   Do not freeze the research measurement on the system's behalf.
3. Author a complete root profile with the capabilities needed for the research policy.
   Configure execution limits, recovery, and cancellation through the existing runtime.
   A per-child stop is a request the owning manager's live acknowledger applies, so plan the out-of-band procedure a wedged root or dead runner needs.
4. Keep shared execution mechanisms in their owning package.
   Fix an authorized upstream defect there instead of duplicating the mechanism in the research project.
5. Read [the recursive proof requirements](references/recursive-proof.md) when the claim includes recursion, learning, or recovery.
   Observe those mechanisms inside real research rather than behind a synthetic proving run.
   Any proving run is a real pursuit, and a mechanism check does not gate the research.
6. Inspect exact identities, execution events, artifact use, checks, and resource records.
   Repair a missing mechanism before interpreting research quality.
7. When a comparison is in scope, use calibrated cases and the registered resource and stopping rules.
   Preserve all attempts, failures, and unmatched results.

## Completion

Deliver the working system and checked proof for the requested scope, or the reproduced failure and what remains unresolved.
Continue eligible work under the active objective and limits.
A dead-end conclusion needs evidence rejecting the eligible approaches, or showing that the remaining approaches require unavailable resources or authority.

## Log the run

```bash
skill-run-log /discovery-lead --target "<domain/lab>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The system is ready for an authorized launch or continuation | `/operate` | The profile, claim, limits, and handed sources |
| A result is null, surprising, or suspect | `/autopsy` | The run ID and raw artifacts |
| No assessment separates success from failure | `/eval-engineering` | The required behavior and good/bad examples |
| Real research exercised the mechanisms and architectures can be compared | `/arena-experiment` | The cases, arms, and resource contract |
