---
name: meta-harness
description: Evolve a plateaued improvement system by changing architecture and comparing implementations.
---

# Meta-Harness

Use this when a measurable improvement loop has plateaued and the likely fix is architectural, not parameter tuning.
It is automated `/pursue`: multiple isolated proposers change code, then the repo's real checks select winners.

## Start

1. Read `.agent/meta-harness/` if it exists: config, frontier, variants, and latest run notes.
2. Discover the current evaluator, benchmark, or product check; create the smallest missing check before proposing code.
3. Prove the metric connects to user value and can move.
4. Seed a baseline from at least three runs when the check is noisy.

## Loop

1. Launch independent proposers with pinned briefs and separate workspaces.
2. Require structural mechanism changes; reject pure parameter tweaks.
3. Run the same smoke, benchmark, and repo checks for every variant.
4. Keep only variants that beat baseline and pass the checks.
5. Record lineage, hypothesis, result, and rejected ideas under `.agent/meta-harness/`.
6. Merge only after the winning mechanism is clear and reproducible.

## Rules

- Read raw traces or run artifacts before proposing changes.
- Equalize compute across compared variants.
- Prefer small source patches with clear causal mechanisms.
- Compact merged variants to metadata; keep unmerged frontier source only when it teaches something.

Use `references/full-reference.md` for the full setup, state files, and integration details.

## Log the run

On completion, append one line so later analysis can grade this skill:

```bash
skill-run-log /meta-harness --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Architecture is stable and the metric still moves on tuning | `/evolve` | the winning architecture + its measured baseline |
| Best-of-generation gain stays inside 2× noise for ≥3 generations | `/breakout` | the plateau evidence + the target that is acting as the cage |
| A generation's result is surprising, null, or unusually clean | `/autopsy` | the raw generation rows + the scoring command |
| Search produced ≥2 viable architectures within noise of each other | `/arena-experiment` | the candidates + an equal-compute budget |
