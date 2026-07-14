---
name: breakout
description: "Full method for /breakout — ceiling-analysis worksheet, physics-floor vs assumed-floor separation, the four regime-change levers, and the valley-commitment gate."
---

# Breakout — Full Reference

`/breakout` is the tier above `/pursue`. Pursue takes the goal as given and redesigns the architecture to hit it. Breakout interrogates the goal and changes the regime so a higher goal becomes reachable, then hands the build to pursue/meta-harness. It is the anti-greedy counterpart to a hill-climber: it deliberately climbs *down* the current metric to reach a peak the current metric can't see.

This is the one skill where a short-term regression is a feature. Guardrail against that becoming an excuse: every breakout must name the mechanism it dissolves and set the gate at which the bet is judged. A regime change with neither is fantasy, and this reference exists to keep it honest.

## The two failure modes this skill sits between

- **Cowardice** — accepting the assumed floor as the physics floor. "Retrieval maxes at 0.87" when 0.87 is an artifact of re-embedding per request, not of information theory. The stack's default voice (smallest change, five rounds, don't rewrite) trends here.
- **Fantasy** — attacking the physics floor, or naming a raised target with no mechanism. "10x throughput" with no named constraint being dissolved is a wish, and it burns the valley budget with nothing to show.

Breakout is legitimate only when it attacks the *assumed* floor with a *named* mechanism.

## Ceiling-analysis worksheet

Fill this before proposing any regime change. If a row is blank, you are not ready.

| Field | What it captures |
|---|---|
| Current ceiling | The number the system asymptotes to, measured, with variance and vantage (see the ground-truth-harness doctrine). |
| Binding constraint | The *mechanism* that produces the ceiling — one sentence, causal, checkable. |
| Physics floor | The genuinely irreducible bound: security invariant, information-theoretic limit, hard SLA, speed-of-light/IO. Cite why it's irreducible. |
| Assumed floor | The bound that is habit, historical choice, or an unretested "can't." This is the attack surface. |
| Regime lever | Which of the four levers below dissolves the assumed floor. |
| Raised target | A number absurd under the current regime, natural under the new one. |
| Smallest proof | The cheapest experiment that shows the new regime is *reachable* (not finished). |
| Valley budget | How much old-metric regression, for how long, before the gate judges the bet. |
| Kill condition | The observation that would prove the regime wrong (not just hard). |

## The four regime-change levers

Most breakouts are one of these. The artifact is rarely the lever.

1. **Change the metric.** The current metric may be the cage — it rewards the wrong thing or has a low ceiling by construction. Example: optimizing *retrieval precision* caps at the index's contents; the regime change is to optimize *what gets indexed*, a metric with a far higher ceiling. When you change the metric, re-baseline honestly — the old number no longer applies.
2. **Change the problem.** Eliminate the work instead of speeding it. "Don't make the sort faster — remove the sort." "Don't cache the query — precompute so there's no query." The biggest wins delete the thing being optimized.
3. **Change the constraint.** Retest a "can't." Constraints calcify: a limit that was real two years ago (a dependency, a data volume, a platform ceiling) may be dead. Breakout re-runs the experiment that established the constraint and often finds the wall moved.
4. **Change the substrate.** A different foundation moves the whole ceiling: a different model tier, a different execution regime (batch→stream, per-request→amortized, CPU→accelerated), a different data structure whose asymptotics differ. This is the most expensive lever — reserve it for when levers 1–3 don't reach the raised target.

## Valley-commitment gate

A regime change that improves the old metric immediately is suspicious — it probably wasn't a regime change. Expect a valley.

1. Record the pre-breakout baseline (the ceiling) in `.evolve/pursuits/<date>-breakout-<slug>.md`.
2. Build the regime via `/pursue` or `/multi-pursue`. During the build, the old metric may regress — that is inside the valley budget from the worksheet.
3. Do **not** judge on interim numbers. Pair with `/dont-collapse-the-architecture`: marginal early evidence is not a kill signal; the kill condition from the worksheet is.
4. At the gate (valley budget exhausted, or the smallest-proof experiment resolves), apply the bootstrap-CI promotion gate (`_common.md`): promote if the new regime clears the *raised* target with `ciLow > 0`; reject if the kill condition fired; extend the valley once if it's a `candidate` with real signal and unspent ambition.
5. On promote: the raised target becomes the new `/evolve` / `/pursue` target and the old ceiling is retired. On reject: `/autopsy` whether the regime was wrong or the proof was underpowered — a wrong proof of a right regime is a re-run, not an abandonment.

## Persist

Write `.evolve/pursuits/<date>-breakout-<slug>.md` with the full worksheet, the regime thesis, the valley budget, and the kill condition. Append a `skill-runs.jsonl` line. The bet must survive a context reset intact — a breakout that can't be resumed from its file is not externalized, and endurance collapses to whatever fits in one context window.

## Dispatch-at-end

```
Next: /pursue — build regime <thesis>, raised target <N>, valley budget <B>, kill on <K>
Next: /multi-pursue — <k> independent regime tracks, judged at the gate
Stop: no assumed floor found — the ceiling is the physics floor; hand back to /evolve to climb it honestly
```
