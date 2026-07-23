---
name: polish
description: Apply a fixed quality rubric and fix gaps in behavior, design, tests, and public APIs.
---

# Polish

Use this for completed work that needs a quality pass.
Do not use it for metric optimization, red CI, or half-built generations.

## Rubric

Score honestly across:

1. Correctness: works in edge cases, not only the happy path.
2. Design: simple structure, justified abstractions, no avoidable complexity.
3. Robustness: errors fail loud and recoverably.
4. Tests: behavior coverage that would catch regressions.
5. Interface: clean names, defaults, docs, CLI/API, and reader path.

## Flow

1. Audit the current artifact against the rubric.
2. List concrete issues by severity.
3. Fix issues in priority order.
4. Run meaningful checks.
5. Re-score and repeat, up to five rounds.

## Rules

- No score inflation; fine is a 6, not an 8.
- No fluff comments or cosmetic-only changes.
- Broken tests stop the pass until fixed.

Use `references/RUBRIC.md` for scoring anchors and `references/full-reference.md` for the old full loop.

## Then consider

- `evolve` for measurable optimization.
- `converge` if checks are red.
