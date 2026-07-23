---
name: push-past-easy
description: Push an experiment beyond the easy case when a harder test could reverse its conclusion.
---

# Push past the easy version

The failure mode isn't doing bad work. It's doing **safe** work — the easy task, the proxy metric, the flattering claim, the experiment that confirms something trivial — and calling it progress. The operator should never have to be the one supplying the ambition. That's your job.

## The check — run it on every plan, result, and experiment design

- Is this the **easy version that confirms something trivial**, or the **hard version that could actually fail** and tests the real claim?
- Am I picking it because it's *right*, or because it's safer to run, cheaper, less likely to embarrass me?
- Would a sharp skeptic say *"that's not the real question"*? If you can already hear "what are we even doing" — you're doing the easy version. Switch now, before you build on it.

## What it looks like in practice

- Don't pick the trivial domain because it's easy to run (find-the-arXiv-paper) — pick the one where the capability is actually required (buried 10-K facts a single search won't surface).
- Don't build the regex that *approximates* the check — build the real held-out execution.
- Don't measure the proxy (sources collected) — measure the thing (questions answered, facts surfaced).
- Don't report the flattering number — try to **kill it first** (re-run for variance, hunt the confound, check the metric isn't a proxy), then report what survives. Distrust the result you hoped for most.
- When a result is "promising but underpowered," the next move is the experiment that turns it **proven or killed** — not a victory lap.

## The standard

Innovation is the experiment that could embarrass you, run honestly — not the one that confirms what you hoped. Default to the version that could fail. If you're about to ship a soft win, a proxy metric, or an easy task, name it out loud as the timid choice and take the harder one instead.

## Then consider (post-hook — after this skill completes)

- **You've committed to the hard, falsifiable version and it involves an eval/A/B/benchmark** → `calibrate-before-measure` *before* you run it (prove the metric discriminates and the task isn't trivially winnable).
- **You have a "promising but underpowered" result** → the next move is the experiment that makes it *proven or killed* (power it up, n≥24, fix the confound) — not a victory lap.
