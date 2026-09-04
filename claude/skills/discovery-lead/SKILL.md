---
name: discovery-lead
description: Design a measurable discovery system by authoring its first AgentProfile, independent checks, resource limits, and smallest live recursive proof.
---

# Discovery lead

Hold the seat above the system under test.
Your product is a system that can do the research, not research that you quietly did for it.

## Keep authority separate

| Seat | Owns |
|---|---|
| Operator | The first root `AgentProfile`, the question that can fail, reference cases, resource limits, and the final decision. |
| Root profile | Research strategy, child `AgentProfile` authoring, experiments, revisions, and evidence-backed stop proposals. |
| Runtime and Sandbox | Execution, recursion, identity, budgets, joins, completion enforcement, recovery, cancellation, and remote placement. |
| Eval | Checks and comparisons that the system under test cannot edit. |

The operator authors version 1 because no system exists before it.
The measured loop authors version 2 and later candidates.
Do not let an agent change its own check, allocation, or accepted result.

## Build the smallest decisive proof

1. Read the existing results and raw run records before spending again.
2. Register the capability claim, its smallest useful effect, and the observation that would refute it.
3. Author one complete root `AgentProfile`.
   Give it the capabilities and research policy needed to author child profiles, recurse, inspect artifacts, and revise its method.
   Configure resource limits, recovery, and cancellation through Runtime.
4. Keep Discovery production-code-free.
   If a shared capability is missing, record the exact upstream defect.
   Fix its owning package when the active task authorizes that package.
5. Run one live root → child → grandchild proof before a broad campaign.
6. Require exact profile identities, spawn records, complete costs, and a trace that shows each claimed mechanism firing.
7. Require the parent to use a checked child artifact, revise after evidence, continue after context replacement, and reject a seeded false claim.
8. Run a calibrated paired campaign only after the recursive proof passes.
   Hold actual resources constant and preserve every attempt, failure, null, and unmatched result.

If the claimed mechanism did not run, repair the profile or shared execution path.
Do not interpret that run as evidence for or against research quality.

## Completion

Deliver either the registered proof with independently checked records, or a reproducible failure that isolates one cause.
Treat a dead end as demonstrated only when every eligible approach has a trace-backed rejection or needs an unavailable resource or authority.
State what remains unknown.

## Log the run

```bash
skill-run-log /discovery-lead --target "<domain/lab>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The live proof is ready to launch or resume | `/operate` | the root profile, registered claim, limits, and checks |
| A result is null, surprising, or too good | `/autopsy` | the run ID and raw artifact path |
| No check can separate success from failure | `/eval-engineering` | the target behavior and one good/bad case pair |
| The recursive proof passed and architectures can be compared | `/arena-experiment` | the paired tasks, arms, and equal-resource contract |
