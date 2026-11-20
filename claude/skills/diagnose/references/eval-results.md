# Evaluation results and comparisons

Read this when the suspect result is an evaluation score or a comparison between systems.

## Find the first stage that disagrees

| Stage | Check |
|---|---|
| Execution | The intended entrypoint, backend, profile, model and dependencies ran |
| Capture | Required calls, actions, state changes and terminal outcomes have evidence |
| Artifact | Scoring reads the deliverable the user receives |
| Scoring | Each check has its evidence and separates acceptable from unacceptable behavior |
| Comparison | Cases, splits, resources and conditions support the stated comparison |
| Decision | Objective failures and missing evidence cannot become passes through semantic scores or defaults |
| Reporting | Raw outcomes reconcile with reported classes, denominators and aggregates |

## Check a comparison's claim

When a null or disappointing comparison may not have tested the mechanism it claims to test, check that:

1. The task entered the conditions where the design claims an advantage.
2. The claimed mechanism ran and its required events were recorded; for a recursive claim, use [the recursive proof requirements](recursive-proof.md).
3. The assessment could distinguish the smallest useful effect.
4. The comparison met its registered resource, sampling and stopping rules.

When a harder condition could reverse the result (scale, ambiguity, dependency depth, recovery, concurrency, unseen inputs), check whether the user requirement includes it.
If the simple case covers the real need, keep its result and limit the claim accordingly.
Otherwise build a realistic case that exercises the missing condition with the same environment and resources, calibrate changed cases or scoring, and run the deciding comparison.
Never raise difficulty only to make a result fail or to justify a complex system.

Keep the original claim and its limits, and do not invent conditions after seeing the result.
A mechanism that cannot execute or costs too much may still fail a feasibility or efficiency requirement.
If a valid comparison excludes the registered useful effect or breaks required limits, reject or simplify the design; if the evidence cannot decide, keep the uncertainty and name the test that would resolve it.
Do not keep defending a design with new, unmeasured explanations.
