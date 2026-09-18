# Options for changing a constraint

Read this when the measured limit may require a different formulation, dependency, execution model, or measure.
Use the option that addresses the demonstrated cause; none is mandatory.

| Option | Question | Evidence needed |
|---|---|---|
| Remove work | Does the user need the operation or only its downstream result? | Caller requirements and a flow that preserves the result without the operation |
| Simplify a dependency | Is the expensive coordination or interface required? | Actual consumers, ownership, and failure behavior |
| Retest an implementation limit | Does the earlier dependency, scale, or platform restriction still apply? | The original assumption and a current check of the limiting behavior |
| Change execution | Can batching, streaming, precomputation, placement, or another data structure remove the cost? | Workload properties and measured tradeoffs, including freshness and recovery |
| Correct the measure | Does the metric reward behavior unrelated to the user's outcome? | A demonstrated disagreement between the metric and required behavior |
| Revisit a requirement | Would another product or contractual choice be valuable? | Consequences, affected stakeholders, and authority to change the requirement |

Precomputation moves work and may introduce freshness or storage costs.
Parallel execution may move the limit to coordination or shared capacity.
A new platform may trade request cost for operational complexity.
Include those effects in the proposed comparison rather than counting only the removed segment.

## Test a transition fairly

Preserve a comparable baseline and evidence that the proposed mechanism ran.
If a metric changes, measure both old and new definitions where possible and explain which conclusions remain comparable.
Do not reuse an old score as the baseline for a different measure.

Define any permitted interim regression and its resource or operating bounds before implementation.
A regression outside required security or integrity behavior is not excused by a future benefit.
Apply the recorded completion and rejection criteria at the deciding test.
Do not treat early difficulty as automatic failure or automatic evidence of promise.
