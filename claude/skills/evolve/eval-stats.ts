/**
 * General-purpose evaluation statistics library.
 *
 * Drop into any project's tests/eval/lib/ directory.
 * Works with any numeric score arrays — domain-agnostic.
 *
 * Usage:
 *   import { describe, compare, histogram, summaryReport } from './eval-stats'
 */

// --- Input Validation ---

function clean(values: number[]): number[] {
  return values.filter(v => typeof v === 'number' && isFinite(v))
}

// --- Descriptive Statistics ---

export interface DescriptiveStats {
  n: number
  median: number
  mean: number
  stddev: number
  iqr: number
  q1: number
  q3: number
  min: number
  max: number
  range: number
  cv: number            // coefficient of variation (%). 0 if mean=0
  skewness: number      // Fisher's. 0 if n<3 or stddev=0
  kurtosis: number      // excess kurtosis. 0 if n<4 or stddev=0
  bimodal: boolean      // rough bimodality check (Sarle's bimodality coefficient)
  stable: boolean       // IQR < 10 AND CV < 15%
  ci95: [number, number]  // bootstrap 95% CI on median
}

export function describe(values: number[]): DescriptiveStats {
  const vals = clean(values)
  const n = vals.length
  if (n === 0) return emptyStats()

  const sorted = [...vals].sort((a, b) => a - b)
  const mean = sorted.reduce((a, b) => a + b, 0) / n
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)]
  const variance = n > 1
    ? sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1)
    : 0
  const stddev = Math.sqrt(variance)
  const q1 = pct(sorted, 25)
  const q3 = pct(sorted, 75)
  const iqr = q3 - q1
  const cv = mean !== 0 ? (stddev / Math.abs(mean)) * 100 : 0

  // Fisher's skewness (guarded against stddev=0)
  const skewness = n > 2 && stddev > 0
    ? (n / ((n - 1) * (n - 2))) * sorted.reduce((sum, v) => sum + ((v - mean) / stddev) ** 3, 0)
    : 0

  // Excess kurtosis (guarded)
  const kurtosis = n > 3 && stddev > 0
    ? ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) *
      sorted.reduce((sum, v) => sum + ((v - mean) / stddev) ** 4, 0) -
      (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
    : 0

  // Sarle's bimodality coefficient: BC = (skew² + 1) / (kurtosis + 3(n-1)²/((n-2)(n-3)))
  // BC > 0.555 suggests bimodality
  const bimodalDenom = kurtosis + (3 * (n - 1) ** 2) / (Math.max(1, (n - 2) * (n - 3)))
  const bc = bimodalDenom !== 0 ? (skewness ** 2 + 1) / bimodalDenom : 0
  const bimodal = n >= 5 && bc > 0.555

  // Bootstrap 95% CI on median (1000 resamples)
  const ci95 = bootstrapCI(sorted, 0.95, 1000)

  return {
    n,
    median: r(median),
    mean: r(mean),
    stddev: r(stddev),
    iqr: r(iqr),
    q1: r(q1),
    q3: r(q3),
    min: sorted[0],
    max: sorted[n - 1],
    range: r(sorted[n - 1] - sorted[0]),
    cv: r(cv),
    skewness: r(skewness, 2),
    kurtosis: r(kurtosis, 2),
    bimodal,
    stable: iqr < 10 && cv < 15,
    ci95,
  }
}

// --- Bootstrap CI ---

function bootstrapCI(sorted: number[], confidence: number, reps: number): [number, number] {
  const n = sorted.length
  if (n <= 1) return [sorted[0] ?? 0, sorted[0] ?? 0]
  if (n === 2) return [sorted[0], sorted[1]]

  // Deterministic seed for reproducibility (sum of values as seed)
  let seed = sorted.reduce((a, b) => a + b, 0) * 1000 | 0
  const rng = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647 }

  const medians: number[] = []
  for (let i = 0; i < reps; i++) {
    const sample: number[] = []
    for (let j = 0; j < n; j++) {
      sample.push(sorted[Math.floor(rng() * n)])
    }
    sample.sort((a, b) => a - b)
    medians.push(n % 2 === 0 ? (sample[n / 2 - 1] + sample[n / 2]) / 2 : sample[Math.floor(n / 2)])
  }
  medians.sort((a, b) => a - b)

  const alpha = 1 - confidence
  const lo = pct(medians, alpha / 2 * 100)
  const hi = pct(medians, (1 - alpha / 2) * 100)
  return [r(lo), r(hi)]
}

