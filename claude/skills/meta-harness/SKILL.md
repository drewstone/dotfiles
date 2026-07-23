---
name: meta-harness
description: Evolve a plateaued improvement system by changing architecture and comparing implementations.
---

# Meta-Harness

Use this when a measurable improvement loop has plateaued and the likely fix is architectural, not parameter tuning.
It is automated `/pursue`: multiple isolated proposers change code, then the repo's real checks select winners.

## Start

1. Read `.evolve/meta-harness/` if it exists: config, frontier, variants, and latest run notes.
2. Discover the current evaluator, benchmark, or product check; create the smallest missing check before proposing code.
3. Prove the metric connects to user value and can move.
4. Seed a baseline from at least three runs when the check is noisy.

## Loop

1. Launch independent proposers with pinned briefs and separate workspaces.
2. Require structural mechanism changes; reject pure parameter tweaks.
3. Run the same smoke, benchmark, and repo checks for every variant.
4. Keep only variants that beat baseline and pass the checks.
5. Record lineage, hypothesis, result, and rejected ideas under `.evolve/meta-harness/`.
6. Merge only after the winning mechanism is clear and reproducible.

## Rules

- Read raw traces or run artifacts before proposing changes.
- Equalize compute across compared variants.
- Prefer small source patches with clear causal mechanisms.
- Compact merged variants to metadata; keep unmerged frontier source only when it teaches something.

Use `references/full-reference.md` for the full setup, state files, and integration details.

## Then consider

- `evolve` when the architecture is stable and the next step is metric tuning.
- `breakout` when even automated architecture evolution plateaus near a ceiling — the target is the cap, not the code. Question and raise it.
- `autopsy` when a run result is surprising or suspicious.
