# Statistical Analysis Reference for Eval/Optimization

When reporting results from any evolve/pursue cycle, include these statistics.
This is the minimum bar for professional data science quality.

## Required Statistics (always report)

### 1. Central Tendency + Spread
- **Median** (not mean) — robust to outliers from model variance
- **IQR** (interquartile range: Q3-Q1) — measures spread without outlier influence
- **Min/Max** — shows the range of outcomes
- **N** — how many observations (never report stats without N)

### 2. Stability Assessment
- **CV** (coefficient of variation: stddev/mean × 100%) — normalizes variance across different scales
  - CV < 10%: stable, trustworthy
  - CV 10-20%: moderate variance, results directional
  - CV > 20%: high variance, don't trust single runs
- **Stability flag**: IQR < 10 AND CV < 15% → "stable"

### 3. Effect Size (when comparing before/after)
- **Cohen's d**: (mean_after - mean_before) / pooled_stddev
  - d < 0.2: negligible
  - d 0.2-0.5: small
  - d 0.5-0.8: medium
  - d > 0.8: large
- **Always report effect size alongside raw delta.** A +5pp improvement with d=0.1 is noise. A +5pp improvement with d=1.2 is real.

### 4. Confidence
- **Bootstrap 95% CI** on the median (resample with replacement, take 2.5th and 97.5th percentile)
- Or simple approximation: median ± 1.57 × IQR / √N
- Report as: "median 85% [79%, 91%]" — the interval tells you how trustworthy the point estimate is

### 5. Power/Sample Size
- To detect a 5pp improvement with 80% power at α=0.05, given CV:
  - CV 10%: need ~3 reps
  - CV 15%: need ~5 reps
  - CV 20%: need ~8 reps
  - CV 30%: need ~16 reps
- **Rule of thumb**: 3 reps minimum, 5 reps for noisy targets, never trust N=1

## Recommended Visualizations (inline terminal)

### Histogram (inline sparkline)
```
w2-single:       ▁▂▅▇█▇▅▂▁  median=92% [88,96] N=5 CV=4%
retired-couple:  ▂▅▇▅▂▁▁▁▁  median=76% [69,85] N=5 CV=12%
real-estate:     ▁▁▂▅▇█▅▂▁  median=81% [51,90] N=5 CV=22% ⚠
```

### Score distribution by dimension
```
Forms:        ████████░░ 80% [60,100]
Line Values:  █████░░░░░ 50% [0,100]  ← high variance
Optimizations:██████████ 100% [100,100] ← ceiling
Compliance:   ████████░░ 86% [38,100]
```

### Trend over rounds
```
R6 ▃ R7 ▆ R8 ▇ R9 █ R10 ▇  — peaked at R9, check if R10 drop is noise
```

### Convergence curve (per-turn)
```
T1: ▂ 30% → T2: ▅ 55% (+25) → T3: ▇ 85% (+30) → T4: █ 95% (+10)
         └─ high value ─┘          └─ diminishing ─┘
```

## When to Report What

### After single run (N=1)
Report raw scores only. Flag as "single run — do not trust for decisions."
No statistics beyond the point estimate.

### After 3 reps (N=3)
Report: median, min, max, range. Flag stability.
Enough for directional decisions but not for publishing.

### After 5+ reps (N≥5)
Full statistics: median, IQR, CV, CI.
Effect sizes for comparisons. Histogram.
Sufficient for promoting/reverting prompt versions.

### After 10+ reps (N≥10)
Add: distribution shape (bimodal? skewed?), outlier analysis,
correlation between dimensions, per-turn convergence analysis.
Sufficient for research-quality reporting.

## Paired Comparisons (A/B testing)

When comparing two prompt versions on the SAME personas, use **paired tests**:
- **Wilcoxon signed-rank test** (non-parametric, no normality assumption)
- `compare(baseline, treatment, paired=true)` returns p-value
- p < 0.05 with d > 0.5 → real improvement, promote
- p > 0.05 with d < 0.2 → noise, don't change anything

### Multiple Comparison Correction
Testing 20 personas = 20 hypotheses. Without correction, you'll get ~1 false positive by chance.
- **Benjamini-Hochberg FDR**: `adjustPValues(pValues)` — controls false discovery rate
- Use adjusted p-values, not raw, when claiming "X personas significantly improved"
- Rule: if ≥3 personas show adjusted p < 0.05 with d > 0.5, the change is real

## Bimodality Detection

LLM outputs are often bimodal: the model either "gets it" (85-100%) or "misses" (30-60%).
This makes mean and even median misleading.
- **Sarle's bimodality coefficient**: BC > 0.555 suggests bimodality
- `describe(scores).bimodal` flags this automatically
- When bimodal: report BOTH modes, not just the median. "Mode 1: 90% (60% of runs), Mode 2: 45% (40% of runs)"
- Bimodal targets need architectural fixes (the model is randomly choosing between two strategies), not prompt tweaks

## Anti-Patterns

1. **Reporting mean instead of median** — means are dragged by outliers. [90,90,90,90,20] mean=76, median=90. Use median.

2. **Comparing single runs** — "v1=85%, v2=88%, v2 wins" is not valid. Run 3+ reps, compare medians with effect size.

3. **Ignoring variance** — "average 85%" means nothing without knowing if it's [84,85,86] or [51,85,100]. Report IQR and CV.

4. **Optimizing metric over experience** — if the score goes up but output reads worse, the metric is wrong. Spot-check.

5. **Treating all dimensions equally** — a 10pp drop in hallucination is catastrophic. A 10pp drop in line values is fixable.

6. **Publishing without N** — "85% accuracy" vs "85% accuracy (N=47, CV=8%)" are different claims.

7. **Multiple testing without correction** — 20 personas × 1 comparison = expect 1 false positive. Use BH-adjusted p-values.

8. **Ignoring bimodality** — if the distribution is bimodal, the median sits between two clusters and represents neither. Check and report both modes.
