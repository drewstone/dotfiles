---
name: deep-clean
description: Measured codebase cleanup: dead code, dependency cycles, weak types, duplicate logic, deprecated paths, test debt, and complexity, using real tools and before/after proof.
---

# Deep Clean

Use this for broad cleanup after big changes, migrations, or obvious codebase drift.
It is not a substitute for feature work or security validation.

## Measure First

Run the repo's relevant static tools before editing: dead-code scan, dependency graph, typecheck, duplicate scan, lint, tests, and build where available.
Record the exact command and baseline counts.

## Order

1. Structure: dependency cycles, canonical modules, import direction.
2. Strengthen: weak types, dead code, error paths, missing tests.
3. Polish: stale docs, deprecated paths, formatting, AI slop.
4. Measure again with the same commands.

Do not parallelize across those phases; each phase changes what the next phase sees.

## Rules

- Delete unused code when callers are gone.
- Migrate live callers before deleting old paths.
- Extract duplicate logic only when intent is shared, not merely shape.
- Keep public API changes explicit and version-aware.
- Stop and fix any test/build regression you introduce.

Use `references/full-reference.md` for tool commands, phase details, and reporting templates.

## Then consider

- `harden` for security-sensitive surfaces discovered during cleanup.
- `converge` if cleanup leaves CI red.
- `polish` for a narrower final quality pass.
