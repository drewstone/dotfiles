---
name: discovery-lead
description: Build a discovery system from its first AgentProfile, independent checks, resource limits, and a live recursive proof.
---

# Discovery lead

Build a system that performs the research and produces independently checked results.
Keep the operator's work distinguishable from the system's contribution.

## Assign authority

| Owner | Responsibility |
|---|---|
| Operator | Initial root `AgentProfile`, research question, reference cases, resource limits, and acceptance decision |
| Profiled system | Research strategy, descendant profiles, experiments, and evidence-driven revisions |
| Runtime and Sandbox | Execution, recursion, identities, budgets, joins, recovery, cancellation, and remote placement |
| Independent assessment | Checks and comparisons that the measured system cannot change |

The operator authors the initial profile; the measured system authors subsequent candidate profiles.
Label any later operator intervention so it cannot be mistaken for autonomous improvement.
Do not let the measured system alter its own assessment, allocation, or accepted result.

## Build and prove

1. Read existing results and raw run records before creating another system or spending on another run.
2. Register the capability claim, required outcome, useful-effect threshold when comparing systems, and evidence that would refute the claim.
3. Author a complete root profile with the capabilities needed for the research policy.
   Configure execution limits, recovery, and cancellation through the existing runtime.
4. Keep shared execution mechanisms in their owning package.
   Fix an authorized upstream defect there instead of duplicating the mechanism in the research project.
5. Read [the recursive proof requirements](references/recursive-proof.md) when the claim includes recursion, learning, or recovery.
   Run the smallest live proof that exercises every claimed mechanism before a broad campaign.
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
| The system is ready for an authorized launch or continuation | `/operate` | The profile, claim, limits, and checks |
| A result is null, surprising, or suspect | `/autopsy` | The run ID and raw artifacts |
| No assessment separates success from failure | `/eval-engineering` | The required behavior and good/bad examples |
| The live proof passed and architectures can be compared | `/arena-experiment` | The cases, arms, and resource contract |
