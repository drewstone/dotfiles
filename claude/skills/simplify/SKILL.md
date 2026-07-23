---
name: simplify
description: Reduce duplication and complexity while preserving behavior, public APIs, tests, and capability.
---

# Simplify

Use this to turn vague cleanup pressure into one or more shipped, verified simplifications.
The goal is less code, fewer paths, clearer ownership, and better developer experience without removing capability.

## Start

1. Orient to the repo and branch: `git status`, recent commits, PR state if present, and local project instructions.
2. Reconcile what already exists before creating anything new: search for prior modules, branches, docs, helpers, and skills.
3. Measure the current shape: branch diff, largest files, duplicate concepts, repeated parser/provider/config lists, weak types, dead comments, and test coverage around the target area.
4. State the exact simplification candidates with file counts, line counts, and risk.

## Choose

Pick the smallest change batch that meaningfully reduces complexity.
Prefer candidates that:

- Collapse duplicated intent into one canonical helper or module.
- Move focused behavior out of god files without changing public routes or SDK shape.
- Delete obsolete code and tests together.
- Improve local validation or error messages.
- Have targeted tests already available.

Do not pick candidates that require broad product redesign, public API churn, data migration, or unrelated formatting unless the user asked for that scope.

## Ship

1. Present a four-line plan before edits: problem, change, why long-term right, cost.
2. Edit only the chosen files.
3. Keep names boring and domain-specific; avoid `new`, `unified`, `manager`, or `helper` unless that is already the local pattern.
4. Extract only shared intent, not coincidental shape.
5. Preserve behavior unless the simplification explicitly fixes a bug; add or update tests for that changed behavior.
6. Run targeted checks first, then the repo's required local check.
7. If the branch has a PR, prove mergeability, push, and read current comments/reviews/checks before reporting.

## Stop Rules

Stop when the next cleanup would be a separate architecture PR, would enlarge the current review more than it reduces risk, or cannot be proven by tests available in this branch.
Saying "do not simplify further in this PR" is correct when backed by measurements and a concrete follow-up boundary.

Use `references/full-reference.md` for the full repeatable loop, measurement commands, candidate scoring, PR checklist, and report template.

## Then consider

- `deep-clean` when the measurements show broad static-analysis debt beyond the active branch.
- `polish` when the feature works but needs a fixed-rubric quality pass.
- `harden` when the simplification touches auth, credentials, billing, sandbox lifecycle, networking, or external execution.
- `converge` if checks are red after the simplification.
