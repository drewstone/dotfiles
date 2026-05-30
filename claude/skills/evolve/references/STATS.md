# Bootstrap-CI Promotion Gate (structured-hypothesis mode)

The deterministic gate for the structured-hypothesis mode in `SKILL.md`. Computes a
promote/reject/candidate/inconclusive decision from a bootstrap confidence interval on
the control→treatment delta, so the gate is computed, not eyeballed.

This is distinct from `stats.md`'s Cohen's-d KEEP/ITERATE/REVERT verdict: that ranks
effect size for a single experiment; this decides whether a winning experiment is durable
enough to **promote** into a baseline or default. Use this gate when an experiment graduates
from "did it move" to "should it ship."

## Inputs

- `control[]`, `treatment[]` — per-rep scores for the metric under test (pass rate, score, etc.).
  3 reps minimum, 5 for noisy targets (CV > 20%).
- `B` — bootstrap resamples. Default **10000**.
- Direction — whether higher or lower is better for the metric (pass rate: higher; cost/latency: lower).
  Normalize so the delta is `treatment − control` in the improving direction.

## Procedure

1. Compute the observed delta `δ = median(treatment) − median(control)` (improving direction).
2. Bootstrap: for `b` in `1..B`, resample `control` and `treatment` with replacement (same N each),
   recompute `δ_b`. Collect the `δ_b` distribution.
3. Take the 95% CI as the 2.5th and 97.5th percentiles of `{δ_b}`: `[ciLow, ciHigh]`.
4. Apply the decision rule below.

## Decision rule

The same thresholds research used (`research/SKILL.md` Phase 4, pre-merge):

| Decision | Condition |
|---|---|
| **promote** | `ciLow > 0` (improvement excludes zero) — OR neutral pass rate with a meaningful efficiency gain and `ciLow ≥ −2pp` (the regression floor) |
| **reject** | `ciHigh < 0` (CI entirely below zero) — OR neutral pass rate with an efficiency regression |
| **candidate** | positive point estimate (`δ > 0`) but `ciLow ≤ 0` — real signal, insufficient power. Needs more reps. |
| **inconclusive** | CI spans zero widely AND no efficiency signal either way |

"pp" = percentage points. The `−2pp` floor lets a cost/latency win promote even when pass rate is
flat, provided the CI shows pass rate didn't drop more than 2pp.

## Promotion scope (where a promoted winner lands)

A `promote` decision still has to choose a target:

- Safe for all users → promote to **global defaults**.
- Only safe in controlled environments → promote to **benchmark/test profiles** only.
- Needs more validation → flag for **follow-up**, do not change defaults yet.

## Reference implementation

```ts
// delta in improving direction; control/treatment are per-rep scores
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function resample(xs: number[]): number[] {
  return xs.map(() => xs[Math.floor(Math.random() * xs.length)])
}

function promotionGate(
  control: number[],
  treatment: number[],
  opts: { B?: number; efficiencyGain?: boolean; efficiencyRegression?: boolean } = {},
): { decision: 'promote' | 'reject' | 'candidate' | 'inconclusive'; delta: number; ciLow: number; ciHigh: number } {
  const B = opts.B ?? 10000
  const delta = median(treatment) - median(control)
  const deltas: number[] = []
  for (let b = 0; b < B; b++) deltas.push(median(resample(treatment)) - median(resample(control)))
  deltas.sort((a, b) => a - b)
  const ciLow = deltas[Math.floor(0.025 * B)]
  const ciHigh = deltas[Math.floor(0.975 * B)]

  let decision: 'promote' | 'reject' | 'candidate' | 'inconclusive'
  if (ciLow > 0) decision = 'promote'
  else if (opts.efficiencyGain && ciLow >= -2) decision = 'promote'
  else if (ciHigh < 0 || opts.efficiencyRegression) decision = 'reject'
  else if (delta > 0) decision = 'candidate'
  else decision = 'inconclusive'

  return { decision, delta, ciLow, ciHigh }
}
```

Record the decision, `delta`, and `[ciLow, ciHigh]` on the experiment line in `.evolve/experiments.jsonl`.