// --- Comparison ---

export interface ComparisonResult {
  baseline: DescriptiveStats
  treatment: DescriptiveStats
  delta: number              // treatment.median - baseline.median
  cohensD: number            // effect size (pooled stddev)
  effectLabel: 'negligible' | 'small' | 'medium' | 'large'
  wilcoxonP: number | null   // p-value for paired comparison (null if unpaired/insufficient data)
  significant: boolean       // p < 0.05 or non-overlapping CIs
  direction: 'improved' | 'regressed' | 'unchanged'
  verdict: string
}

export function compare(
  baseline: number[],
  treatment: number[],
  paired = false
): ComparisonResult {
  const bs = describe(baseline)
  const ts = describe(treatment)
  const delta = r(ts.median - bs.median)

  // Cohen's d (pooled stddev)
  const pooledN = Math.max(1, bs.n + ts.n - 2)
  const pooledStd = Math.sqrt(
    ((bs.n - 1) * bs.stddev ** 2 + (ts.n - 1) * ts.stddev ** 2) / pooledN
  )
  const cohensD = pooledStd > 0 ? r(Math.abs(ts.mean - bs.mean) / pooledStd) : 0
  const effectLabel = cohensD < 0.2 ? 'negligible' as const
    : cohensD < 0.5 ? 'small' as const
    : cohensD < 0.8 ? 'medium' as const
    : 'large' as const

  // Wilcoxon signed-rank test for paired data
  let wilcoxonP: number | null = null
  if (paired && baseline.length === treatment.length && baseline.length >= 5) {
    wilcoxonP = wilcoxonSignedRank(clean(baseline), clean(treatment))
  }

  // Significance: Wilcoxon p<0.05, or non-overlapping bootstrap CIs
  const ciOverlap = !(ts.ci95[0] > bs.ci95[1] || bs.ci95[0] > ts.ci95[1])
  const significant = wilcoxonP !== null ? wilcoxonP < 0.05 : !ciOverlap

  const direction = delta > 2 ? 'improved' as const
    : delta < -2 ? 'regressed' as const
    : 'unchanged' as const

  let verdict: string
  if (direction === 'improved' && (significant || cohensD >= 0.8)) {
    verdict = `KEEP: +${delta}pp, d=${cohensD} (${effectLabel})${significant ? ', p<0.05' : ''}`
  } else if (direction === 'regressed' && (significant || cohensD >= 0.5)) {
    verdict = `REVERT: ${delta}pp, d=${cohensD} (${effectLabel})`
  } else if (effectLabel === 'negligible') {
    verdict = `NOISE: Δ${delta}pp, d=${cohensD} — not a real change`
  } else {
    verdict = `ITERATE: Δ${delta}pp, d=${cohensD} (${effectLabel}) — need more reps (N≥${requiredReps(Math.max(bs.cv, ts.cv), 5)})`
  }

  return { baseline: bs, treatment: ts, delta, cohensD, effectLabel, wilcoxonP, significant, direction, verdict }
}

// --- Wilcoxon Signed-Rank Test (paired, non-parametric) ---

function wilcoxonSignedRank(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  const diffs = []
  for (let i = 0; i < n; i++) {
    const d = b[i] - a[i]
    if (d !== 0) diffs.push(d)
  }
  if (diffs.length < 5) return 1  // insufficient data

  // Rank absolute differences
  const absDiffs = diffs.map((d, i) => ({ abs: Math.abs(d), sign: Math.sign(d), idx: i }))
  absDiffs.sort((a, b) => a.abs - b.abs)
  const ranks = absDiffs.map((_, i) => i + 1)

  // Handle ties (average rank)
  let i = 0
  while (i < absDiffs.length) {
    let j = i
    while (j < absDiffs.length && absDiffs[j].abs === absDiffs[i].abs) j++
    const avgRank = (ranks[i] + ranks[j - 1]) / 2
    for (let k = i; k < j; k++) ranks[k] = avgRank
    i = j
  }

  // W+ = sum of ranks where diff > 0
  let wPlus = 0
  for (let i = 0; i < absDiffs.length; i++) {
    if (absDiffs[i].sign > 0) wPlus += ranks[i]
  }

  // Normal approximation for p-value (valid for n >= 10, rough for n >= 5)
  const nn = absDiffs.length
  const expectedW = nn * (nn + 1) / 4
  const varW = nn * (nn + 1) * (2 * nn + 1) / 24
  const z = (wPlus - expectedW) / Math.sqrt(varW)

  // Two-tailed p-value from z-score (normal CDF approximation)
  return 2 * (1 - normalCDF(Math.abs(z)))
}

