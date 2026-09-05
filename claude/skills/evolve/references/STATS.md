# Statistical comparison and promotion

Use the project's maintained, tested statistical tools to decide whether an experiment supports changing a baseline or default.
If the project already uses `agent-eval`, inspect its current reporting exports and tests before adding another dependency.

## Register the comparison

- Record the metric, units, improving direction, summary statistic, and smallest useful effect.
- Identify the independent sampling unit and whether observations are paired by case or run.
  Repeated measurements of one case do not create additional independent cases.
- Choose the sample size from the observed variance and the effect the test must detect.
  Three or five repetitions alone do not establish adequate power.
- Record the test, confidence level, stopping rule, and any correction for multiple comparisons before measuring.
- For an efficiency tradeoff, register the allowed quality regression in the metric's units before measuring.
  Two percentage points means `0.02` on a `0–1` scale or `2` on a `0–100` scale.

## Compute the comparison

1. Validate the observations and record missing or failed runs.
   Preserve their reasons instead of silently excluding them.
2. Compute the observed difference `δ` in the improving direction.
   Report both groups' sample sizes, summaries, spread, and the comparison's uncertainty interval.
3. Use a method that matches the registered sampling design.
   For paired bootstrap comparisons, resample matched pairs together.
   For independent groups, resample each group independently.
   Preserve case or run groups when observations share a source.
4. For bootstrap intervals, record the seed, resample count, and interval method.
   Use `B=10000` resamples unless the project's validated method specifies another value.
   Record the resulting 95% interval as `[ciLow, ciHigh]`.
5. Report the effect size and p-value when the selected method supports them.
   Label unavailable results with their reason.
   Apply the registered correction when making multiple statistical claims.
6. Apply the registered practical threshold and regression limits with the decision rule below.

## Decision rule

| Decision | Condition |
|---|---|
| **promote** | `ciLow > 0`, the registered useful-effect threshold is met, and all regression limits pass |
| **reject** | `ciHigh < 0` or a registered regression limit fails, unless an allowed efficiency tradeoff meets its registered criteria |
| **candidate** | `δ > 0`, but the evidence does not meet the promotion criteria |
| **inconclusive** | The evidence supports neither improvement nor regression |

An efficiency tradeoff can promote only when its measured gain meets the registered threshold and the quality interval meets its registered regression limit.
A favorable point estimate alone does not establish improvement.

## Promotion scope

A statistical decision does not grant deployment authority.
Use the authority already granted for this session and select the supported scope:

- Evidence supports the full user population → global defaults.
- Evidence supports only controlled environments → benchmark or test profiles.
- Evidence needs more validation → retain the candidate and record the missing check.

Record the decision, `delta`, `[ciLow, ciHigh]`, units, method, and evidence on the experiment line in `.agent/experiments.jsonl`.
