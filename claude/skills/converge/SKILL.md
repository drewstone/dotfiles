---
name: converge
description: Drive a PR to mergeable: repair failing enforced checks and the defect classes behind them, resolve review findings and merge or rebase conflicts; full CI recovery on request.
---

# Converge

Excellent convergence leaves the PR mergeable with every enforced check green on its head revision, each review finding answered with a fix or evidence, and each repaired defect fixed across its class so the next PR never meets it.
Follow the [shared delivery process](../../../docs/processes/agent-work.md#deliver-through-github), infer the PR from the branch when none is named, and repair real defects without waiting on optional CI.
Full CI recovery happens only on request; a red unrelated to this PR goes to its author with the failing tests ([AGENTS.md](../../AGENTS.md) rule 12).

## Read the current state

Read the branch, base, PR revision, required checks, current run revisions, failing job logs, reviews and threads with the repository's required API identity.
A newer blocking review outranks an earlier approval, and a green historical run proves nothing about the current revision.

## Repair failing checks

1. Find each job's first causal failure, group failures that share a cause, and compare with the base to separate a regression from an existing failure.
2. Reproduce through the affected path, then fix the cause in the code that owns it across every caller it reaches ([AGENTS.md](../../AGENTS.md) rule 1); for a dependency finding, verify the advisory, the affected path and a compatible fixed release.
3. Keep each check's coverage: never bypass hooks, suppress failures or weaken thresholds, and quarantine a flaky test only when policy permits and replacement coverage keeps the requirement.

## Resolve merge conflicts

Derived from mattpocock/skills resolving-merge-conflicts (MIT).

For each conflict, read the commits, PRs and issues that explain why each side changed; keep both intents where compatible, else the one matching the merge's goal with the tradeoff recorded.
Add no new behavior while resolving, finish rather than abort, then run typecheck, tests and formatter, fix what the merge broke, and commit or continue the rebase.

## Resolve review findings

1. Check each finding against current code, contract and evidence: confirmed defect, already fixed, unsupported, or open question.
2. Fix confirmed defects across their class and prove each at the affected boundary; a regression test must catch the original defect on the pre-fix revision or an isolated mutation.
3. Answer incorrect or resolved findings with evidence, using the communication authority the PR already grants.

## Push and recheck

Run the affected checks and the required preflight before pushing.
Resolve the blockers the pushed revision's newest findings and checks show, and rerun the affected checks when the base moves; never repeat an unchanged push or review request.
Stop when the confirmed defects are fixed, enforced checks pass and current review evidence supports approval, then continue authorized delivery; report the passing revision, run URLs, fixes and unverified coverage.
Across turns, keep the last pushed revision, run IDs, fixes, remaining causes and next check in `.agent/converge-progress.md` or the existing record, and compare it with git and live CI on resume.

## Log the run

```bash
skill-run-log /converge --target "<what this run targeted>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --pr <PR URL> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The PR is green but its change only matches what already existed, with no gain over the baseline or the best known result | `/be-ambitious` | the number to beat and the check that would show a gain |
| A failure's cause is unclear after the first reproduction | `/diagnose` | the failing job, logs and reproduction |
