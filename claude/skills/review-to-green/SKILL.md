---
name: review-to-green
description: Drive a pull request to approval by fixing findings, proving fixes, and rechecking reviews.
---

# Review-to-green

Resolve a pull request's review findings and check the current review state after each relevant change.
Infer the PR from the branch when the request does not supply its number or URL.

## Review and repair

1. Read current formal reviews, inline threads, summary comments, PR revision, base, and required checks.
   Use the repository's required API identity.
   An earlier approval does not override a newer blocking review.
2. Check each finding against the current code, contract, and evidence.
   Separate confirmed defects, already-fixed findings, unsupported claims, and questions needing further investigation.
3. Fix confirmed defects within scope and prove each correction at the affected boundary.
   For a regression test, show it detects the original defect, using the pre-fix revision or an isolated mutation when needed.
   Preserve unrelated edits while doing this check.
4. Prepare evidence for findings that are incorrect or already resolved.
   Post replies or request review using communication authority already granted for the PR.
5. Run the repository's required local validation and affected tests before pushing.
   Diagnose environment failures instead of dismissing them or weakening the checks.
6. Confirm checks and any configured review automation ran for the pushed revision.
   Wait for their results, then read the newest findings before claiming review is complete.

Keep required fixes moving while other review results are pending.
If the base changes, resolve mergeability and rerun the affected checks.
Do not repeat an unchanged push or review request without new evidence.

## Completion

Report approval only when current review evidence supports it and required blockers are resolved.
A refuted finding may leave a formal review or branch-protection requirement pending; report that distinction.
When progress needs new authority, access, or a decision outside scope, identify the concrete remaining action and evidence.

Use merge and release authority already granted for the target.
Once the PR satisfies its requirements, complete an authorized merge; otherwise present the reviewable result for the remaining approval.

## Log the run

```bash
skill-run-log /review-to-green --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The approved change still needs an authorized release | `/ship` | the revision, target, and release path |
| A review finding requires an authorized architectural change | `/pursue` | the contract and reproduced failure |
| A pushed fix has failing CI | `/converge` | the revision and failed checks |
| Findings suggest a shared defect beyond the reviewed diff | `/critical-audit` | the affected subsystem and evidence |
