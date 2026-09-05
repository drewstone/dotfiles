---
name: simplify
description: Remove unnecessary work and reduce complexity while preserving required behavior and public contracts.
---

# Simplify

Remove unnecessary work, then simplify what must remain.
Preserve required behavior and public contracts unless their removal is within the user's scope.
A checked no-change result is a successful outcome.

## Start

1. Orient to the repo and branch: `git status`, recent commits, PR state if present, and local project instructions.
2. Reconcile what already exists before creating anything new: search for prior modules, branches, docs, helpers, and skills.
3. Measure the current shape: branch diff, largest files, duplicate concepts, repeated parser/provider/config lists, weak types, dead comments, and test coverage around the target area.
4. State the exact simplification candidates with file counts, line counts, and risk.

## Choose

First identify the outcome the code or instructions must support.
Challenge each candidate's purpose, assumptions, consumers, and maintenance cost before choosing an edit.
Prefer deleting unnecessary behavior, then simplifying retained behavior, then optimizing it, then automating it.
Pick the smallest justified change batch; leave already-good work unchanged.
Prefer candidates that:

- Delete obsolete code and tests together.
- Remove unnecessary workflows or requirements after checking their consumers and the capability that must remain.
- Collapse duplicated intent into one canonical implementation.
- Reduce what callers must understand without adding indirection only to shorten a file.
- Improve local validation or error messages.
- Have targeted tests already available.

Do not pick candidates that require broad product redesign, public API churn, data migration, or unrelated formatting unless the user asked for that scope.

## Ship

1. Present a four-line plan before edits: problem, change, why long-term right, cost.
2. Edit only the chosen files.
3. Keep names boring and domain-specific; avoid `new`, `unified`, `manager`, or `helper` unless that is already the local pattern.
4. Extract only shared intent, not coincidental shape.
5. Verify the required behavior survives and each removal stays within scope; test any changed behavior that needs regression coverage.
6. Run targeted checks first, then the repo's required local check.
7. If the branch has a PR, prove mergeability, push, and read current comments/reviews/checks before reporting.

## Stop Rules

Stop when no candidate has evidence that justifies a change.
Also stop when the next cleanup needs separate architecture work, exceeds scope, or cannot be verified with available checks.
Saying "do not simplify further in this PR" is correct when backed by measurements and a concrete follow-up boundary.

Use `references/full-reference.md` for the full repeatable loop, measurement commands, candidate scoring, PR checklist, and report template.

## Log the run

On completion, append one line so later analysis can grade this skill:

```bash
skill-run-log /simplify --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| ≥10 dead exports, cycles, or duplicate modules exist beyond the active branch | `/deep-clean` | the repo-wide measurement + the baseline JSON path |
| Behavior works and only fixed-rubric gaps remain | `/polish` | the rubric + the gaps it flags |
| The change touches auth, credentials, billing, sandbox lifecycle, networking, or external execution | `/harden` | the changed file:line list + the invariant each path relies on |
| Checks go red after the simplification | `/converge` | the failing job + the behavior that must be preserved |
| 0 tests cover the simplified path | `/verify` | the changed path + the tests that would prove behavior preservation |
