/**
 * Evaluation statistics library — thin wrapper over simple-statistics.
 *
 * Dependency: `pnpm add simple-statistics` (zero deps, 95 functions, battle-tested)
 *
 * This file adds domain-specific eval functions on top:
 * - describe(): comprehensive stats with stability/bimodality flags
 * - compare(): A/B comparison with effect size + verdict
 * - histogram/sparkline/convergenceCurve: terminal visualizations
 * - summaryReport(): full markdown table
 *
 * The stats math comes from simple-statistics (10+ years, Tom MacWright).
 * We add: bimodality detection, bootstrap CI, comparison verdicts, visualizations.
 */

import ss from 'simple-statistics'

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
  cv: number
  skewness: number
  kurtosis: number
  mad: number              // median absolute deviation (robust spread)
  bimodal: boolean         // ckmeans gap detection
  stable: boolean          // IQR < 10 AND CV < 15%
  ci95: [number, number]   // bootstrap 95% CI on median
  outliers: number[]       // values outside 1.5×IQR fences
}

export function describe(values: number[]): DescriptiveStats {
  const vals = clean(values)
  const n = vals.length
  if (n === 0) return emptyStats()

  const sorted = ss.numericSort([...vals])
  const mean = ss.mean(sorted)
  const median = ss.median(sorted)
  const stddev = n > 1 ? ss.sampleStandardDeviation(sorted) : 0
  const q1 = ss.quantile(sorted, 0.25)
  const q3 = ss.quantile(sorted, 0.75)
  const iqr = ss.iqr(sorted)
  const cv = mean !== 0 ? r(ss.coefficientOfVariation(sorted) * 100) : 0
  const skewness = n > 2 ? r(ss.sampleSkewness(sorted), 2) : 0
  const kurtosis = n > 3 ? r(ss.sampleKurtosis(sorted), 2) : 0
  const mad = r(ss.medianAbsoluteDeviation(sorted))

  // Bimodality: use ckmeans to find natural clusters
  // If 2 clusters with a significant gap, flag as bimodal
  let bimodal = false
  if (n >= 5) {
    try {
      const clusters = ss.ckmeans(sorted, 2)
      if (clusters.length === 2 && clusters[0].length > 0 && clusters[1].length > 0) {
        const gap = Math.min(...clusters[1]) - Math.max(...clusters[0])
        bimodal = gap > iqr * 0.5  // gap > half the IQR suggests real separation
      }
    } catch { /* ckmeans can fail on degenerate data */ }
  }

  // Bootstrap 95% CI on median
  const ci95 = bootstrapMedianCI(sorted, 1000)

  // Outlier detection (IQR fences)
  const loFence = q1 - 1.5 * iqr
  const hiFence = q3 + 1.5 * iqr
  const outliers = sorted.filter(v => v < loFence || v > hiFence)

  return {
    n, median: r(median), mean: r(mean), stddev: r(stddev),
    iqr: r(iqr), q1: r(q1), q3: r(q3),
    min: sorted[0], max: sorted[n - 1], range: r(sorted[n - 1] - sorted[0]),
    cv, skewness, kurtosis, mad, bimodal,
    stable: iqr < 10 && cv < 15,
    ci95, outliers,
  }
}

function bootstrapMedianCI(sorted: number[], reps: number): [number, number] {
  const n = sorted.length
  if (n <= 2) return [sorted[0], sorted[n - 1] ?? sorted[0]]
  const medians: number[] = []
  for (let i = 0; i < reps; i++) {
    const sample = ss.sampleWithReplacement(sorted, n) as number[]
    medians.push(ss.median(sample))
  }
  medians.sort((a, b) => a - b)
  return [r(ss.quantile(medians, 0.025)), r(ss.quantile(medians, 0.975))]
}

// --- Comparison ---

export interface ComparisonResult {
  baseline: DescriptiveStats
  treatment: DescriptiveStats
  delta: number
  cohensD: number
  effectLabel: 'negligible' | 'small' | 'medium' | 'large'
  pValue: number | null     // permutation test p-value
  significant: boolean
  direction: 'improved' | 'regressed' | 'unchanged'
  verdict: string
}

