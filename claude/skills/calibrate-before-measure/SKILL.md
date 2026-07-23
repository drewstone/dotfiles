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

## Then consider

- `push-past-easy` when calibration passes and the result still needs an adversarial replication.
- `eval-engineering` when calibration fails because the case or scoring design must be rebuilt.
