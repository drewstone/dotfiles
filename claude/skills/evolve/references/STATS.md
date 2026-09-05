# Compare measurements and decide promotion

Use this procedure for noisy outcomes, sampled comparisons, or selection among candidates.
Use the project's maintained statistical implementation; do not copy a new statistics library into the experiment.
An exact deterministic check may not need a statistical test.

## Define the comparison before measurement

- Record the metric, units, improving direction, summary statistic, and smallest useful effect.
- Identify the independent sampling unit and whether observations are paired.
  Repeated measurements of one case do not create additional independent cases.
- Specify the population or execution conditions the conclusion should cover.
- Choose sampling and precision from the decision's error costs, observed variation, and useful effect.
  A fixed repetition count does not establish adequate evidence.
- Record the analysis, stopping rule, uncertainty method, and treatment of multiple comparisons.
- Define invalid-run handling and regression limits, including permitted efficiency tradeoffs, before seeing results.
  Express each limit in the metric's units.

## Compute without changing the question

1. Validate raw observations and reconcile all attempts, including missing, invalid, and failed runs.
   Report exclusions and reasons; do not hide treatment-dependent failures by dropping them.
2. Report each group's sample size, summary, spread, and the observed difference.
   Choose summaries that match the outcome; a mean, median, tail, or rate answers a different question.
3. Use a method matching the sampling design and distribution.
   Preserve pairs and shared-source groups instead of treating dependent rows as independent.
4. Report uncertainty supported by the selected method and sample.
   For bootstrap methods, record the interval method, seed, and resample count; choose them for the required precision.
5. Report effect sizes or p-values when they serve the registered analysis, with their assumptions.
   Apply the planned treatment of multiple comparisons and optional stopping.
6. Check that the test can detect or exclude the useful effect before interpreting a negative result.

## Decide against the recorded criteria

| Decision | Evidence required |
|---|---|
| Promote | The registered analysis supports a useful improvement or allowed tradeoff, and required regression checks pass |
| Reject | The evidence rejects the useful-effect claim, demonstrates unacceptable harm, or violates a required limit |
| Retain as a candidate | Further authorized measurement could decide the claim, but promotion is not yet supported |
| Inconclusive | The available evidence cannot decide the relevant improvement or harm |

A favorable point estimate alone is insufficient when sampling variation could change the decision.
An interval containing zero does not prove no useful effect; use its precision and the registered threshold.
Do not silently replace an inconclusive test with an easier success rule.

## Limit the conclusion

Inspect held-back cases when selection on development cases could overfit.
Include resource use and quality regressions in the same decision as the improvement.
Do not aggregate incompatible units or treat unequal actual resources as a controlled comparison.

Promote only to the population and operating conditions the evidence supports, within authority already granted.
Persist the analysis, decision rule, actual run identities, raw evidence, and unresolved limitations with the experiment record.
