---
name: simplify
description: Delete unnecessary code and tests; simplify retained behavior, dependencies, and verification.
---

# Simplify

Delete unnecessary work before improving what remains.
Preserve required behavior and public contracts unless their retirement is authorized.

## Decide what is necessary

1. Establish the user outcome, scope, Git state, and repository instructions.
2. Find existing library capabilities and active work before designing another implementation.
3. Challenge whole abstractions, compatibility paths, tests, scripts, and gates before polishing their internals.
4. Check real consumers, including exports, configuration, generated entrypoints, and dynamic references.
5. Delete unnecessary behavior; simplify, optimize, then automate what survives.

Count live consumers and persisted records before retaining compatibility.
With none, delete the obsolete path and its redundant checks.
With consumers, use the existing migration path, prove their cutover, then delete compatibility when the remaining count reaches zero.
Keep historical evidence distinct from executable compatibility; preserving records does not require maintaining two implementations.

Prefer maintained library implementations and direct calls over wrappers that add no policy.
Unify callers with the same semantics; retain meaningful domain differences.
Measure removed concepts, maintenance, and execution cost separately from line counts.

## Simplify verification too

Apply [test retirement](../deep-clean/SKILL.md#retire-low-value-tests) whenever tests or verification constrain a simplification.
Prioritize real E2E, boundary integration, then golden data; unit tests must earn retention.
An assertion about the old implementation is a candidate for deletion, not a reason to restore that implementation.

## Deliver

State the nontrivial change, reason, risk, and rollback before editing.
Preserve unrelated work and historical evidence.
Run the smallest sufficient real proof and required repository checks; reuse results whose inputs remain valid.
Finish the authorized consumer migration, deletion, release, and served proof.
Report what disappeared, the surviving behavior, measured effects, and missing evidence.
A no-change result needs concrete candidate findings; stop when none justifies further work within scope.

## Log the run

```bash
skill-run-log /simplify --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```
