# Speed evidence

What user path is slow, what dominates its cost, and which change could remove that cost?
Measure the real path before choosing an optimization.
Record the workload, revision, environment, warm/cold state, sample count, timings, and relevant resource or call counters.
Choose a target and stop condition tied to the user outcome; stop when gains fall within noise or complexity outweighs value.

Compare before and after under equivalent conditions, without competing benchmark work.
Preserve outputs and user behavior; disclose changes to the measurement itself.
Use distributions for variable latency and distinguish observed results from projections.
A local benchmark supports only its measured scope; verify the deployed path before claiming a production improvement.

Prefer removing work, then reusing a maintained implementation, before tuning parameters.
Where regression risk warrants it, use an existing stable counter or real-flow check; do not automatically add a flaky timing gate.
Choose rollout and recovery controls for the actual risk, then retire temporary compatibility or flags after cutover.
Put measurements and limits in the PR or owning performance record.

Reject speed claims based only on LOC, fewer tests, a single contended run, reduced workload, or disabled functionality.
When tuning stalls, ask whether a different algorithm or architecture removes the measured constraint.
