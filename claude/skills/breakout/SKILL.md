---
name: breakout
description: Find the constraint behind a plateau and design a step-change approach.
---

# Breakout

Every other skill optimizes *toward* a target. This one operates *on the target*. Use it when the honest next move isn't a better point under the ceiling — it's a higher ceiling.

`/evolve` tunes parameters. `/pursue` redesigns the architecture to hit a given target. `/breakout` questions the target and changes the **regime** so a different, higher target becomes reachable. It does not build the new system — it sets the raised target and dispatches `/pursue` or `/meta-harness` to build it.

Shared conventions in `_common.md`.

## When to use

| Signal | Skill |
|---|---|
| "Make this metric go up" | `/evolve` |
| "This architecture is wrong" | `/pursue` |
| "We're near the target and it feels small" | **`/breakout`** |
| "3 pursue/meta-harness cycles, <2% each" | **`/breakout`** — the ceiling is the target, not the code |
| "Why can't this be 10x?" | **`/breakout`** |

Do **not** use it to dodge honest hill-climbing. If the metric is still moving on real changes, keep `/evolve`-ing. Breakout is for when the ceiling is real, not when the climb is merely hard.

## Procedure

1. **Name the binding constraint — as a mechanism, not a number.** Not "we're at 0.87." *"We cap at ~0.87 because retrieval re-embeds per request instead of amortizing, so recall is bounded by latency budget."* If you can't name the mechanism, you're not ready to break out — go measure (`/evolve`, the ground-truth harness).
2. **Separate the physics floor from the assumed floor.** Physics floor = irreducible (security, information theory, speed of light, a real SLA). Assumed floor = how it's always been done, the metric we happened to pick, a constraint no one has retested. **Attack only the assumed floor.** Naming which is which is the core analytical work.
3. **Design the regime change.** The lever is usually *not* the artifact. Change the **metric** (the current one may be the cage), the **problem** (eliminate the work instead of speeding it), the **constraint** (retest the "can't"), or the **substrate** (different foundation). One regime change, stated as a thesis with a falsifiable payoff.
4. **Set the raised target + the smallest proof the regime is reachable.** A number that would be *absurd* under the current regime and *natural* under the new one, plus the cheapest experiment that shows the new regime is real (not that it's finished).
5. **Commit through the valley.** A regime change usually regresses the old metric before it clears it. Authorize that explicitly, pair with `/dont-collapse-the-architecture` so early marginal evidence doesn't kill the bet, and set the bootstrap-CI gate (`_common.md`) for when the bet is finally judged.
6. **Externalize the bet, then dispatch.** Write the thesis, raised target, valley budget, and kill-condition to `.evolve/pursuits/<date>-breakout-<slug>.md`. Hand the build to `/pursue` (single track) or `/multi-pursue` (independent tracks); `/evolve` tunes once inside the new regime.

## Rules

- **Optimize the ceiling, not the point under it.** A 3% win that caps you forever loses to a regime change that unlocks 10x.
- **If the metric can't 10x, the metric is the cage — change the metric.** Then re-baseline honestly against the new one.
- **Attack the assumed floor; respect the physics floor.** Confusing the two is how breakout becomes either cowardice or fantasy.
- **A raised target with no named mechanism is a wish.** Every breakout thesis names the constraint it dissolves.
- **Endurance is a state property, not a willpower property.** Externalize the bet so completely that a fresh agent resumes with zero loss — then round-count stops mattering and the only stop conditions are *the bet resolved* or *a real wall*. (This is why the deterministic loop matters: you can only refuse to stop when stopping is free.)
- **The valley is the price of the peak.** Don't judge a regime change on week-one numbers; judge it at the gate you set in step 5.

Use `references/full-reference.md` for regime-change patterns, the ceiling-analysis worksheet, and the floor-separation examples.

## Then consider

- `pursue` / `multi-pursue` — build the regime you just defined.
- `dont-collapse-the-architecture` — the moment the first measurement comes back marginal.
- `evolve` — tune once the new regime is standing and the metric moves again.
- `autopsy` — if the breakout thesis dies, root-cause whether the regime was wrong or the proof was.
