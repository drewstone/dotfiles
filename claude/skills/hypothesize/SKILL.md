---
name: hypothesize
description: Research prior art, generate mechanisms, rank them, and hand off an experiment portfolio.
---

# Hypothesize

The improvement loop without this phase is greedy: try a thing, measure, keep or revert. This is the phase that makes it *science* — survey the field, bet a ranked portfolio, spend on the highest-value bet first. Use it before `/evolve` or `/pursue` whenever the honest answer to "what should we try?" is more than one obvious thing.

It does not run experiments (that's `/evolve`), diagnose *our* failures (that's `/diagnose` — inward), or question the target (that's `/breakout`). It looks *outward and forward*: what's known, what's possible, what's worth betting.

Shared conventions in `_common.md`. This absorbs and strengthens what was evolve's optional "structured-hypothesis mode."

## When to use

| Signal | Skill |
|---|---|
| "Make this number go up" and the next change is obvious | `/evolve` directly |
| "What should we even try?" / more than one plausible lever | **`/hypothesize`** |
| "Someone has surely solved this — what do they do?" | **`/hypothesize`** (dispatches `/deep-research` for web depth) |
| "We keep trying variations of one idea" | **`/hypothesize`** — the field is too narrow |
| Our own runs are failing, need ROI order | `/diagnose` (inward) then `/hypothesize` |

## Procedure

1. **Research the space — outward, before generating anything.** What's the real ceiling on this metric, who has hit it, what techniques exist that you haven't tried, where do competitors/prior art/other codebases beat you. Be honest about where they win. Dispatch `/deep-research` when the survey needs real web depth; read in-repo prior art and specs directly. Output: a landscape of *named techniques with their evidence*, not a vibe.
2. **Generate the field — a diverse set, never one.** Each hypothesis is a row: **mechanism** (one causal sentence), **predicted effect** (number + direction), **cost** (compute/time/risk), **killer** (the result that falsifies it), **evidence class** (prior-art-backed / first-principles / hunch). If all your rows are the same family, you haven't thought — force a structurally different branch.
3. **Rank by expected value, not by confidence.** `EV ≈ P(true) × effect ÷ cost`. Prior-art-backed raises `P(true)`; a hunch lowers it but a hunch with named upside still earns a slot. The top of the ranked list is what you spend on first.
4. **Sequence by information gain.** Among high-EV bets, run the one that most reduces uncertainty about the *rest* of the portfolio first — a cheap test that would kill or confirm three downstream bets beats a marginally-higher-EV bet that teaches nothing. Information compounds; a single win doesn't.
5. **Hand off the portfolio.** Write `.evolve/hypotheses/<date>-<slug>.md` (the ranked field, evidence, sequence). Dispatch `/evolve` to run the top bet, `/pursue` if the top bet is architectural, or `/breakout` if the *whole field* caps below the target — that means the target is the cage, not your ideas.

## Rules

- **One hypothesis is a guess; a ranked field is a strategy.** Never leave this skill with a single bet.
- **Research the world before betting on your own idea.** Someone has probably already hit this ceiling, and *how they did it* is the highest-value prior you have. Skipping the survey is how you spend a week re-deriving a known technique.
- **Rank by expected value, not confidence.** A 20%-likely 10x bet beats a 90%-likely 3% bet. Rigor that only ever funds the safe bet has killed the portfolio.
- **Run the experiment that teaches the most, not the one most likely to win.** The goal of a round is to collapse uncertainty, not to bank a point.
- **Every hypothesis names its killer.** A bet you can't lose is a bet you can't learn from — and usually a bet whose mechanism you don't actually understand.
- **Prior-art-backed > first-principles > hunch on `P(true)` — but always leave one slot for the named-upside hunch.** Don't let rigor strangle the moonshot.

Use `references/full-reference.md` for the EV scoring worked example, the evidence classes, and information-value sequencing.

## Then consider

- `evolve` — run the top-ranked bet against a measured baseline.
- `pursue` — when the top bet is architectural, not a parameter; feed it the ranked field as competing designs.
- `breakout` — when the entire ranked field caps below the target: the target is the ceiling, not your options.
- `deep-research` — dispatched mid-skill for web-depth surveys; return here to rank what it found.
