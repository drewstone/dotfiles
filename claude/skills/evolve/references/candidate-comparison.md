# Compare uncertain candidates

Read this when candidate tradeoffs or experiment dependencies make the sequence unclear.

## Keep estimates honest

Compare effects in the units of the required outcome.
Keep money, elapsed time, resource use, reliability, and risk separate unless the decision provides an explicit conversion.
A sum of unlike costs has no interpretable unit.

Assign numeric probabilities only when evidence supports their calibration or the decision explicitly needs an elicited estimate.
A source being published does not assign it a universal probability of transferring to this system.
Use ranges and sensitivity analysis when uncertain assumptions could reverse the ranking.
Label guesses and retain the evidence behind them.

## Choose the next test

Prefer a useful effect with credible causal support and tolerable consequences.
Then ask which inexpensive observation could eliminate or confirm a shared assumption across candidates.
For example, a traffic replay can establish whether batching has enough concurrent requests before comparing batching implementations.
The value is the decision it changes, not an abstract information score.

Keep prerequisites explicit.
A test depending on an unverified service, unavailable data, or missing execution feature is not ready for a broad run.
Run the smallest complete proof before committing the larger resources.

Record why a candidate lost or remains deferred.
A rejected implementation does not automatically reject every mechanism in its family.
A new candidate should explain what evidence or mechanism differs from prior failures.
