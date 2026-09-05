# Orchestrate reference

The skill entrypoint owns the workflow contract.
This reference explains dependency choices and evidence requirements without prescribing an execution API.

## Dependencies

| Required input | Coordination |
|---|---|
| One item's prior result | Start its next task when that result is checked |
| All items, for deduplication, ranking, or integration | Collect and check the complete set before continuing |
| First result that satisfies a defined condition | Check it, then cancel remaining work if cancellation is authorized and supported |

A workflow can combine these relationships.
Choose each dependency from the data the next task consumes.
There is no requirement to select one structure for the entire workflow.

## Execution

Use the session's native delegation tools or a workflow runtime already supported by the project.
Inspect the current tool schema or installed package exports before writing calls.
Check result collection, cancellation, budget enforcement, and file isolation on a small completed task.
Keep execution within the available agent slots, provider limits, and authorized budget.

Give each worker a concrete output and a way to prove it.
Use independent approaches when they can expose different errors.
Additional agents need a specific job; a fixed reviewer count does not establish confidence.

Treat failed or missing returns as incomplete work.
A runtime may cancel sibling tasks on failure, so inspect their final states before reporting coverage.
Preserve completed results and rerun only the tasks that need another attempt.

## Stopping and evidence

Define coverage, completion, and resource limits before dispatch.
Empty search rounds do not prove that every relevant item has been found.
Record which sources were searched and which remain unavailable.

Use reproductions, source inspection, or calibrated measurements to resolve conflicting claims.
An independent review can expose a mistake; agreement alone cannot prove that the artifact works.
When comparing candidates, use a validated measurement and record selection criteria before seeing the outputs.

## Worked composition: audit an SDK and fix confirmed defects

1. Assign independent source areas to reviewers and run suitable static checks.
   Give each task an explicit source boundary and output location.
2. Check reported defects against the code and reproduce consequential failures.
   Record rejected findings with the evidence that rejected them.
3. Assign confirmed fixes to disjoint files or isolated worktrees.
   Each fix includes the check that distinguishes the broken and corrected behavior.
4. Integrate completed fixes under one owner and resolve shared-file conflicts.
5. Run the combined checks, complete authorized delivery, and report confirmed findings and resulting changes.

A fix can begin when its own finding is confirmed.
Final integration requires all changes selected for that delivery.
The result is one checked artifact, not a collection of worker summaries.

## Resume

Record task identifiers, owners, dependencies, artifact paths, checks, failures, and costs in the existing run state.
After resuming, inspect live workers and saved artifacts before starting replacement tasks.
Report unfinished work explicitly when a resource limit, cancellation, or unavailable requirement prevents completion.