export function compare(baseline: number[], treatment: number[], opts?: { paired?: boolean }): ComparisonResult {
  const bs = describe(baseline)
  const ts = describe(treatment)
  const delta = r(ts.median - bs.median)

  // Cohen's d
  const pooledN = Math.max(1, bs.n + ts.n - 2)
  const pooledStd = Math.sqrt(((bs.n - 1) * bs.stddev ** 2 + (ts.n - 1) * ts.stddev ** 2) / pooledN)
  const cohensD = pooledStd > 0 ? r(Math.abs(ts.mean - bs.mean) / pooledStd) : 0
  const effectLabel = cohensD < 0.2 ? 'negligible' as const
    : cohensD < 0.5 ? 'small' as const : cohensD < 0.8 ? 'medium' as const : 'large' as const

  // Permutation test (non-parametric, no distribution assumptions)
  let pValue: number | null = null
  if (bs.n >= 3 && ts.n >= 3) {
    try {
      pValue = r(ss.permutationTest(clean(baseline), clean(treatment), 'mean', 10000), 4)
    } catch { /* insufficient data */ }
  }

  const significant = pValue !== null ? pValue < 0.05 : !(ts.ci95[0] <= bs.ci95[1] && bs.ci95[0] <= ts.ci95[1])
  const direction = delta > 2 ? 'improved' as const : delta < -2 ? 'regressed' as const : 'unchanged' as const

  let verdict: string
  if (direction === 'improved' && (significant || cohensD >= 0.8)) {
    verdict = `KEEP: +${delta}pp, d=${cohensD} (${effectLabel})${pValue !== null ? `, p=${pValue}` : ''}`
  } else if (direction === 'regressed' && (significant || cohensD >= 0.5)) {
    verdict = `REVERT: ${delta}pp, d=${cohensD} (${effectLabel})`
  } else if (effectLabel === 'negligible') {
    verdict = `NOISE: Δ${delta}pp, d=${cohensD} — not a real change`
  } else {
    verdict = `ITERATE: Δ${delta}pp, d=${cohensD} (${effectLabel}) — need more reps`
  }

  return { baseline: bs, treatment: ts, delta, cohensD, effectLabel, pValue, significant, direction, verdict }
}

// --- Multiple Comparison Correction ---

/** Benjamini-Hochberg FDR correction. */
export function adjustPValues(pValues: number[]): number[] {
  const n = pValues.length
  const indexed = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p)
  const adjusted = new Array(n)
  let cumMin = 1
  for (let k = n - 1; k >= 0; k--) {
    cumMin = Math.min(cumMin, Math.min(1, indexed[k].p * n / (k + 1)))
    adjusted[indexed[k].i] = r(cumMin, 4)
  }
  return adjusted
}

// --- Correlation ---

/** Spearman rank correlation. */
export function spearmanCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 3) return 0
  return r(ss.sampleRankCorrelation(a.slice(0, n), b.slice(0, n)), 3)
}

// --- Stratified Analysis ---

export function stratify(data: Array<{ group: string; score: number }>): Array<{ group: string; stats: DescriptiveStats }> {
  const groups = new Map<string, number[]>()
  for (const d of data) {
    if (!groups.has(d.group)) groups.set(d.group, [])
    groups.get(d.group)!.push(d.score)
  }
  return [...groups.entries()]
    .map(([group, scores]) => ({ group, stats: describe(scores) }))
    .sort((a, b) => b.stats.median - a.stats.median)
}

// --- Change Point / Drift ---

export function detectChangePoint(rounds: Array<{ round: number; score: number }>): { round: number; delta: number; direction: 'up' | 'down' } | null {
  if (rounds.length < 3) return null
  let maxDelta = 0, bestIdx = -1
  for (let i = 1; i < rounds.length; i++) {
    const d = Math.abs(rounds[i].score - rounds[i - 1].score)
    if (d > maxDelta) { maxDelta = d; bestIdx = i }
  }
  if (bestIdx < 0 || maxDelta < 3) return null
  return { round: rounds[bestIdx].round, delta: r(rounds[bestIdx].score - rounds[bestIdx - 1].score), direction: rounds[bestIdx].score > rounds[bestIdx - 1].score ? 'up' : 'down' }
}

export function ewma(values: number[], alpha = 0.2): number[] {
  if (values.length === 0) return []
  const result = [values[0]]
  for (let i = 1; i < values.length; i++) result.push(r(alpha * values[i] + (1 - alpha) * result[i - 1]))
  return result
}

// --- Power Analysis ---

export function requiredReps(cv: number, desiredDeltaPp: number, power = 0.8): number {
  const zAlpha = 1.96
  const zBeta = power === 0.8 ? 0.84 : power === 0.9 ? 1.28 : 1.645
  const n = Math.ceil(2 * ((zAlpha + zBeta) * cv / desiredDeltaPp) ** 2)
  return Math.max(3, Math.min(100, n))
}

// --- Visualizations ---

const SPARK = '▁▂▃▄▅▆▇█'

export function sparkline(values: number[], min?: number, max?: number): string {
  if (values.length === 0) return ''
  const lo = min ?? Math.min(...values), hi = max ?? Math.max(...values), range = hi - lo || 1
  return values.map(v => SPARK[Math.max(0, Math.min(SPARK.length - 1, Math.round(((v - lo) / range) * (SPARK.length - 1))))]).join('')
}

