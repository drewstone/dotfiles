---
name: calibrate-before-measure
description: Before an eval, prove the metric separates good and bad cases and rejects a trivial baseline.
---

# Calibrate Before Measure

This is a guard skill.
Complete it before spending on an eval, benchmark, A/B test, or optimization run.

## Prove The Metric Separates Quality

1. Build one clearly capable fixture and one realistic bad fixture for the behavior being measured.
2. Score both through the exact production scoring path.
3. Require a wide separation around the decision boundary.
4. Inspect every scoring input and intermediate result for leakage, constant outputs, missing evidence, and proxy metrics.
5. Repair the metric and repeat if the bad fixture passes or the capable fixture fails.

Do not choose universal score cutoffs when the domain already has a meaningful pass boundary.
Record the two fixtures, scores, and margin.

## Prove The Task Needs The Capability

Run the simplest plausible baseline, such as a constant answer, one search, or one unguided attempt.
If it ties the intended system, the case is too easy, saturated, or measuring the wrong behavior.
Strengthen the case before comparing systems.

## Completion

Report the strong score, weak score, separation, simple-baseline score, sample count, exact command, and artifact paths.
No broader run starts until both checks pass.
Once both pass, return to the original evaluation with this evidence.
Repeat calibration only when the case, scoring path, or relevant conditions change.

## Log the run

On completion, append one line so later analysis can grade this skill:

```bash
skill-run-log /calibrate-before-measure --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Calibration passes, but the checked task omits a difficulty required by the original claim | `/push-past-easy` | the missing difficulty, original claim, and calibration evidence |
| Metric separation between the known-good and known-bad case is inside 2× the noise floor | `/eval-engineering` | the separation number + the case/scoring design that failed |
| A trivial baseline (no tools, no search, empty diff) scores ≥ 80% of the real run | `/eval-engineering` | the baseline score + the case that is too easy |
| Judge disagrees with human labels on > 10% of ≥20 labeled examples | `/eval-agent` | the disagreement rows + the current rubric |
