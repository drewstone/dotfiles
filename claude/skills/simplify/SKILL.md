---
name: simplify
description: Remove unnecessary work and reduce complexity while preserving required behavior and public contracts.
---

# Simplify

Remove unnecessary work, then simplify what must remain.
Preserve required behavior and public contracts unless their removal is within the user's scope.
A checked no-change result is a successful outcome.

## Decide what is necessary

1. Establish the outcome, scope, current git state, and repository instructions.
2. Search existing modules, configuration, documentation, and active changes before adding an alternative.
3. Challenge each candidate's purpose, assumptions, consumers, and maintenance cost.
4. Check callers and required behavior before removing a capability or requirement.
   Include exports, scripts, configuration, and dynamic references where applicable.
5. Prefer deleting unnecessary behavior, then simplifying retained behavior, then optimizing it, then automating it.

Measure the parts relevant to the decision using existing repository tools.
Counts of files, lines, duplicate code, or test results support a specific claim; they do not decide whether a feature should exist.
Share an implementation only when callers express the same intent.
Avoid indirection that merely moves complexity or forces readers to visit more files.

## Make the justified changes

For nontrivial edits, state the problem, change, reason, and risk before editing.
Keep changes within the requested scope and preserve unrelated work.
Verify retained behavior with the affected checks and the repository's required validation.
Test changed behavior when regression coverage is needed; documentation or mechanical edits may need inspection and link checks instead.

Stop when no remaining candidate has evidence that justifies changing it.
If a necessary change exceeds scope or cannot be verified, state the exact boundary and missing evidence.
Report the changes or deliberate no-change decision, supporting evidence, checks, and limitations.
Complete the repository's authorized commit and PR workflow when applicable.

## Log the run

```bash
skill-run-log /simplify --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The request includes broader dead-code or dependency cleanup | `/deep-clean` | the candidate paths and consumer evidence |
| Implemented behavior needs a quality review beyond the cleanup | `/polish` | the remaining requirements and evidence |
| Changed security behavior needs adversarial coverage | `/harden` | the affected boundary and invariant |
| Required checks fail after the change | `/converge` | the failing checks and behavior to preserve |
