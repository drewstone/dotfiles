# Durable unattended runs

Read this before giving an existing runner control of an experiment sequence.
Use the project's execution and recovery tools; do not create another control framework when they already meet the need.

## Prove the execution contract

Run a small complete candidate through preparation, execution, evidence capture, decision, persistence, and recovery before a broad run.
Include a controlled failure when failure handling is not already verified.
Confirm that the runner:

- identifies the baseline, candidate, inputs, commands, and active assignment;
- enforces the authorized cost, execution, and stopping limits;
- captures command exits, failed attempts, malformed measurements, and cancellation;
- validates metric types, units, direction, coverage, and required evidence before comparison;
- applies the recorded decision rule rather than a second, weaker retention rule;
- records the result durably before changing the accepted baseline;
- resumes without repeating completed work or losing open candidates.

## Isolate changes and preserve evidence

Use a dedicated workspace or the project's equivalent for each candidate.
Keep experiment records outside the files that candidate rollback replaces.
Verify ownership before any restore or cleanup; never discard another writer's work.
Use commits or artifact identities to reproduce accepted and rejected variants.
A rollback must leave the observation that caused it intact.

Keep one owner for promotion and baseline updates.
Parallel candidates may share read-only baseline evidence; they must not race to replace it.
Re-evaluate a combined candidate because separately successful changes can interact.

## Continue and settle

Persist the active objective, current candidate, completed work, remaining limits, and next eligible action before process or context replacement.
A polling timeout or quiet stream is not a terminal experiment result.
Inspect authoritative execution state before retrying or cancelling.

Continue while the objective is unmet, authorized resources remain, and a testable approach is available.
Settle at the requested result, explicit limit, cancellation, or an evidenced dead end.
Report the actual terminal state and unresolved evidence; never convert a lost process into success.
