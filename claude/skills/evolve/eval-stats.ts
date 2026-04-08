/**
 * General-purpose evaluation statistics library.
 *
 * Drop this into any project's tests/eval/lib/ directory.
 * Works with any numeric score arrays — not tied to specific domains.
 *
 * Usage:
 *   import { describe, compare, histogram, convergenceCurve } from './eval-stats'
 *   const stats = describe(scores)
 *   const comparison = compare(baseline, treatment)
 *   console.log(histogram(scores, 'persona-name'))
 *   console.log(convergenceCurve(perTurnScores))
 */

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
  cv: number           // coefficient of variation (%)
  skewness: number     // >0 right-skewed, <0 left-skewed
  stable: boolean      // IQR < 10 AND CV < 15
  ci95: [number, number]  // 95% confidence interval on median
}

export function describe(values: number[]): DescriptiveStats {
  const n = values.length
  if (n === 0) return emptyStats()

  const sorted = [...values].sort((a, b) => a - b)
  const mean = sorted.reduce((a, b) => a + b, 0) / n
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)]
  const variance = n > 1
    ? sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1)
    : 0
  const stddev = Math.sqrt(variance)
  const q1 = percentile(sorted, 25)
  const q3 = percentile(sorted, 75)
  const iqr = q3 - q1
  const cv = mean !== 0 ? (stddev / Math.abs(mean)) * 100 : 0

  // Skewness (Fisher's)
  const skewness = n > 2
    ? (n / ((n - 1) * (n - 2))) * sorted.reduce((sum, v) => sum + ((v - mean) / stddev) ** 3, 0)
    : 0

  // 95% CI on median (approximation: median ± 1.57 × IQR / √N)
  const ciHalfWidth = 1.57 * iqr / Math.sqrt(n)
  const ci95: [number, number] = [
    Math.round((median - ciHalfWidth) * 10) / 10,
    Math.round((median + ciHalfWidth) * 10) / 10,
  ]

  return {
    n,
    median: round(median),
    mean: round(mean),
    stddev: round(stddev),
    iqr: round(iqr),
    q1: round(q1),
    q3: round(q3),
    min: sorted[0],
    max: sorted[n - 1],
    range: sorted[n - 1] - sorted[0],
    cv: round(cv),
    skewness: round(skewness, 2),
    stable: iqr < 10 && cv < 15,
    ci95,
  }
}

// --- Comparison Statistics ---

export interface ComparisonResult {
  baselineStats: DescriptiveStats
  treatmentStats: DescriptiveStats
  rawDelta: number       // treatment.median - baseline.median
  cohensD: number        // effect size
  effectLabel: string    // negligible / small / medium / large
  direction: 'improved' | 'regressed' | 'unchanged'
  significant: boolean   // CI overlap check (rough)
  verdict: string        // human-readable
}

export function compare(baseline: number[], treatment: number[]): ComparisonResult {
  const bs = describe(baseline)
  const ts = describe(treatment)
  const rawDelta = ts.median - bs.median

  // Cohen's d (pooled stddev)
  const pooledStd = Math.sqrt(
    ((bs.n - 1) * bs.stddev ** 2 + (ts.n - 1) * ts.stddev ** 2) /
    Math.max(1, bs.n + ts.n - 2)
  )
  const cohensD = pooledStd > 0 ? Math.abs(ts.mean - bs.mean) / pooledStd : 0

  const effectLabel = cohensD < 0.2 ? 'negligible'
    : cohensD < 0.5 ? 'small'
    : cohensD < 0.8 ? 'medium'
    : 'large'

  const direction = rawDelta > 2 ? 'improved'
    : rawDelta < -2 ? 'regressed'
    : 'unchanged'

  // Rough significance: CIs don't overlap
  const significant = ts.ci95[0] > bs.ci95[1] || bs.ci95[0] > ts.ci95[1]

  let verdict: string
  if (direction === 'improved' && cohensD >= 0.5) {
    verdict = `KEEP: +${rawDelta}pp (d=${round(cohensD)}, ${effectLabel} effect)`
  } else if (direction === 'regressed' && cohensD >= 0.5) {
    verdict = `REVERT: ${rawDelta}pp regression (d=${round(cohensD)}, ${effectLabel} effect)`
  } else if (cohensD < 0.2) {
    verdict = `NOISE: Δ${rawDelta}pp but effect size negligible (d=${round(cohensD)})`
  } else {
    verdict = `ITERATE: Δ${rawDelta}pp, ${effectLabel} effect (d=${round(cohensD)}) — needs more reps`
  }

  return { baselineStats: bs, treatmentStats: ts, rawDelta, cohensD: round(cohensD), effectLabel, direction, significant, verdict }
}

// --- Inline Visualizations ---

const SPARK_CHARS = '▁▂▃▄▅▆▇█'

export function sparkline(values: number[], min?: number, max?: number): string {
  if (values.length === 0) return ''
  const lo = min ?? Math.min(...values)
  const hi = max ?? Math.max(...values)
  const range = hi - lo || 1
  return values.map(v => {
    const idx = Math.round(((v - lo) / range) * (SPARK_CHARS.length - 1))
    return SPARK_CHARS[Math.max(0, Math.min(SPARK_CHARS.length - 1, idx))]
  }).join('')
}

