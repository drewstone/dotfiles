# PRs and issues

Write for a reviewer who has not read the conversation.
What changes for the user, what evidence supports it, and what remains unresolved?
Keep only material needed to assess that decision; use the repository template where required.

## Pull requests

Lead with the concrete problem and resulting behavior; a small before/after example often suffices.
Explain consequential design choices, migrations, compatibility, and rollback where relevant.
Keep the title and description aligned with the final diff.
Name what disappeared when consolidating code, tests, or tooling.
Link the owning issue instead of repeating its history.

Include proof with the checked revision and environment, observed result, and material limits.
Label proof as inspection, real E2E, integration, golden, unit, or mocked; identify skipped or unrun coverage explicitly.
A green check without execution evidence cannot establish a user outcome.

| Change | Useful evidence |
| --- | --- |
| UI | [UI evidence](../anti-patterns/ui-evidence.md): matching images, video for changed interactions, and an openable demo or artifact. |
| Performance | [Comparable before/after timings](../anti-patterns/speed.md), sample counts, workload, environment, and uncertainty. No timing means no speedup claim. |
| Tests or cleanup | Removed checks and their exclusive fixtures/tooling, surviving proof, measured verification cost if available, and why retained unit tests earn their cost under the [test-value policy](../../claude/skills/deep-clean/SKILL.md#retire-low-value-tests). |
| API, data, or reliability | Real boundary or golden evidence, including the affected failure/recovery case and persisted result when relevant. |

Use a short checklist for remaining acceptance, migration, or release work.
Check an item only when linked evidence establishes its result; an implementation commit does not complete deployment.
Keep raw logs and traces out of the body; link reviewed, accessible artifacts with credentials and private content removed.

## Issues

State observed behavior versus the required outcome, who is affected, and the reproduction or source evidence.
Separate facts from suspected causes; an investigation may start with an explicit evidence gap.
Use checkboxes for independently verifiable completion criteria, with owners or dependencies where needed.
Link existing work and update the current finding rather than appending contradictory status reports.
Close against acceptance evidence; preserve uncompleted work in the owning checklist.

## Replace weak patterns

| Weak pattern | Better |
| --- | --- |
| “Improve performance”; a LOC count presented as speed | The measured user path, before/after values, and what was not measured. |
| “All tests pass”; unit doubles described as E2E | The boundary exercised, test type, result, and omissions. |
| “Polished UI”; screenshots of only the happy state | Inspectable media of the affected workflow and relevant states. |
| Session diary, exhaustive file list, or repeated checklist | Final behavior, consequential choices, proof, and the remaining decision. |
