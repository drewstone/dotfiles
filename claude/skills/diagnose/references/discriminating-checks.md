# Checks that distinguish explanations

Choose the row matching the uncertainty.
State what each possible result would mean before running the check.
Several causes can coexist.

| Suspected cause | Check | What the check can establish |
|---|---|---|
| Wrong code, model, inputs, or backend | Trace the invocation through routing to the executed identity and input digest | Whether the intended experiment ran |
| No-op or cached result | Inspect change activation and cache identity; repeat with an isolated changed input | Whether the measured path depends on the change |
| Missing or malformed evidence | Reconcile attempts with raw records, parser errors, and aggregate inputs | Which outcomes were lost or substituted |
| Score does not respond to quality | Score known acceptable and realistic unacceptable artifacts through the same path | Whether the assessment can distinguish the claimed behavior |
| Scores saturated on easy cases | Inspect per-case outcomes and test a relevant harder case | Whether the current task can expose the proposed advantage |
| Leakage | Inspect target-visible setup and replay with hidden evidence removed | Whether information unavailable in production supplied the answer |
| Unequal resources or conditions | Reconstruct actual usage and pair comparable attempts | Whether the difference is confounded by allocation or environment |
| Claimed mechanism did not activate | Inspect the event that would demonstrate it | Whether this run tested the mechanism at all |
| A noisy or small sample obscures an effect | Apply the registered comparison to valid observations | Which useful effects the evidence can support or exclude |
| A valid result differs from expectation | Check independent cases and the causal prediction | Whether the expectation should change |

Read [comparison design](../../evolve/references/STATS.md) when the unresolved question concerns uncertainty or the adequacy of the sample.

## Interpret a negative result

Separate a valid run from a decisive comparison.
A valid run can leave the useful effect unresolved.
A confidence interval that includes zero does not establish equivalence.
A test with sufficient precision can reject the useful-effect claim without proving an exactly zero effect.

Do not turn missing mechanism evidence into proof that the mechanism cannot work.
Do not protect a failed design by inventing an untested requirement after the result.
If another implementation would test a different explanation, state that difference and why the additional test changes the decision.
