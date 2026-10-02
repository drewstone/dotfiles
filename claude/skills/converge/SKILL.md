---
name: converge
description: Repair in-scope CI defects and enforced blocking checks; complete full CI recovery when requested.
---

# Converge

Repair the in-scope defect or enforced check blocking delivery.
Full CI recovery belongs here only when explicitly requested.
Apply user-authorized CI waivers immediately; preserve hooks and enforced protections.

## Diagnose and repair

1. Read the branch, target base, required checks, current run revisions, failing job logs, and relevant review comments.
2. Find the first causal failure in each job and group failures that share a cause.
   Compare with the base when needed to distinguish a regression from an existing failure.
3. Reproduce the failure through the affected path when practical, then fix the cause.
   For dependency findings, verify the advisory, affected dependency path, and compatible fixed release.
4. Run the affected local checks and the repository's required preflight before committing and pushing.
5. Reuse valid results and check the pushed revision against the required completion condition.
   Stop when the affected defect is fixed and enforced checks pass; continue authorized delivery.
   Track unrelated failures separately rather than expanding this repair into full CI recovery.

Preserve the checks' intended coverage.
Never bypass hooks, suppress failures, or weaken thresholds to obtain a passing result.
Diagnose flaky tests; quarantine only when repository policy permits it and replacement coverage preserves the affected requirement.
Recheck mergeability against the current base before reporting readiness.
Report which revision passed, the checks and run URLs, fixes, and any unverified coverage.

## Resume

For work spanning turns, update the existing progress record or `.agent/converge-progress.md`.
Keep the branch, base, last pushed revision, run IDs, completed fixes, remaining causes, and next check.
On resume, compare that record with git and live CI before acting.
A green historical run or a recorded completion does not establish that the current revision passes.

## Log the run

```bash
skill-run-log /converge --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| CI passes but review still blocks an authorized merge | `/review-to-green` | the PR and unresolved review findings |
| Failure causes remain unclear across subsystems | `/diagnose` | logs, reproductions, and the comparison with the base |
| The verified change still needs an authorized release | `/ship` | the revision, target, and release path |