export function histogram(values: number[], label: string, bins = 10): string {
  const stats = describe(values)
  const spark = sparkline(values)
  const stabilityIcon = stats.stable ? '✓' : '⚠'
  return `${label.padEnd(25)} ${spark}  median=${stats.median}% [${stats.ci95[0]},${stats.ci95[1]}] N=${stats.n} CV=${stats.cv}% ${stabilityIcon}`
}

export function dimensionBars(dimensions: Record<string, number[]>): string {
  const lines: string[] = []
  for (const [name, values] of Object.entries(dimensions)) {
    const stats = describe(values)
    const barLen = Math.round(stats.median / 10)
    const bar = '█'.repeat(barLen) + '░'.repeat(10 - barLen)
    const variance = stats.range > 30 ? ' ← high variance' : stats.range === 0 ? ' ← ceiling' : ''
    lines.push(`${name.padEnd(18)} ${bar} ${stats.median}% [${stats.min},${stats.max}]${variance}`)
  }
  return lines.join('\n')
}

export function convergenceCurve(perTurnScores: Array<{ turn: number; score: number; delta: number }>): string {
  const parts = perTurnScores.map(t => {
    const spark = SPARK_CHARS[Math.round((t.score / 100) * (SPARK_CHARS.length - 1))]
    const deltaStr = t.delta >= 0 ? `+${t.delta}` : `${t.delta}`
    return `T${t.turn}: ${spark} ${t.score}% (${deltaStr})`
  })
  return parts.join(' → ')
}

export function trendLine(rounds: Array<{ round: number; score: number }>): string {
  const scores = rounds.map(r => r.score)
  const spark = sparkline(scores, 0, 100)
  const labels = rounds.map(r => `R${r.round}`).join(' ')
  const trend = scores.length >= 2
    ? scores[scores.length - 1] > scores[0] ? '↑' : scores[scores.length - 1] < scores[0] ? '↓' : '→'
    : '—'
  return `${labels}\n${spark} ${trend}`
}

// --- Power Analysis ---

export function requiredReps(cv: number, desiredDelta: number, power = 0.8, alpha = 0.05): number {
  // Simplified power analysis for detecting a given delta
  // Uses normal approximation: n ≈ (z_α + z_β)² × 2σ² / δ²
  const zAlpha = 1.96  // two-sided α=0.05
  const zBeta = power === 0.8 ? 0.84 : power === 0.9 ? 1.28 : 0.67
  const sigma = cv / 100 * 85  // rough: CV% of a typical 85% score
  const n = Math.ceil(2 * ((zAlpha + zBeta) * sigma / desiredDelta) ** 2)
  return Math.max(3, Math.min(100, n))
}

// --- Summary Report ---

export function summaryReport(
  personas: Array<{ id: string; scores: number[] }>,
  options?: { target?: number }
): string {
  const target = options?.target ?? 80
  const lines: string[] = [
    'Persona'.padEnd(30) + 'N'.padStart(4) + 'Med'.padStart(6) + 'IQR'.padStart(6) + 'CV%'.padStart(6) + 'Pass%'.padStart(7) + '  Distribution'.padStart(15),
    '─'.repeat(85),
  ]

  let totalPass = 0, totalRuns = 0
  for (const p of personas) {
    const s = describe(p.scores)
    const passRate = Math.round(p.scores.filter(v => v >= target).length / p.scores.length * 100)
    const spark = sparkline(p.scores, 0, 100)
    const icon = passRate === 100 ? '✓' : passRate >= 67 ? '○' : '✗'
    lines.push(
      `${icon} ${p.id.padEnd(28)} ${String(s.n).padStart(3)} ${String(s.median).padStart(5)}% ${String(s.iqr).padStart(5)} ${String(s.cv).padStart(5)}% ${String(passRate).padStart(5)}%  ${spark}`
    )
    totalPass += p.scores.filter(v => v >= target).length
    totalRuns += p.scores.length
  }

  lines.push('─'.repeat(85))
  lines.push(`Aggregate: ${totalPass}/${totalRuns} passed (${Math.round(totalPass / totalRuns * 100)}%)`)
  lines.push(`Reps needed for 5pp detection: ${requiredReps(15, 5)} (at CV=15%)`)

  return lines.join('\n')
}

// --- Helpers ---

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(idx)
  const frac = idx - lower
  if (lower + 1 >= sorted.length) return sorted[sorted.length - 1]
  return sorted[lower] * (1 - frac) + sorted[lower + 1] * frac
}

function round(v: number, decimals = 1): number {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

function emptyStats(): DescriptiveStats {
  return { n: 0, median: 0, mean: 0, stddev: 0, iqr: 0, q1: 0, q3: 0, min: 0, max: 0, range: 0, cv: 0, skewness: 0, stable: false, ci95: [0, 0] }
}