export function histogram(values: number[], label: string, bins = 10): string {
  const vals = clean(values)
  if (vals.length === 0) return `${label}: no data`
  const s = describe(vals)
  const binWidth = (s.max - s.min) / bins || 1
  const counts = new Array(bins).fill(0)
  for (const v of vals) counts[Math.min(bins - 1, Math.floor((v - s.min) / binWidth))]++
  const maxC = Math.max(...counts)
  const spark = counts.map(c => SPARK[maxC > 0 ? Math.round((c / maxC) * (SPARK.length - 1)) : 0]).join('')
  const flags = [s.bimodal ? 'BIMODAL' : '', s.stable ? '✓' : '⚠', s.outliers.length > 0 ? `${s.outliers.length} outlier(s)` : ''].filter(Boolean).join(' ')
  return `${label.padEnd(25)} ${spark}  med=${s.median}% [${s.ci95[0]},${s.ci95[1]}] N=${s.n} CV=${s.cv}% ${flags}`
}

export function dimensionBars(dims: Record<string, number[]>): string {
  return Object.entries(dims).map(([name, vals]) => {
    const s = describe(vals)
    const bar = '█'.repeat(Math.round(s.median / 10)) + '░'.repeat(10 - Math.round(s.median / 10))
    const flag = s.bimodal ? ' ← bimodal' : s.range > 30 ? ' ← high variance' : s.range === 0 ? ' ← ceiling' : ''
    return `${name.padEnd(18)} ${bar} ${s.median}% [${s.min},${s.max}]${flag}`
  }).join('\n')
}

export function convergenceCurve(turns: Array<{ turn: number; score: number; delta: number }>): string {
  return turns.map(t => `T${t.turn}: ${SPARK[Math.round((t.score / 100) * (SPARK.length - 1))]} ${t.score}% (${t.delta >= 0 ? '+' : ''}${t.delta})`).join(' → ')
}

export function trendLine(rounds: Array<{ round: number; score: number }>): string {
  const scores = rounds.map(r => r.score)
  const spark = sparkline(scores, 0, 100)
  const trend = scores.length >= 2 ? (scores[scores.length - 1] > scores[0] + 2 ? '↑' : scores[scores.length - 1] < scores[0] - 2 ? '↓' : '→') : '—'
  return `${rounds.map(r => `R${r.round}`).join(' ')}\n${spark} ${trend}`
}

export function summaryReport(personas: Array<{ id: string; scores: number[] }>, opts?: { target?: number }): string {
  const target = opts?.target ?? 80
  const lines = [
    `${'Persona'.padEnd(30)} ${'N'.padStart(3)} ${'Med'.padStart(5)} ${'CI95'.padStart(12)} ${'IQR'.padStart(5)} ${'CV%'.padStart(5)} ${'Pass%'.padStart(6)} Dist`,
    '─'.repeat(85),
  ]
  let totalPass = 0, totalRuns = 0
  const allScores: number[] = []
  for (const p of personas) {
    const s = describe(p.scores); allScores.push(...p.scores)
    const passRate = Math.round(p.scores.filter(v => v >= target).length / Math.max(1, p.scores.length) * 100)
    const icon = passRate === 100 ? '✓' : passRate >= 67 ? '○' : '✗'
    const bi = s.bimodal ? '!' : ' '
    lines.push(`${icon}${bi}${p.id.padEnd(28)} ${String(s.n).padStart(3)} ${String(s.median).padStart(4)}% ${`[${s.ci95[0]},${s.ci95[1]}]`.padStart(12)} ${String(s.iqr).padStart(5)} ${String(s.cv).padStart(4)}% ${String(passRate).padStart(5)}% ${sparkline(p.scores, 0, 100)}`)
    totalPass += p.scores.filter(v => v >= target).length; totalRuns += p.scores.length
  }
  const ov = describe(allScores)
  lines.push('─'.repeat(85))
  lines.push(`Aggregate: ${totalPass}/${totalRuns} passed (${Math.round(totalPass / Math.max(1, totalRuns) * 100)}%)`)
  lines.push(`Overall: med=${ov.median}% [${ov.ci95[0]},${ov.ci95[1]}] CV=${ov.cv}%${ov.bimodal ? ' ⚠ BIMODAL' : ''}`)
  lines.push(`Power: ${requiredReps(ov.cv, 5)} reps needed to detect 5pp Δ`)
  return lines.join('\n')
}

// --- Helpers ---

function r(v: number, d = 1): number { const f = 10 ** d; return Math.round(v * f) / f }
function emptyStats(): DescriptiveStats {
  return { n: 0, median: 0, mean: 0, stddev: 0, iqr: 0, q1: 0, q3: 0, min: 0, max: 0, range: 0, cv: 0, skewness: 0, kurtosis: 0, mad: 0, bimodal: false, stable: false, ci95: [0, 0], outliers: [] }
}
