---
name: pursue
description: Design and build a generational improvement when the current approach is wrong or plateaued. Audit, choose a coherent architecture, implement, test, and hand off.
---

# Pursue

Use this for architectural leaps, not parameter tuning.
The output is a working generation with tests, not a proposal.

## Start

1. Read repo state, existing `.evolve/` progress, prior pursuits, and current failures.
2. State why incremental improvement is insufficient.
3. Define the generation: what changes together, what stays stable, and what success means.
4. Identify the smallest proof that the new architecture works.

## Build

1. Audit the current system and constraints.
2. Design as a tournament, not a single guess: put ≥2 competing architectures in contention (pull the ranked field from `/hypothesize` when one exists), argue them against each other, pick the winner by predicted leverage, and graft the best ideas from the runners-up. Then commit to one coherent change set; avoid unrelated cleanup.
3. Implement all required pieces as a unit.
4. Run the repo's relevant tests, type checks, builds, and product checks.
5. Compare against the old approach where possible.
6. Persist the pursuit brief, decisions, checks, and next handoff.

## Rules

- Do not collapse ambition just because the first measurement is marginal.
- Do not ship partial scaffolding that pretends the generation is complete.
- Prefer deleting obsolete paths over adding compatibility layers in greenfield/internal code.
- Hand off to metric tuning only after the generation works.

Use `references/full-reference.md` for the full pursuit template and verification details.

## Then consider

- `hypothesize` before designing, when the architecture field is wide open — get a researched, ranked set of candidate designs to run the tournament on.
- `evolve` to tune a working generation.
- `breakout` when the generation lands but the ceiling still feels small — the honest next move is a higher target, not a better point under this one.
- `polish` when the generation works but quality gaps remain.
- `autopsy` if the generation result is null or suspicious.
