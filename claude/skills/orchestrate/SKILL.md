---
name: orchestrate
description: Decompose and run a multi-agent workflow when no single skill covers the goal.
---

# Orchestrate

Complete a goal through bounded tasks with explicit dependencies, checked results, and one integrated outcome.
Use this when the user requests orchestration or delegation and one skill cannot cover the work.
If one skill covers the goal, use it directly.

Shared conventions are in `_common.md`.

## Resolve execution tools

Inspect the delegation tools available in this session before choosing an execution method.
Use native agent creation, messaging, waiting, and interruption tools when they provide the required behavior.
For example, a session may expose `spawn_agent`, `send_message`, `followup_task`, and `wait_agent`.
Read their current contracts, including concurrency limits and whether agents share files.

If the project already has a workflow runtime, inspect its installed exports, examples, and isolation behavior before using it.
Prove a small task can complete and return its result before launching the full workflow.
A tool named `Workflow` and functions named `agent()`, `parallel()`, or `phase()` are not universal session capabilities.
Do not add an execution framework for an ordinary delegated task.
If delegation is unavailable, execute the work locally and report that limitation.

## Procedure

1. **Decompose the goal.** Define each task's input, output, evidence, dependencies, and files it may change.
   Start an independent task only when useful work can continue alongside it.
2. **State the plan.** Record the expected agent count, resource limits, and how the results will be combined.
   Use the authority already granted for this session.
3. **Assign ownership.** Give parallel writers disjoint files or separate worktrees when their edits would conflict.
   Reserve shared registries and final integration for one owner.
4. **Dispatch through available tools.** Give each worker its bounded task and the relevant installed skill instructions.
   Start a dependent task when its required inputs pass their checks.
   Wait for every result only when the next operation needs the complete set.
5. **Inspect every outcome.** Record failures, missing evidence, costs, and unfinished tasks.
   Retry only when new evidence or a corrected input makes completion plausible.
   Confirm tool cancellation behavior before assuming other tasks continue after one fails.
6. **Check consequential findings.** Reproduce them against the actual artifact or request an independent review when risk justifies it.
   Resolve disagreements with evidence; a majority vote does not establish correctness.
7. **Integrate and verify.** Combine compatible results, resolve conflicts, and run the checks required for the resulting artifact.
   Finish authorized delivery and report the complete outcome, including any remaining evidence gaps.

## Durable state

For work that needs to resume, update `.agent/pursuits/<date>-orchestrate-<slug>.md` with task ownership and dependencies.
Record agent identifiers, artifact paths, completed checks, failures, remaining work, and resources spent.
Use existing project state when it already records those facts.

Use `references/full-reference.md` for dependency choices, stopping conditions, and a worked composition.

## Log the run

```bash
skill-run-log /orchestrate --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A completed run returns null or contradictory results | `/autopsy` | the raw stage outputs and first disagreement |
| Integration exposes a CI failure | `/converge` | the integrated revision and failing job |
| Completed stages provide enough evidence to improve future coordination | `/reflect` | the task ledger, outcomes, costs, and corrections |