function normalCDF(z: number): number {
  // Abramowitz & Stegun approximation
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429
  const p = 0.3275911
  const t = 1 / (1 + p * Math.abs(z))
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z / 2)
  return z >= 0 ? y : 1 - y
}

// --- Multiple Comparison Correction ---

/** Benjamini-Hochberg FDR correction. Returns adjusted p-values. */
export function adjustPValues(pValues: number[]): number[] {
  const n = pValues.length
  const indexed = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p)
  const adjusted = new Array(n)
  let cumMin = 1
  for (let k = n - 1; k >= 0; k--) {
    const corrected = Math.min(1, indexed[k].p * n / (k + 1))
    cumMin = Math.min(cumMin, corrected)
    adjusted[indexed[k].i] = r(cumMin, 4)
  }
  return adjusted
}

// --- Visualizations ---

const SPARK = '▁▂▃▄▅▆▇█'

export function sparkline(values: number[], min?: number, max?: number): string {
  if (values.length === 0) return ''
  const lo = min ?? Math.min(...values)
  const hi = max ?? Math.max(...values)
  const range = hi - lo || 1
  return values.map(v => {
    const idx = Math.round(((v - lo) / range) * (SPARK.length - 1))
    return SPARK[Math.max(0, Math.min(SPARK.length - 1, idx))]
  }).join('')
}

/** Actual histogram: bins values and shows frequency distribution */
export function histogram(values: number[], label: string, bins = 10): string {
  const vals = clean(values)
  if (vals.length === 0) return `${label}: no data`
  const stats = describe(vals)

  // Bin the values
  const min = stats.min, max = stats.max
  const binWidth = (max - min) / bins || 1
  const counts = new Array(bins).fill(0)
  for (const v of vals) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / binWidth))
    counts[idx]++
  }
  const maxCount = Math.max(...counts)
  const spark = counts.map(c => {
    const idx = maxCount > 0 ? Math.round((c / maxCount) * (SPARK.length - 1)) : 0
    return SPARK[idx]
  }).join('')

  const bimodalFlag = stats.bimodal ? ' BIMODAL' : ''
  const stableFlag = stats.stable ? '✓' : '⚠'
  return `${label.padEnd(25)} ${spark}  med=${stats.median}% [${stats.ci95[0]},${stats.ci95[1]}] N=${stats.n} CV=${stats.cv}%${bimodalFlag} ${stableFlag}`
}

export function dimensionBars(dimensions: Record<string, number[]>): string {
  const lines: string[] = []
  for (const [name, values] of Object.entries(dimensions)) {
    const s = describe(values)
    const barLen = Math.round(s.median / 10)
    const bar = '█'.repeat(barLen) + '░'.repeat(10 - barLen)
    const flag = s.range > 30 ? ' ← high variance' : s.range === 0 ? ' ← ceiling' : s.bimodal ? ' ← bimodal' : ''
    lines.push(`${name.padEnd(18)} ${bar} ${s.median}% [${s.min},${s.max}]${flag}`)
  }
  return lines.join('\n')
}

export function convergenceCurve(turns: Array<{ turn: number; score: number; delta: number }>): string {
  return turns.map(t => {
    const spark = SPARK[Math.round((t.score / 100) * (SPARK.length - 1))]
    const sign = t.delta >= 0 ? '+' : ''
    return `T${t.turn}: ${spark} ${t.score}% (${sign}${t.delta})`
  }).join(' → ')
}

