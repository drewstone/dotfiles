# Analyze runs, comparisons, and timing

Read this when a report compares groups, aggregates run records, or attributes time and cost.

## Establish provenance and coverage

Identify the population, selection method, date range, observation unit, run IDs, and exact collection command.
For model experiments, retain the actual model, provider/endpoint, runner identity, configuration, arms, and relevant code or prompt identity from the records.
Record unknown fields; do not reconstruct identities from memory.

Build a complete table of units and measured fields before aggregating.
Include successes, failures, cancellations, incomplete attempts, invalid rows, and unmatched pairs.
Explain absent values and exclusions.
Reconcile these classes to the total attempted population and reconcile aggregate values with the contributing rows.

For numeric fields, include sample count and a distribution summary suited to the question.
Min, median, upper percentile, and max can expose a tail that a mean hides.
Use category counts and denominators for discrete outcomes.
Inspect shape, outliers, and missingness before attributing an aggregate change to one mechanism.

## Compare like conditions

Disclose unequal group sizes, actual resources, data selection, environments, execution paths, termination rules, and capture gaps before interpreting differences.
Pair the same cases when the design supports pairing.
Keep observational comparisons labeled as such when groups are not comparable enough for causal inference.

Read [comparison design](../../evolve/references/STATS.md) when the report must assess a sampled effect or make a promotion decision.
Show every measured outcome, regression, cost, and error category for each arm.
Do not substitute a single favorable score for the complete result.
Keep complete row-level tables in the report or a directly linked artifact when they exceed the readable inline view.

## Decompose a flow

Use actual timestamps or spans tied to the same request, task, or run.
Define where total elapsed time starts and ends and whether clocks are comparable.
Separate queueing, active computation, tool or network waits, retries, and unobserved intervals.

A waterfall can show ordering and overlap; it does not justify summing concurrent spans.
Find the critical path when explaining elapsed time.
Stage percentiles cannot be added to produce a total percentile.
Attribute monetary or token cost separately from elapsed time because concurrent work still incurs cost.

Label warm/cold state, concurrency, environment, sample count, timing precision, and instrumentation overhead when relevant.
Show the remainder when observed stages do not explain the total.
Tie proposed savings to the measured removable work and state assumptions behind projections.

## Select the relevant interpretation

| Question | Evidence that changes the decision |
|---|---|
| Evaluation or architecture result | Capability, comparison design, outcome, mechanism activation, resources, and generalization |
| Reliability or scaling | Completed workload, utilization, service objectives, errors, recovery, and limiting dependency |
| Dataset quality | Coverage, distributions, missingness, duplicate units, outliers, and label uncertainty |
| Performance or cost | User-visible latency, throughput, cost per unit, before/after differences, and regressions |
| Security | Affected boundary, exposure, reproducible consequence, correction, and verification |
| Spend or funnel | Denominators, drivers, trend, attribution limits, and sensitivity to assumptions |

Use only the lenses the question requires, while preserving all measurements available within the chosen scope.
