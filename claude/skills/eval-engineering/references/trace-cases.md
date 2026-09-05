# Select cases from traces and expand coverage

Read this when recorded runs supply case candidates or the requested evaluation spans several cases.

## Mine actual behavior

Sample successes, failures, and common requests from the relevant production conditions.
Record the inspected date range, run identities, and selection method.
Cluster by user job and failure cause, then check existing coverage before creating another case.
Preserve rare severe failures even when frequency is low.

Extract realistic inputs, dependencies, and initial state.
Remove secrets and unrelated personal data while preserving the behavior under test.
Do not copy the target's recorded answer into expected data as if it were independent truth.
Establish expected outcomes from requirements, authoritative sources, or independently checked effects.

Choose cases that could distinguish the proposed correction from the existing behavior.
A renamed copy of one case adds little coverage.

## Expand after the first case executes

Map the requested user groups, task shapes, environments, and failure modes to cases.
Keep development cases available for diagnosis and reserve unseen cases for final comparison where generalization matters.
Prevent hidden cases and labels from entering candidate generation.

Use the same cases and compatible seeds or initial states for baseline and candidate.
Preserve invalid, incomplete, and unmatched attempts.
Report coverage gaps and do not infer broad success from one passing case.

For comparative conclusions, read [comparison design](../../evolve/references/STATS.md).
Include outcome differences, uncertainty, critical regressions, cost, latency, and service or measurement failure counts.
Choose further cases for uncovered requirements or uncertainty that could change the decision, not an arbitrary suite size.
