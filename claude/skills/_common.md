# Skill authoring

Read this when creating or changing a skill in this repository.
It is author guidance, not an automatically loaded skill.
Shared session behavior belongs in [AGENTS.md](../AGENTS.md).

## Structure

Keep the purpose, applicability, essential constraints, decision points, and completion criteria in `SKILL.md`.
State each requirement once.
Delete repeated policy, unsupported quotas, and instructions that do not affect a useful decision.
Keep a short procedure together when every invocation needs it.

Move substantial detail used by only some tasks into a named reference.
At the decision point, link that file and state when to read it and what it provides.
Keep the constraint that selects the branch visible in the main file.
A reference expands that branch; it does not introduce a competing procedure or widen the task.
Read and update callers before deleting or moving a reference.

Descriptions identify the capability and the user request it serves.
Keep them concise and distinguish nearby skills without copying a catalog of peers.
Preserve existing invocation settings unless the user requests a change.

## Current sources

Skills own durable decisions; the project that implements a capability owns its commands, APIs, models, and deployment facts.
Link the maintained source or identify the relevant project file at the point it is needed.
Read the relevant current exports, command help, or official documentation before relying on a changing fact.
For new work, use the current supported path.
For an existing project, check the path it actually runs before applying an upstream change.
Reuse that check within the task unless the dependency, source, or claim changes.
Keep revisions in experiment evidence when needed to reproduce a result; avoid routine version inventories in skill instructions.

## Task boundaries

Use the user's existing scope and authorization.
Choose parallel work from dependencies, risk, and available resources rather than a fixed number of workers.
Keep meaningful security and data-integrity constraints explicit.
A concrete failure needs a concrete check; an anecdote does not establish a universal threshold.

Complete the current skill before following a peer skill.
Put peer recommendations in one final `## Then consider` section after the run log, with conditions based on the completed work.
A guard whose purpose is to validate a prerequisite may run before the guarded action.
Use `skills` to discover installed capabilities; do not maintain another full inventory.

## State and evidence

Use the project's existing records when resuming work.
Read the current task, recent results, and unresolved decisions relevant to that work.
Do not create a research-state directory for an unrelated small task.

When a skill needs new durable records and no project convention exists, use `.agent/`.
Use [the experiment schema](evolve/schema.md) when writing experiment rows consumed by these skills.
Keep decisions in append-only logs and link raw evidence instead of copying it.
Preserve interrupted work before context replacement and continue the authorized task.

Existing `.evolve/` records remain valid.
Migration is optional: check tracked files, compare collisions, and verify every source record survives before removing originals.
`git mv .evolve .agent` nests the source when the destination exists; it does not reject that collision.

## Run log

Each skill includes `## Log the run` with its invocation of [skill-run-log](../tools/skill-run-log).
The helper uses `.agent/skill-runs.jsonl`, or the existing `.evolve/` directory when `.agent/` is absent.

```bash
skill-run-log /simplify --target "<scope>" --verdict <result> --next /stop
```

The helper owns serialization, record fields, and the available command arguments.
Leave unavailable measurements unknown.
A missing log is missing evidence, not proof that a skill was unused.
Usage counts and document length do not establish task quality.

## Check the change

1. Check descriptions, local references, and any executable examples affected by the edit.
2. Run `node --test tests/skills.test.mjs` from the repository root.
3. For substantial behavior changes, use realistic independent tasks in isolated workspaces and inspect the results.
4. Check that required behavior survived and unnecessary work was removed before using size reduction as supporting evidence.
5. Commit, review, and install from the maintained source while preserving unrelated local settings and skills.
