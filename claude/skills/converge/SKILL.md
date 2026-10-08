---
name: converge
description: Drive a PR to mergeable: repair in-scope CI defects and enforced checks, resolve review findings and merge or rebase conflicts; full CI recovery on request.
---

# Converge

Repair what blocks a pull request's delivery: failing enforced checks and confirmed review findings.
Full CI recovery belongs here only when explicitly requested.
Use the [shared delivery process](../../../docs/processes/agent-work.md#deliver-through-github); repair actual defects without waiting for optional CI.
Infer the PR from the branch when the request does not supply its number or URL.

## Read the current state

Read the branch, target base, PR revision, required checks, current run revisions, failing job logs, formal reviews, inline threads, and summary comments.
Use the repository's required API identity.
An earlier approval does not override a newer blocking review, and a green historical run does not establish that the current revision passes.

## Repair failing checks

1. Find the first causal failure in each job and group failures that share a cause.
   Compare with the base when needed to distinguish a regression from an existing failure.
2. Reproduce the failure through the affected path when practical, then fix the cause.
   For dependency findings, verify the advisory, affected dependency path, and compatible fixed release.
3. Track unrelated failures separately rather than expanding this repair into full CI recovery.

Preserve the checks' intended coverage.
Never bypass hooks, suppress failures, or weaken thresholds to obtain a passing result.
Diagnose flaky tests; quarantine only when repository policy permits it and replacement coverage preserves the affected requirement.

## Resolve merge conflicts

Derived from mattpocock/skills resolving-merge-conflicts (MIT).

Read the merge or rebase state and, for each conflict, the commits, PRs, and issues that explain why each side changed.
Keep both intents where they are compatible; where they are not, keep the one matching the merge's goal and record the tradeoff.
Add no new behavior while resolving, and finish the operation rather than aborting it.
Run the project's typecheck, tests, and formatter, fix what the merge broke, then commit or continue the rebase.

## Resolve review findings

1. Check each finding against the current code, contract, and evidence.
   Separate confirmed defects, already-fixed findings, unsupported claims, and questions needing further investigation.
2. Fix confirmed defects within scope and prove each correction at the affected boundary.
   For a regression test, show it detects the original defect, using the pre-fix revision or an isolated mutation when needed.
   Preserve unrelated edits while doing this check.
3. Prepare evidence for findings that are incorrect or already resolved.
   Post replies or request review using communication authority already granted for the PR.

## Push and recheck

Run the affected local checks and the repository's required preflight before committing and pushing.
Diagnose environment failures instead of dismissing them or weakening the checks.
Read the newest available findings and check results for the pushed revision, and resolve actual blockers.
If the base changes, resolve mergeability and rerun the affected checks.
Do not repeat an unchanged push or review request without new evidence.

Stop when the in-scope defects are fixed, enforced checks pass, and current review evidence supports approval; continue authorized delivery.
A refuted finding may leave a formal review or branch-protection requirement pending; report that distinction.
When progress needs new authority, access, or a decision outside scope, identify the concrete remaining action and evidence.
Report which revision passed, the checks and run URLs, fixes, and any unverified coverage.

## Resume

For work spanning turns, update the existing progress record or `.agent/converge-progress.md`.
Keep the branch, base, last pushed revision, run IDs, completed fixes, remaining causes, and next check.
On resume, compare that record with git and live CI before acting.
A recorded completion does not establish that the current revision passes.

## Log the run

```bash
skill-run-log /converge --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```
