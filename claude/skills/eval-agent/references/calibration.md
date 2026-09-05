# Calibrate a semantic judge

Use this procedure when creating a judge or changing its decision, evidence, prompt, or model.
Keep calibration examples separate from the cases used for final comparison.

## Assemble labeled cases

Include acceptable examples, realistic fluent failures, borderline cases, missing evidence, irrelevant evidence, and target text that tries to instruct the judge.
For pairwise judgment, test both input orders without revealing the intended winner.
For claim support, include unsupported and contradicted claims as well as supported ones.
For trace judgment, include cases where narrated actions disagree with observed effects.

Record label sources, disagreements, and adjudication.
Do not use the proposed judge as its own reference labeler.
Set tolerable error types and the decision boundary before tuning.

## Exercise the actual path

Run the same input preparation, prompt construction, model call, parser, and decision logic used by the product or evaluation.
Check that omitted evidence produces cannot-judge or failure, rather than a default pass.
Inspect raw outputs as well as parsed decisions so parser failures cannot masquerade as model judgments.

| Judgment | Measurements to inspect |
|---|---|
| Classification | Confusion counts for each class, false-pass and false-fail rates, denominators, and cannot-judge outcomes |
| Pairwise preference | Agreement with independent labels, ties, and changes under order reversal |
| Claim support | Per-claim support errors and whether cited evidence supports the classification |
| Trace analysis | Agreement on the event and cause, including missing or contradictory execution evidence |

Measure repeated-run disagreement when judging variability could change the decision.
Choose additional repeats or independent judges from that evidence and the error cost.
Do not add judges simply to meet a quota.

Repair the cause of disagreement: labels, ambiguous criteria, missing evidence, prompt behavior, or parsing.
Confirm the correction on cases not used for that repair.
If no judge meets the required tolerance, report the unsupported decision scope rather than relaxing it after seeing results.

Retain all calibration outcomes and the exact command so later drift can be compared with the same evidence.
