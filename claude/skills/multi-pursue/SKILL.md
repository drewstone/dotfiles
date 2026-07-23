---
name: multi-pursue
description: Run independent architecture tracks in parallel, then verify and synthesize their results.
---

# Multi-Pursue

Use this when one initiative naturally decomposes into independent architectural tracks that can be built without waiting on each other.
Do not use it for chores, parameter tweaks, or one coherent design that should stay unified.

## Flow

1. Split the initiative into independent tracks with clear ownership boundaries.
2. Write a pinned brief for each track: goal, files, constraints, proof, and stop condition.
3. Run each track as a real build, not a research memo.
4. Verify each track with its own tests and with the integration assumptions it touches.
5. Synthesize conflicts, shared abstractions, and the merge order.
6. Land only tracks that work alone and fit together.

## Rules

- Shared files need an explicit merge plan before parallel edits.
- Each track must produce a concrete artifact and proof.
- The synthesis must choose, combine, or reject; do not dump parallel summaries.

Use `references/full-reference.md` for full dispatch format and synthesis template.

## Then consider

- `pursue` when the work is one coherent generation.
- `evolve` after landed tracks need metric tuning.
