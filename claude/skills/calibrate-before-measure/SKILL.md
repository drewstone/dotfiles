---
name: calibrate-before-measure
description: Before running any eval, A/B, benchmark, or experiment, prove the metric can actually see what you claim to measure — and prove the task is hard enough to need the capability. Skip this and you measure the wrong thing for three experiments straight.
---

# Calibrate before you measure

You are about to run an eval, A/B, benchmark, or experiment. **Stop.** The metric *is* the experiment. If it measures a proxy, every number downstream is noise wearing a lab coat.

## Gate 1 — the metric must discriminate (do this BEFORE the run, not after)

1. Build a deliberately-**strong** instance and a deliberately-**weak** instance of the thing you claim to measure — a great solution and a terrible one, a deep answer and a shallow one, a real thesis and a ticker summary.
2. Score both with your metric. They **must** separate by a wide, unambiguous margin (weak <30%, strong >70%).
3. If they don't separate, **the metric is measuring a proxy, not the thing.** Stop. Fix the metric. Do **not** run the experiment on top of an invalid metric.
4. Calibration also catches metric *bugs* — surface-word matches, grader slack, leakage. (Real case: a "research depth" exam graded by substring-on-collected-pages scored a shallow ticker summary at 60%, because it was measuring retrieval, not research. Caught only at calibration; tightened until the gap was clean.)

## Gate 2 — the task must be hard enough

Run the **dumbest baseline first** — a single search, a constant, blind collection. If the dumb baseline ties or wins, the task is too easy to exercise the capability: every topology will tie, you'll get nulls, and you'll call them findings. Pick a task where the capability is *required* to succeed (a correctable middle band), not one a trivial baseline already aces.

## Why this exists

An entire research arc produced "null" results — "the verifier just dedups," "driving doesn't beat collection" — that were artifacts of a trivial domain plus a retrieval metric, **not** facts about the system. The capability was invisible to the eval. The moment the metric was calibrated and the task made hard, the real signal appeared. The metric and the domain were the broken part the whole time, not the thing under test.

**A result on an uncalibrated metric is not a result. It's a number.** Report the calibration gap (weak% vs strong%) alongside every eval claim, the way you report a confidence interval.

## Then consider (post-hook — after this skill completes)

- **Calibration passed and you have a positive result** → `push-past-easy`: try to *kill* the result before reporting it (re-run for variance, hunt the confound).
- **Calibration FAILED** (metric didn't discriminate, or a dumb baseline won) → `push-past-easy`: the task is too easy or the metric is a proxy — pick a harder task / a real metric, don't run on top of the invalid one.

> This skill is itself a **guard** — it is the *pre*-hook for any "run an eval / A/B / benchmark" work. That a guard interrupts before the run is its intent, not a disruption. (Forward-chaining references go at the END like this; only guard skills belong at the front of another skill's flow.)