export function trendLine(rounds: Array<{ round: number; score: number }>): string {
  const scores = rounds.map(r => r.score)
  const spark = sparkline(scores, 0, 100)
  const labels = rounds.map(r => `R${r.round}`).join(' ')
  const trend = scores.length >= 2
    ? scores[scores.length - 1] > scores[0] + 2 ? '↑'
    : scores[scores.length - 1] < scores[0] - 2 ? '↓'
    : '→'
    : '—'
  return `${labels}\n${spark} ${trend}`
}

// --- Power Analysis ---

export function requiredReps(cv: number, desiredDeltaPp: number, power = 0.8): number {
  // For detecting a `desiredDeltaPp` improvement with given power.
  // Uses the relationship: n ≈ (z_α + z_β)² × 2 × CV² / (delta/mean)²
  // Simplified for percentage scores where mean ≈ 80
  const zAlpha = 1.96  // two-sided α=0.05
  const zBeta = power === 0.8 ? 0.84 : power === 0.9 ? 1.28 : power === 0.95 ? 1.645 : 0.84
  const sigma = cv  // CV is already in percentage points when scores are 0-100
  const n = Math.ceil(2 * ((zAlpha + zBeta) * sigma / desiredDeltaPp) ** 2)
  return Math.max(3, Math.min(100, n))
}

// --- Summary Report ---

export function summaryReport(
  personas: Array<{ id: string; scores: number[] }>,
  options?: { target?: number; showHistograms?: boolean }
): string {
  const target = options?.target ?? 80
  const lines: string[] = [
    `${'Persona'.padEnd(30)} ${'N'.padStart(3)} ${'Med'.padStart(5)} ${'CI95'.padStart(12)} ${'IQR'.padStart(5)} ${'CV%'.padStart(5)} ${'Pass%'.padStart(6)} ${'Dist'.padStart(12)}`,
    '─'.repeat(90),
  ]

  let totalPass = 0, totalRuns = 0
  const allScores: number[] = []
  for (const p of personas) {
    const s = describe(p.scores)
    allScores.push(...p.scores)
    const passRate = Math.round(p.scores.filter(v => v >= target).length / Math.max(1, p.scores.length) * 100)
    const spark = sparkline(p.scores, 0, 100)
    const icon = passRate === 100 ? '✓' : passRate >= 67 ? '○' : '✗'
    const bimodal = s.bimodal ? '!' : ' '
    const ci = `[${s.ci95[0]},${s.ci95[1]}]`
    lines.push(
      `${icon}${bimodal}${p.id.padEnd(28)} ${String(s.n).padStart(3)} ${String(s.median).padStart(4)}% ${ci.padStart(12)} ${String(s.iqr).padStart(5)} ${String(s.cv).padStart(4)}% ${String(passRate).padStart(5)}% ${spark}`
    )
    totalPass += p.scores.filter(v => v >= target).length
    totalRuns += p.scores.length
  }

  const overall = describe(allScores)
  lines.push('─'.repeat(90))
  lines.push(`Aggregate: ${totalPass}/${totalRuns} passed (${Math.round(totalPass / Math.max(1, totalRuns) * 100)}%)`)
  lines.push(`Overall median: ${overall.median}% [${overall.ci95[0]},${overall.ci95[1]}], CV=${overall.cv}%`)
  lines.push(`Reps for 5pp detection: ${requiredReps(overall.cv, 5)} (at CV=${overall.cv}%)`)
  if (overall.bimodal) lines.push(`⚠ Score distribution is bimodal — check for systematic pass/fail clustering`)

  return lines.join('\n')
}

// --- Helpers ---

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const frac = idx - lo
  if (lo + 1 >= sorted.length) return sorted[sorted.length - 1]
  return sorted[lo] * (1 - frac) + sorted[lo + 1] * frac
}

function r(v: number, d = 1): number {
  const f = 10 ** d
  return Math.round(v * f) / f
}

function emptyStats(): DescriptiveStats {
  return { n: 0, median: 0, mean: 0, stddev: 0, iqr: 0, q1: 0, q3: 0, min: 0, max: 0, range: 0, cv: 0, skewness: 0, kurtosis: 0, bimodal: false, stable: false, ci95: [0, 0] }
}
