---
name: deep-clean
description: Remove dead code, cycles, weak types, duplication, obsolete paths, and needless complexity.
---

# Deep Clean

Remove unnecessary code and simplify retained code while preserving the behavior the user still needs.
A checked no-change result is valid.

## Find justified changes

1. Establish the requested scope, public contracts, existing work, and repository checks.
2. Inspect dead-code candidates, import cycles, duplicate implementations, weak types, error handling, and obsolete configuration.
   Use the repository's existing tools for relevant measurements; tool warnings are candidates for investigation.
3. Check consumers before deleting: source, tests, configuration, scripts, exports, generated entrypoints, string registries, and dynamic imports.
   A search with no matches does not prove that a published API has no external consumers.
4. Explain which required capability survives each removal and how to verify it.
   Preserve unclear code until its purpose and consumers are understood.
5. Choose changes that reduce concepts or maintenance work.
   Share an implementation when callers express the same requirement; matching syntax alone does not justify an abstraction.

## Implement and verify

Order changes by their actual dependencies.
For example, changing imports can invalidate earlier dead-code results, so rerun those checks after the import change.
Use small reviewable changes and the repository's formatter.
When a check fails, diagnose and fix the regression before building further changes on it.
Preserve unrelated work when restoring a failed edit.

Keep `unknown` plus validation at untrusted boundaries when that is the correct contract.
Trace internal values before strengthening their types.
Remove an error handler only after checking its recovery, cleanup, cancellation, and public error behavior.
Remove obsolete tests with obsolete behavior; preserve or replace coverage for retained behavior.
Published API removal needs a consumer check and the release policy required for that change.

Run checks appropriate to the surviving paths and the repository's required validation.
Reconcile deletions against the full diff and repeat relevant baseline measurements.
For work spanning turns, retain evidence in the repository's existing task state; use `.agent/deep-clean-baseline.json` when no baseline record exists.

Report what was removed or simplified, why it was safe, the checks and results, and what was kept deliberately.
Report lines, bytes, timing, and maintenance effects in their own units; file size alone does not establish a performance or cost improvement.

## Log the run

```bash
skill-run-log /deep-clean --target "<scope>: <N> files" --verdict <VERDICT> --next /<skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Changed security boundaries need additional attack coverage | `/harden` | the changed paths and preserved invariants |
| Required tests or builds remain red | `/converge` | the failing command and causal change |
| Retained duplication needs a separate simplification decision | `/simplify` | the competing implementations and callers |
