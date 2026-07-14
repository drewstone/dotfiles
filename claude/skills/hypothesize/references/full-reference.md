---
name: hypothesize
description: "Full method for /hypothesize — the expected-value scoring model, evidence classes, information-value sequencing, and a worked portfolio example. Absorbs evolve's former structured-hypothesis mode."
---

# Hypothesize — Full Reference

The THINK phase that precedes `/evolve` and `/pursue`. It converts "what should we try?" from a single ad-hoc guess into a researched, ranked, sequenced portfolio of bets. The bootstrap-CI *promotion* gate (judging a winner at the end of an experiment) still lives in `evolve/references/STATS.md` — this skill is the front half (what to bet), that gate is the back half (did the bet pay).

## Why a portfolio beats one hypothesis

A greedy loop tries the most obvious idea, measures, keeps or reverts, repeats. It has three failure modes this phase fixes:

- **Re-derivation.** The obvious idea is often a known technique someone published years ago, with known limits. The research step buys that knowledge for the price of a search instead of a week.
- **Narrowness.** Trying variations of one idea explores a tiny neighborhood. A diverse field forces structurally different branches into contention.
- **Confidence bias.** Greedy always funds the safe, likely bet. Expected-value ranking lets a low-probability high-upside bet win a slot it deserves.

## The expected-value model

For each hypothesis, estimate three quantities and combine them:

```
EV ≈ P(true) × effect / cost
```

- **`P(true)`** — probability the mechanism actually produces the predicted effect. Anchored by evidence class (below), not by how much you like the idea.
- **`effect`** — predicted movement in the metric, in its real units and direction. A number, not "big."
- **`cost`** — compute + wall-time + risk to run the experiment cleanly. Include the cost of *reverting* if it regresses shared state.

Rank descending by EV. This is a decision aid, not an oracle — a tie or a close call is a signal to run the more *informative* one first (see sequencing).

## Evidence classes (they set `P(true)`)

| Class | What it means | `P(true)` anchor |
|---|---|---|
| **Prior-art-backed** | A named source (paper, competitor, another codebase) reports this mechanism moving this metric | high — start ~0.6+ and adjust for how close their setup is to yours |
| **First-principles** | A causal argument from the system's actual mechanics, no external confirmation | medium — ~0.3–0.5, discount for every unverified assumption in the chain |
| **Hunch** | A pattern-match with no articulated mechanism | low — ~0.1–0.2, but if the *upside* is named and large it still earns one portfolio slot |

The discipline is honesty about which class a hypothesis is in. A first-principles argument dressed as prior art inflates `P(true)` and corrupts the whole ranking.

## Information-value sequencing

EV ranks what to bet; information value ranks what to run *first*. Prefer the experiment whose result most collapses uncertainty about the rest of the portfolio:

- A cheap test that would **kill or confirm three downstream bets** is worth running before a marginally-higher-EV bet that teaches nothing transferable.
- A shared **mechanism probe** (does the bottleneck even behave the way the whole field assumes?) can validate or invalidate an entire branch at once — run it first.
- Once information value is equal, fall back to EV order.

This is why a portfolio is more than a sorted list: the *order* is chosen to make each round make the next round smarter.

## Worked example

Target: reduce p95 latency of a retrieval endpoint, currently 420 ms, goal < 200 ms.

| # | Mechanism | Effect | Cost | Evidence | P(true) | EV | Killer |
|---|---|---|---|---|---|---|---|
| A | Cache embeddings; stop re-embedding per request | −180 ms | low | prior-art (two vendors publish this) | 0.7 | **high** | cache hit-rate < 40% in traffic replay |
| B | Replace exact search with HNSW ANN index | −150 ms | med | prior-art (library benchmarks) | 0.6 | high | recall drops below product floor |
| C | Batch concurrent requests at the edge | −60 ms | med | first-principles | 0.4 | med | traffic isn't concurrent enough to batch |
| D | Move the model to an accelerated runtime | −250 ms | high | hunch (named upside) | 0.15 | low-med | integration cost exceeds the latency budget |

Sequence: run **A** first (highest EV *and* cheap), but before **B** run a one-hour **recall probe on the ANN index** — its result governs whether B, and any future ANN bet, is viable at all. D keeps its slot as the moonshot; it's last unless A+B stall.

## Persist

Write `.evolve/hypotheses/<date>-<slug>.md`: the landscape from the research step, the full ranked table (all columns), the chosen sequence with its information-value rationale, and the dispatch. A resuming agent reads this to continue betting without re-researching. Append a `skill-runs.jsonl` line.

## Dispatch-at-end

```
Next: /evolve — run bet A (cache embeddings) against the 420ms baseline; recall-probe gates bet B
Next: /pursue — top bet is architectural (ANN index replaces exact search); field attached as competing designs
Next: /breakout — whole field caps at ~250ms > 200ms target; the target's reachability is the real question
```
