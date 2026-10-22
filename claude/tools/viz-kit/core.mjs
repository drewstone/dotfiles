// viz-kit core: input parsing, number formatting, chart models and terminal renderers.
//
// Every chart is built in two steps. A model function checks the data, reconciles
// parts with their whole and formats every value once; a text function lays the
// model out for a terminal. The page kit (page.mjs) draws HTML from the same
// models, so the terminal view and the page cannot disagree about a number.
// No network, no dependencies, no clock: the same input always gives the same bytes.
//
// Every text function takes a style. `plain` draws monochrome block glyphs; `emoji` draws
// colored squares and dots, the one kind of color that survives a markdown chat such as
// Claude Code's, where ANSI escapes do not render.

export class VizError extends Error {}

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']
const SPARKS = '▁▂▃▄▅▆▇█'
const FILLS = ['█', '▓', '▒', '░', '▚', '▞']
const TARGET_MARK = '┆'
export const GLYPHS = { ok: '✓', fail: '✗', warn: '!', skip: '-', unknown: '·' }
const EPS = 1e-9

// ---------- styles ----------

// A bar's color says its tone; rows without one draw in the first series color.
const SQUARE = { good: '🟩', ok: '🟩', warn: '🟨', serious: '🟧', bad: '🟥', crit: '🟥', fail: '🟥', accent: '🟦', info: '🟦', dim: '⬜', blind: '⬜' }
// Series and groups without a tone: blue and purple first, status hues only past three.
const SERIES = ['🟦', '🟪', '🟫', '🟧', '🟨', '🟩']
export const DOT = { good: '🟢', ok: '🟢', done: '🟢', warn: '🟡', wait: '🟡', serious: '🟠', bad: '🔴', crit: '🔴', fail: '🔴', block: '🔴', blind: '⚪', dim: '⚪', skip: '⚪', unknown: '⚪', accent: '🔵', info: '🔵', you: '👉' }

export const STYLES = {
  plain: { name: 'plain', emoji: false, target: TARGET_MARK, strip: GLYPHS },
  emoji: { name: 'emoji', emoji: true, target: '🏁', strip: { ok: '✅', fail: '❌', warn: '⚠️', skip: '➖', unknown: '⚪' } },
}

// The style named by --color, else $VIZ_COLOR, else plain.
export function styleOf(name) {
  const key = String(name ?? '').trim().toLowerCase() || 'plain'
  if (!STYLES[key]) throw new VizError(`unknown color mode ${JSON.stringify(name)}; use plain or emoji`)
  return STYLES[key]
}

const squareOf = (tone, i = 0) => SQUARE[tone] ?? SERIES[i % SERIES.length]

// ---------- text layout ----------

// Terminal columns: wide East Asian characters and emoji take two. Variation selector 16
// turns the character before it into a two-column emoji (⚠️, ⏭️); joiners, other
// selectors and combining marks take none.
const WIDE = [
  [0x1100, 0x115f], [0x231a, 0x231b], [0x23e9, 0x23ec], [0x23f0, 0x23f0], [0x23f3, 0x23f3], [0x25fd, 0x25fe],
  [0x2614, 0x2615], [0x2648, 0x2653], [0x267f, 0x267f], [0x2693, 0x2693], [0x26a1, 0x26a1], [0x26aa, 0x26ab],
  [0x26bd, 0x26be], [0x26c4, 0x26c5], [0x26ce, 0x26ce], [0x26d4, 0x26d4], [0x26ea, 0x26ea], [0x26f2, 0x26f3],
  [0x26f5, 0x26f5], [0x26fa, 0x26fa], [0x26fd, 0x26fd], [0x2705, 0x2705], [0x270a, 0x270b], [0x2728, 0x2728],
  [0x274c, 0x274c], [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797], [0x27b0, 0x27b0],
  [0x27bf, 0x27bf], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50], [0x2b55, 0x2b55], [0x2e80, 0x303e], [0x3041, 0xa4cf],
  [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6],
  [0x1f004, 0x1f004], [0x1f0cf, 0x1f0cf], [0x1f18e, 0x1f18e], [0x1f191, 0x1f19a], [0x1f300, 0x1f64f],
  [0x1f680, 0x1f6ff], [0x1f7e0, 0x1f7eb], [0x1f900, 0x1faff], [0x20000, 0x3fffd],
]
const isWide = (cp) => cp >= 0x1100 && WIDE.some(([a, b]) => cp >= a && cp <= b)
const isZeroWidth = (cp) => cp === 0x200d || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0e) || (cp >= 0x300 && cp <= 0x36f)

export function width(s) {
  let w = 0
  let last = 0
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0)
    if (cp === 0xfe0f) { if (last === 1) { w += 1; last = 2 } continue }
    if (isZeroWidth(cp)) continue
    last = isWide(cp) ? 2 : 1
    w += last
  }
  return w
}

// The longest prefix of s that fits in `cols` columns, and the rest.
function cut(s, cols) {
  const chars = [...String(s)]
  let i = 0
  while (i < chars.length && width(chars.slice(0, i + 1).join('')) <= cols) i++
  if (!i) i = 1
  return [chars.slice(0, i).join(''), chars.slice(i).join('')]
}
export const padEnd = (s, w) => String(s) + ' '.repeat(Math.max(0, w - width(s)))
export const padStart = (s, w) => ' '.repeat(Math.max(0, w - width(s))) + String(s)
const widest = (items) => items.reduce((m, s) => Math.max(m, width(s ?? '')), 0)

export function wrap(text, cols) {
  const out = []
  const limit = Math.max(1, cols)
  for (const para of String(text ?? '').split('\n')) {
    let line = ''
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (width(word) > limit) {
        if (line) { out.push(line); line = '' }
        const [head, rest] = cut(word, limit)
        out.push(head)
        word = rest
      }
      if (!word) continue
      if (!line) line = word
      else if (width(line) + 1 + width(word) <= limit) line += ' ' + word
      else { out.push(line); line = word }
    }
    out.push(line)
  }
  return out
}

// Inline markup shared with the page: **bold**, `code`, [text](https://url).
export function plain(s) {
  return String(s ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '$1 ($2)')
}

// ---------- numbers ----------

export function decimalsOf(values) {
  let d = 0
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const s = String(v)
    const i = s.indexOf('.')
    if (i >= 0 && !s.includes('e')) d = Math.max(d, s.length - i - 1)
  }
  return Math.min(d, 2)
}

export function fmtNum(v, d = 0) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'n/a'
  const fixed = Math.abs(v).toFixed(d)
  const [int, frac] = fixed.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (v < 0 && Number(fixed) !== 0 ? '-' : '') + grouped + (frac ? '.' + frac : '')
}

const ATTACHED_UNITS = new Set(['%', 's', 'ms', 'm', 'h', 'd', 'x', 'k', 'K', 'M', 'B', 'KB', 'MB', 'GB', 'KiB', 'MiB', 'GiB'])
export function withUnit(text, unit) {
  if (!unit || text === 'n/a') return text
  if (unit === '$') return text.startsWith('-') ? '-$' + text.slice(1) : '$' + text
  return ATTACHED_UNITS.has(unit) ? text + unit : `${text} ${unit}`
}
export const fmtValue = (v, unit, d = 0) => withUnit(fmtNum(v, d), unit)

// Minutes as 6h46m; whole days past 48 hours.
export function fmtDuration(minutes) {
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h >= 48) return `${Math.floor(h / 24)}d${String(h % 24).padStart(2, '0')}h`
  return h ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m`
}

const isMinutes = (unit) => unit === 'm' || unit === 'min'
export function fmtTotal(v, unit, d = 0) {
  const base = fmtValue(v, unit, d)
  return isMinutes(unit) && v >= 60 ? `${base} (${fmtDuration(v)})` : base
}

// A share or rate with one decimal; exactly 0 and 100 print bare, and nothing short of 100 rounds up to it.
export function fmtShare(x) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 'n/a'
  const p = x * 100
  if (p === 0 || p === 100) return `${p}%`
  if (p > 0 && p < 0.05) return '<0.1%'
  let r = Math.round(p * 10) / 10
  if (p < 100 && r >= 100) r = 99.9
  return r.toFixed(1) + '%'
}

export function niceStep(x) {
  if (!(x > 0)) return 1
  const e = 10 ** Math.floor(Math.log10(x))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * e >= x * (1 - EPS)) return m * e
  return 10 * e
}

// A zero-based domain whose top is a clean tick: 308 -> 0..400 by 100.
export function niceDomain(max) {
  if (!(max > 0)) return { max: 1, step: 0.25 }
  const step = niceStep(max / 4)
  return { max: Number((Math.ceil(max / step - EPS) * step).toFixed(10)), step }
}

export function ticksOf(domain) {
  const out = []
  for (let v = 0; v <= domain.max + EPS; v += domain.step) out.push(Number(v.toFixed(10)))
  return out
}

// ---------- clock times ----------

// HH:MM[:SS] as minutes after midnight, or an ISO timestamp as epoch minutes.
export function parseTime(t) {
  if (t == null) return null
  const s = String(t).trim()
  const clock = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (clock) return { clock: true, minutes: Number(clock[1]) * 60 + Number(clock[2]) + Number(clock[3] ?? 0) / 60 }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) {
    const ms = Date.parse(s.replace(' ', 'T'))
    if (Number.isFinite(ms)) return { clock: false, minutes: ms / 60000 }
  }
  return null
}

export function minutesBetween(a, b) {
  const x = parseTime(a)
  const y = parseTime(b)
  if (!x || !y || x.clock !== y.clock) return null
  let diff = y.minutes - x.minutes
  if (x.clock && y.clock && diff < 0) diff += 1440
  return diff
}

export function clockAfter(start, minutes) {
  const t = parseTime(start)
  if (!t?.clock) return null
  const total = Math.round(t.minutes + minutes) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// ---------- input ----------

const NULLS = new Set(['', 'null', 'n/a', 'na', 'NA', '-', '—', 'none'])

function tsvCell(raw) {
  const s = raw.trim()
  if (NULLS.has(s)) return null
  if (/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ''))
  return s
}

// JSON (an array of rows or numbers, or an object with rows and options) or TSV with a header line.
export function parseInput(text) {
  const t = String(text ?? '').trim()
  if (!t) throw new VizError('no input: pass JSON or TSV as a file argument or on stdin')
  if (t[0] === '{' || t[0] === '[') {
    let data
    try { data = JSON.parse(t) } catch (error) { throw new VizError(`input is not valid JSON: ${error.message}`) }
    return Array.isArray(data) ? { rows: data } : data
  }
  const lines = t.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('#'))
  const header = lines[0].split('\t').map((h) => h.trim())
  if (header.length < 1) throw new VizError('TSV needs a header line')
  // A first line of numbers under a non-key label is a data row; reading it as a header
  // silently drops that row from the chart (a 319-box bar once printed as "unaccounted").
  // Year-named series ("label\t2025\t2026") keep working because their first cell is a key.
  if (header.length > 1 && !['label', 't'].includes(header[0]) && header.slice(1).every((h) => typeof tsvCell(h) === 'number')) {
    throw new VizError(`TSV line 1 looks like data, not a header (${JSON.stringify(lines[0])}): add a header line such as "label\\tvalue"`)
  }
  const rows = lines.slice(1).map((line, i) => {
    const cells = line.split('\t')
    if (cells.length > header.length) throw new VizError(`TSV line ${i + 2} has ${cells.length} cells but the header has ${header.length}`)
    return Object.fromEntries(header.map((h, j) => [h, tsvCell(cells[j] ?? '')]))
  })
  return { rows, columns: header }
}

function rowsOf(data) {
  const rows = Array.isArray(data) ? data : data.rows
  if (!Array.isArray(rows)) throw new VizError('input has no rows')
  return rows.map((r) => (r === null || typeof r !== 'object' ? { value: r } : r))
}

function keysOf(rows, data) {
  if (Array.isArray(data.columns) && data.columns.every((c) => typeof c === 'string')) return data.columns
  const keys = []
  for (const r of rows) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k)
  return keys
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const RESERVED = new Set(['label', 'note', 'tone', 'group', 'of', 'status', 't', 'time', 'text', 'event'])

function labelKey(rows, keys, o) {
  if (o.label) return o.label
  if (keys.includes('label')) return 'label'
  return keys.find((k) => rows.some((r) => typeof r[k] === 'string')) ?? 'label'
}

function valueKey(rows, keys, o, skip) {
  if (o.value) return o.value
  if (keys.includes('value')) return 'value'
  const key = keys.find((k) => !skip.includes(k) && !RESERVED.has(k) && rows.some((r) => isNum(r[k])))
  if (!key) throw new VizError('no numeric column found; name one with --value')
  return key
}

function numberOrNull(v, where) {
  if (v === null || v === undefined) return null
  if (isNum(v)) return v
  throw new VizError(`${where}: expected a number or null, got ${JSON.stringify(v)}`)
}

// A cell may be a number, null, "33/36", [33, 36] or {value: 33, of: 36}.
function ratioCell(v, where) {
  if (v === null || v === undefined) return { value: null }
  if (isNum(v)) return { value: v }
  let n
  let of
  if (typeof v === 'string' && /^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(v)) [n, of] = v.split('/').map(Number)
  else if (Array.isArray(v) && v.length === 2) [n, of] = v
  else if (v && typeof v === 'object' && 'of' in v) ({ value: n, of } = v)
  else throw new VizError(`${where}: expected a number, null or a ratio like "33/36", got ${JSON.stringify(v)}`)
  if (!isNum(n) || !isNum(of) || n < 0 || of < 0) throw new VizError(`${where}: a ratio needs two non-negative numbers`)
  if (n > of) throw new VizError(`${where}: ${n} is more than its denominator ${of}`)
  return { value: of > 0 ? (n / of) * 100 : null, n, of }
}

const ratioText = (c) => (c.of > 0 ? `${fmtNum(c.n, decimalsOf([c.n]))}/${fmtNum(c.of, decimalsOf([c.of]))} ${fmtShare(c.n / c.of)}` : `${fmtNum(c.n)}/${fmtNum(c.of)}`)

// Options come from the data object (everything but its rows), overridden by command-line flags.
const options = (data, cli) => ({
  ...(Array.isArray(data) ? {} : Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'rows'))),
  ...Object.fromEntries(Object.entries(cli ?? {}).filter(([, v]) => v !== undefined)),
})

function footerParts(m, style, square) {
  const parts = []
  if (m.scaleText) parts.push(m.scaleText)
  if (square) parts.push(square)
  if (m.targetText) parts.push(`${style.target} ${m.targetText}`)
  if (m.source) parts.push(`source: ${plain(m.source)}`)
  if (m.asof) parts.push(`as of ${m.asof}`)
  return parts
}

function header(m, cols) {
  return m.title ? wrap(plain(m.title), cols) : []
}

function footer(m, cols, style = STYLES.plain, square = null) {
  const lines = []
  if (m.note) lines.push(...wrap(plain(m.note), cols))
  const parts = footerParts(m, style, square)
  if (parts.length) lines.push(...wrap(parts.join(' · '), cols))
  return lines
}

// A bar of `cols` cells drawn to scale with eighth-cell ends. The target mark sits
// behind the bars: it shows in empty cells, so a bar that passes it covers it.
export function barCells(frac, cols, targetFrac = null) {
  let s = ''
  if (frac != null) {
    const len = Math.max(0, Math.min(1, frac)) * cols
    let full = Math.floor(len + EPS)
    let rem = Math.round((len - full) * 8)
    if (rem === 8) { full += 1; rem = 0 }
    s = '█'.repeat(full) + EIGHTHS[rem]
    if (!s && frac > 0) s = '▏'
  }
  const cells = [...s]
  while (cells.length < cols) cells.push(' ')
  if (targetFrac != null) {
    const c = Math.min(cols - 1, Math.max(0, Math.floor(targetFrac * cols + EPS)))
    if (cells[c] === ' ') cells[c] = TARGET_MARK
  }
  return cells.join('')
}

// Emoji squares are two columns wide, so an emoji bar has half as many steps as a block
// bar has cells. Each square stands for one round unit: the scale over the squares that
// fit, rounded up to 1, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 times a power of ten, which loses at
// most a third of the width. A bar is its value in units rounded to the nearest whole
// square, and a nonzero value keeps at least one. The footer states the unit, so every
// bar still reads to scale, within half a square.
const SQUARE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
export function squareScale(max, cols) {
  const slots = Math.max(1, Math.floor(cols / 2))
  const x = max > 0 ? max / slots : 1
  const e = 10 ** Math.floor(Math.log10(x))
  const m = SQUARE_STEPS.find((k) => k * e >= x * (1 - EPS)) ?? 10
  return { slots, unit: Number((m * e).toPrecision(12)) }
}

export function squareCount(value, unit) {
  if (value == null) return 0
  const n = Math.round(Number((value / unit).toFixed(9)))
  return value > 0 && n === 0 ? 1 : n
}

// `cols` columns of squares; the target flag sits in the first empty square past the target.
export function squareBar(value, scale, glyph, cols, target = null, mark = STYLES.emoji.target) {
  const cells = Array(scale.slots).fill('  ')
  const n = Math.min(scale.slots, squareCount(value, scale.unit))
  for (let i = 0; i < n; i++) cells[i] = glyph
  if (target != null) {
    const t = Math.min(scale.slots - 1, Math.max(0, Math.floor(target / scale.unit + EPS)))
    if (cells[t] === '  ') cells[t] = mark
  }
  return padEnd(cells.join(''), cols)
}

export function squareText(unit, valueUnit) {
  const d = (String(unit).split('.')[1] ?? '').length
  return `1 square = ${fmtValue(unit, valueUnit, d)}`
}

// ---------- bars: one value per row ----------

export function barsModel(data, cli = {}) {
  const o = options(data, cli)
  const rows = rowsOf(data)
  if (!rows.length) throw new VizError('bars: no rows')
  const keys = keysOf(rows, data)
  const lk = labelKey(rows, keys, o)
  const ofKey = o.of ?? (keys.includes('of') ? 'of' : null)
  const vk = valueKey(rows, keys, o, [lk, ofKey].filter(Boolean))
  const ratio = Boolean(ofKey)
  const unit = ratio ? '%' : (o.unit ?? '')
  const items = rows.map((r, i) => {
    const where = `bars row ${i + 1} (${r[lk] ?? ''})`
    const value = numberOrNull(r[vk], where)
    if (value != null && value < 0) throw new VizError(`${where}: bars need values >= 0; use a table for signed changes`)
    const item = { label: String(r[lk] ?? ''), value, tone: r.tone ?? null, note: r.note ?? null }
    if (ratio) Object.assign(item, ratioCell(value == null ? null : { value, of: numberOrNull(r[ofKey], where) }, where))
    return item
  })
  const d = decimalsOf(items.map((r) => (ratio ? r.n : r.value)))
  const sum = items.reduce((s, r) => s + ((ratio ? r.n : r.value) ?? 0), 0)
  const total = o.total == null ? (o.share ? sum : null) : Number(o.total)
  if (total != null && !ratio) {
    if (sum > total + EPS) throw new VizError(`bars: rows sum to ${fmtNum(sum, d)} but the total is ${fmtNum(total, d)}; a part is double-counted or the total is wrong`)
    if (sum < total - EPS) items.push({ label: o.remainder ?? '(unaccounted)', value: total - sum, tone: 'dim', remainder: true })
  }
  if (o.sort) items.sort((a, b) => Number(Boolean(a.remainder)) - Number(Boolean(b.remainder)) || (b.value ?? -1) - (a.value ?? -1))
  const target = o.target == null ? null : Number(o.target)
  const values = items.map((r) => r.value).filter(isNum)
  const max = o.max != null ? Number(o.max) : unit === '%' && values.every((v) => v <= 100) ? 100 : Math.max(0, ...values, target ?? 0) || 1
  for (const r of items) if (r.value != null && r.value > max + EPS) throw new VizError(`bars: ${r.label} is ${r.value}, above the scale maximum ${max}`)
  for (const r of items) {
    r.frac = r.value == null ? null : r.value / max
    r.valueText = ratio ? (r.of > 0 || r.n != null ? `${fmtNum(r.n, decimalsOf([r.n]))}/${fmtNum(r.of, decimalsOf([r.of]))}` : 'n/a') : fmtValue(r.value, unit, d)
    r.shareText = ratio ? fmtShare(r.value == null ? null : r.value / 100) : total != null ? fmtShare(r.value / total) : null
  }
  return {
    kind: 'bars', title: o.title ?? null, note: o.note ?? null, source: o.source ?? null, asof: o.asof ?? null,
    unit, rows: items, max, ratio, total, totalText: total == null ? null : fmtTotal(total, unit, d),
    target, targetFrac: target == null ? null : target / max, targetText: target == null ? null : `${o.targetLabel ?? 'target'} ${fmtValue(target, unit, decimalsOf([target]))}`,
    scaleText: `scale 0–${fmtValue(max, unit, decimalsOf([max]))}${total != null && !ratio ? ` · total ${fmtTotal(total, unit, d)}` : ''}`,
  }
}

export function barsText(m, cols, style = STYLES.plain) {
  const lines = header(m, cols)
  const valueW = widest(m.rows.map((r) => r.valueText))
  const shareW = widest(m.rows.map((r) => r.shareText))
  const tail = 1 + valueW + (shareW ? 2 + shareW : 0)
  let labelW = Math.min(widest(m.rows.map((r) => r.label)), Math.max(8, Math.floor(cols * 0.4)))
  let barW = cols - labelW - 2 - tail
  if (barW < 10) { labelW = Math.max(6, labelW - (10 - barW)); barW = Math.max(4, cols - labelW - 2 - tail) }
  const sq = style.emoji ? squareScale(m.max, barW) : null
  for (const r of m.rows) {
    const label = wrap(r.label, labelW)
    const bar = sq ? squareBar(r.value, sq, squareOf(r.tone), barW, m.target, style.target) : barCells(r.frac, barW, m.targetFrac)
    const share = shareW ? '  ' + padStart(r.shareText ?? '', shareW) : ''
    lines.push(`${padEnd(label[0], labelW)}  ${bar} ${padStart(r.valueText, valueW)}${share}`.trimEnd())
    for (const more of label.slice(1)) lines.push(more)
  }
  return [...lines, ...footer(m, cols, style, sq && squareText(sq.unit, m.unit))].join('\n')
}

// ---------- grouped: several series per category ----------

export function groupedModel(data, cli = {}) {
  const o = options(data, cli)
  const rows = rowsOf(data)
  if (!rows.length) throw new VizError('grouped: no rows')
  const keys = keysOf(rows, data)
  const lk = labelKey(rows, keys, o)
  const series = (o.series ?? keys.filter((k) => k !== lk && !RESERVED.has(k) && rows.some((r) => r[k] != null && typeof r[k] !== 'string' ? true : /\//.test(r[k] ?? ''))))
    .map((s, i) => (typeof s === 'string' ? { key: s, label: s, index: i } : { key: s.key, label: s.label ?? s.key, tone: s.tone, index: i }))
  if (!series.length) throw new VizError('grouped: no numeric series columns')
  const categories = rows.map((r) => ({ label: String(r[lk] ?? ''), note: r.note ?? null }))
  const cells = rows.map((r, c) => series.map((s) => ratioCell(r[s.key], `grouped ${categories[c].label} ${s.key}`)))
  const ratio = cells.some((row) => row.some((cell) => cell.of != null))
  const unit = ratio ? '%' : (o.unit ?? '')
  const flat = cells.flat()
  const d = decimalsOf(flat.map((c) => c.value))
  const values = flat.map((c) => c.value).filter(isNum)
  if (values.some((v) => v < 0)) throw new VizError('grouped: values must be >= 0')
  const target = o.target == null ? null : Number(o.target)
  const top = Math.max(0, ...values, target ?? 0)
  const domain = o.max != null ? { max: Number(o.max), step: niceStep(Number(o.max) / 4) } : unit === '%' && top <= 100 ? { max: 100, step: 25 } : niceDomain(top)
  if (top > domain.max + EPS) throw new VizError(`grouped: a value of ${top} is above the scale maximum ${domain.max}`)
  for (const row of cells) for (const c of row) {
    c.frac = c.value == null ? null : c.value / domain.max
    c.text = c.of != null ? ratioText(c) : fmtValue(c.value, unit, d)
  }
  return {
    kind: 'grouped', title: o.title ?? null, note: o.note ?? null, source: o.source ?? null, asof: o.asof ?? null,
    unit, series, categories, cells, domain, ticks: ticksOf(domain).map((v) => ({ value: v, frac: v / domain.max, text: fmtValue(v, unit, decimalsOf([domain.step])) })),
    labels: o.labels ?? (categories.length * series.length <= 12 ? 'all' : 'none'),
    target, targetFrac: target == null ? null : target / domain.max, targetText: target == null ? null : `${o.targetLabel ?? 'target'} ${fmtValue(target, unit, decimalsOf([target]))}`,
    scaleText: `scale 0–${fmtValue(domain.max, unit, decimalsOf([domain.max]))}`,
  }
}

export function groupedText(m, cols, style = STYLES.plain) {
  const lines = header(m, cols)
  const catW = widest(m.categories.flatMap((c) => [c.label, c.note]))
  const serW = widest(m.series.map((s) => s.key))
  const valW = widest(m.cells.flat().map((c) => c.text))
  const barW = Math.max(6, cols - catW - 2 - serW - 2 - 1 - valW)
  const sq = style.emoji ? squareScale(m.domain.max, barW) : null
  m.categories.forEach((cat, c) => {
    const side = [cat.label, ...(cat.note ? wrap(cat.note, Math.max(catW, 1)) : [])]
    m.series.forEach((s, i) => {
      const cell = m.cells[c][i]
      const bar = sq ? squareBar(cell.value, sq, squareOf(s.tone, i), barW, m.target, style.target) : barCells(cell.frac, barW, m.targetFrac)
      lines.push(`${padEnd(side[i] ?? '', catW)}  ${padEnd(s.key, serW)}  ${bar} ${padStart(cell.text, valW)}`.trimEnd())
    })
    for (const extra of side.slice(m.series.length)) lines.push(extra)
  })
  const named = m.series.filter((s) => s.label !== s.key)
  if (named.length) lines.push(...wrap(named.map((s) => `${s.key} = ${plain(s.label)}`).join(' · '), cols))
  return [...lines, ...footer(m, cols, style, sq && squareText(sq.unit, m.unit))].join('\n')
}

// ---------- spark: one line per series ----------

export function sparkModel(data, cli = {}) {
  const o = options(data, cli)
  let series
  let categories = null
  if (Array.isArray(data.values)) series = [{ label: o.label ?? o.title ?? '', values: data.values }]
  else {
    const rows = rowsOf(data)
    if (!rows.length) throw new VizError('spark: no values')
    if (rows.every((r) => Array.isArray(r.values))) series = rows.map((r) => ({ label: String(r.label ?? ''), values: r.values }))
    else {
      const keys = keysOf(rows, data)
      const lk = keys.find((k) => rows.some((r) => typeof r[k] === 'string'))
      if (lk) categories = rows.map((r) => String(r[lk] ?? ''))
      const numeric = o.value ? [o.value] : keys.filter((k) => k !== lk && !RESERVED.has(k) && rows.some((r) => isNum(r[k])))
      if (!numeric.length) throw new VizError('spark: no numeric column')
      series = numeric.map((k) => ({ label: k, values: rows.map((r) => r[k]) }))
    }
  }
  const unit = o.unit ?? ''
  const out = series.map((s) => {
    const values = s.values.map((v, i) => numberOrNull(v, `spark ${s.label} value ${i + 1}`))
    const present = values.filter(isNum)
    if (!present.length) throw new VizError(`spark ${s.label}: every value is missing`)
    const d = decimalsOf(present)
    const min = Math.min(...present)
    const max = Math.max(...present)
    const lo = o.zero ? Math.min(0, min) : min
    const levels = values.map((v) => (v == null ? null : max === lo ? 3 : Math.round(((v - lo) / (max - lo)) * 7)))
    const first = present[0]
    const last = present.at(-1)
    return {
      label: s.label, values, levels, lo, hi: max, n: present.length, missing: values.length - present.length,
      firstText: fmtValue(first, unit, d), lastText: fmtValue(last, unit, d), minText: fmtValue(min, unit, d), maxText: fmtValue(max, unit, d),
      summary: `${fmtValue(first, unit, d)}→${fmtValue(last, unit, d)} · min ${fmtValue(min, unit, d)} · max ${fmtValue(max, unit, d)} · n=${present.length}${values.length > present.length ? ` (${values.length - present.length} missing)` : ''}`,
    }
  })
  return {
    kind: 'spark', title: o.title ?? null, note: o.note ?? null, source: o.source ?? null, asof: o.asof ?? null, unit, series: out, categories,
    scaleText: o.zero ? 'each line scaled from 0 to its max' : out.length > 1 ? 'each line scaled to its own min–max' : null,
  }
}

export function sparkText(m, cols, style = STYLES.plain) {
  const lines = header(m, cols)
  // In emoji mode several lines each lead with their series square, as grouped bars do.
  const lead = style.emoji && m.series.length > 1
  const labelW = widest(m.series.map((s) => s.label)) + (lead ? 3 : 0)
  m.series.forEach((s, i) => {
    const label = lead ? `${squareOf(null, i)} ${s.label}` : s.label
    // The summary shares the spark's line when both fit; otherwise it wraps underneath.
    const inline = cols - labelW - 4 - width(s.summary) >= Math.min(s.levels.length, 8)
    const room = Math.max(4, inline ? cols - labelW - 4 - width(s.summary) : cols - labelW - 2)
    let glyphs = s.levels.map((l) => (l == null ? ' ' : SPARKS[l]))
    let clipped = ''
    if (glyphs.length > room) { clipped = ` (last ${room - 1} of ${glyphs.length})`; glyphs = ['…', ...glyphs.slice(-(room - 1))] }
    if (inline && !clipped) lines.push(`${padEnd(label, labelW)}  ${glyphs.join('')}  ${s.summary}`.trimEnd())
    else {
      lines.push(`${padEnd(label, labelW)}  ${glyphs.join('')}`.trimEnd())
      for (const l of wrap(s.summary + clipped, Math.max(10, cols - labelW - 2))) lines.push(`${padEnd('', labelW)}  ${l}`)
    }
  })
  if (m.categories?.length) lines.push(`${padEnd('', labelW)}  ${m.categories[0]} → ${m.categories.at(-1)}`.trimEnd())
  return [...lines, ...footer(m, cols)].join('\n')
}

// ---------- strip: pass/fail cells on a time axis ----------

const STATUS = {
  ok: ['ok', 'pass', 'passed', 'success', 'succeeded', 'green', 'up', 'true', '✓', 'good', 'yes'],
  fail: ['fail', 'failed', 'failure', 'error', 'red', 'down', 'false', '✗', 'bad', 'no'],
  warn: ['warn', 'warning', 'partial', 'degraded', 'flaky', 'slow', '!'],
  skip: ['skip', 'skipped', '-'],
}
export function statusOf(v, where) {
  if (v === null || v === undefined || v === '' || v === 'unknown') return 'unknown'
  if (v === true || v === 1) return 'ok'
  if (v === false || v === 0) return 'fail'
  const s = String(v).toLowerCase()
  for (const [k, words] of Object.entries(STATUS)) if (words.includes(s)) return k
  throw new VizError(`${where}: unknown status ${JSON.stringify(v)} (use ok, fail, warn, skip or null)`)
}

// Regularly spaced axis labels that never overlap; the last cell is always labeled.
export function axisIndices(count, cellW, labelW) {
  if (!count) return []
  const every = Math.max(1, Math.ceil((labelW + 1) / cellW))
  const picks = []
  for (let i = 0; i < count; i += every) picks.push(i)
  const last = count - 1
  if (picks.at(-1) !== last) {
    while (picks.length && (last - picks.at(-1)) * cellW < labelW + 1) picks.pop()
    picks.push(last)
  }
  return picks
}

export function stripModel(data, cli = {}) {
  const o = options(data, cli)
  const rows = rowsOf(data)
  if (!rows.length) throw new VizError('strip: no rows')
  const keys = keysOf(rows, data)
  const tk = o.t ?? ['t', 'time', 'at', 'label'].find((k) => keys.includes(k)) ?? keys[0]
  const sk = o.status ?? ['status', 'ok', 'pass', 'result', 'value'].find((k) => keys.includes(k)) ?? keys[1]
  const cells = rows.map((r, i) => {
    const status = statusOf(r[sk], `strip row ${i + 1}`)
    return { t: String(r[tk] ?? ''), status, glyph: GLYPHS[status], note: r.note ?? null }
  })
  const count = (k) => cells.filter((c) => c.status === k).length
  const n = cells.length
  let best = null
  for (let i = 0; i < n;) {
    if (cells[i].status !== 'fail') { i++; continue }
    let j = i
    while (j + 1 < n && cells[j + 1].status === 'fail') j++
    if (!best || j - i + 1 > best.len) best = { from: i, to: j, len: j - i + 1 }
    i = j + 1
  }
  const parts = [`pass ${count('ok')} of ${n} (${fmtShare(count('ok') / n)})`, `fail ${count('fail')}`]
  for (const k of ['warn', 'skip', 'unknown']) if (count(k)) parts.push(`${k} ${count(k)}`)
  if (best) {
    const next = cells.slice(best.to + 1).find((c) => c.status === 'ok')
    parts.push(`longest fail run ${best.len}: ${cells[best.from].t}→${cells[best.to].t}${next ? `, next pass ${next.t}` : ', no pass since'}`)
  }
  const notes = cells.filter((c) => c.note).map((c) => `${c.t} ${plain(c.note)}`)
  return { kind: 'strip', title: o.title ?? null, note: o.note ?? null, source: o.source ?? null, asof: o.asof ?? null, cells, run: best, summary: parts.join(' · '), notes }
}

export function stripText(m, cols, style = STYLES.plain) {
  const lines = header(m, cols)
  const labelW = widest(m.cells.map((c) => c.t))
  // Every cell takes two columns: a glyph and a space, or one two-column emoji.
  const perLine = style.emoji
    ? Math.max(4, Math.min(Math.floor(cols / 2), Math.floor((cols - labelW) / 2) + 1))
    : Math.max(4, Math.floor((cols - labelW) / 2) + 1)
  for (let start = 0; start < m.cells.length; start += perLine) {
    const chunk = m.cells.slice(start, start + perLine)
    lines.push(chunk.map((c) => style.strip[c.status]).join(style.emoji ? '' : ' '))
    const axis = []
    for (const i of axisIndices(chunk.length, 2, labelW)) {
      const label = [...chunk[i].t]
      while (axis.length < i * 2) axis.push(' ')
      axis.splice(i * 2, label.length, ...label)
    }
    lines.push(axis.join('').trimEnd())
  }
  lines.push(...wrap(m.summary, cols))
  if (m.notes.length) lines.push(...wrap(`notes: ${m.notes.join(' · ')}`, cols))
  return [...lines, ...footer(m, cols, style)].join('\n')
}

// ---------- stack and waterfall: parts of a whole, in order ----------

export function stackModel(data, cli = {}, kind = 'stack') {
  const o = options(data, cli)
  const rows = rowsOf(data)
  if (!rows.length) throw new VizError(`${kind}: no rows`)
  const keys = keysOf(rows, data)
  const lk = labelKey(rows, keys, o)
  const vk = valueKey(rows, keys, o, [lk])
  const unit = o.unit ?? ''
  const parts = rows.map((r, i) => {
    const value = numberOrNull(r[vk], `${kind} row ${i + 1} (${r[lk] ?? ''})`)
    if (value == null || value < 0) throw new VizError(`${kind} row ${i + 1} (${r[lk] ?? ''}): parts need a value >= 0`)
    return { label: String(r[lk] ?? ''), value, group: r.group ?? null, tone: r.tone ?? null }
  })
  const d = decimalsOf(parts.map((p) => p.value).concat(o.total ?? []))
  const sum = parts.reduce((s, p) => s + p.value, 0)
  const span = o.start != null && o.end != null ? minutesBetween(o.start, o.end) : null
  if (o.start != null && o.end != null && span == null) throw new VizError(`${kind}: start and end must be HH:MM or ISO times`)
  if (span != null && o.total != null && Math.abs(span - Number(o.total)) > EPS) throw new VizError(`${kind}: ${o.start}→${o.end} is ${fmtNum(span)} minutes but the total says ${o.total}`)
  if (span != null && !isMinutes(unit)) throw new VizError(`${kind}: start and end need unit m`)
  const whole = o.total != null ? Number(o.total) : span
  if (whole != null) {
    if (sum > whole + 1e-6) throw new VizError(`${kind}: parts sum to ${fmtValue(sum, unit, d)} but the whole is ${fmtValue(whole, unit, d)}; overlapping spans were added or a part is wrong`)
    if (sum < whole - 1e-6) parts.push({ label: o.remainder ?? 'unattributed', value: whole - sum, group: o.remainder ?? 'unattributed', tone: 'dim', remainder: true })
  }
  const total = whole ?? sum
  if (!(total > 0)) throw new VizError(`${kind}: the parts sum to zero`)
  const groups = []
  let cum = 0
  for (const p of parts) {
    p.startFrac = cum / total
    cum += p.value
    p.endFrac = cum / total
    p.valueText = fmtTotal(p.value, unit, d)
    p.shareText = fmtShare(p.value / total)
    p.range = o.start != null && isMinutes(unit) ? `${clockAfter(o.start, total * p.startFrac)}–${clockAfter(o.start, total * p.endFrac)}` : null
    if (p.group != null) {
      let g = groups.find((x) => x.name === p.group)
      if (!g) groups.push((g = { name: p.group, value: 0, index: groups.length }))
      g.value += p.value
      p.groupIndex = g.index
    }
  }
  for (const g of groups) { g.valueText = fmtTotal(g.value, unit, d); g.shareText = fmtShare(g.value / total) }
  const totalText = fmtTotal(total, unit, d)
  return {
    kind, title: o.title ?? null, note: o.note ?? null, source: o.source ?? null, asof: o.asof ?? null, unit, parts, total, totalText,
    start: o.start ?? null, end: o.end ?? (o.start != null && isMinutes(unit) ? clockAfter(o.start, total) : null),
    groups: groups.length && parts.some((p) => p.group == null) ? [] : groups,
    summary: `total ${totalText} · ${parts.length} parts${o.start != null && isMinutes(unit) ? ` · ${o.start}→${o.end ?? clockAfter(o.start, total)}` : ''}`,
    groupSummary: groups.length && parts.every((p) => p.group != null) ? `by group: ${groups.map((g) => `${g.name} ${g.valueText} ${g.shareText}`).join(' · ')}` : null,
  }
}

// Cell boundaries come from rounded cumulative positions, so the parts tile the bar exactly.
function spanCells(p, cols) {
  let a = Math.round(p.startFrac * cols)
  let b = Math.round(p.endFrac * cols)
  if (b <= a && p.value > 0) { b = Math.min(cols, a + 1); a = b - 1 }
  return [a, b]
}

function partLines(m, cols, glyphFor) {
  const labelW = Math.min(widest(m.parts.map((p) => p.label)), Math.max(8, Math.floor(cols * 0.35)))
  const valW = widest(m.parts.map((p) => p.valueText))
  const shareW = widest(m.parts.map((p) => p.shareText))
  const rangeW = widest(m.parts.map((p) => p.range))
  return { labelW, valW, shareW, rangeW, tail: (r) => `${padStart(r.valueText, valW)}  ${padStart(r.shareText, shareW)}${rangeW ? '  ' + padEnd(r.range ?? '', rangeW) : ''}`, glyphFor }
}

export function stackText(m, cols, style = STYLES.plain) {
  const lines = header(m, cols)
  // Emoji parts take a tone's color when they have one, else their group's or their own.
  const glyph = style.emoji ? (p, i) => squareOf(p.tone, p.groupIndex ?? i) : (p, i) => FILLS[(p.groupIndex ?? i) % FILLS.length]
  const sq = style.emoji ? squareScale(m.total, cols) : null
  const n = sq ? squareCount(m.total, sq.unit) : cols
  const cells = Array(n).fill(sq ? '  ' : ' ')
  m.parts.forEach((p, i) => { const [a, b] = spanCells(p, n); for (let c = a; c < b; c++) cells[c] = glyph(p, i) })
  lines.push(cells.join('').trimEnd())
  const L = partLines(m, cols)
  const tailW = width(L.tail(m.parts[0]))
  const gw = width(glyph(m.parts[0], 0))
  const ind = ' '.repeat(gw + 1)
  const stacked = gw + 1 + L.labelW + 2 + tailW > cols
  m.parts.forEach((p, i) => {
    const label = wrap(p.label, stacked ? cols - gw - 1 : L.labelW)
    lines.push(`${glyph(p, i)} ${stacked ? label[0] : padEnd(label[0], L.labelW) + '  ' + L.tail(p)}`.trimEnd())
    for (const more of label.slice(1)) lines.push(`${ind}${more}`)
    if (stacked) for (const l of wrap(L.tail(p).trim().replace(/\s{2,}/g, ' · '), cols - gw - 1)) lines.push(`${ind}${l}`)
  })
  lines.push(...wrap(m.summary, cols))
  if (m.groupSummary) lines.push(...wrap(m.groupSummary, cols))
  return [...lines, ...footer(m, cols, style, sq && squareText(sq.unit, m.unit))].join('\n')
}

export function waterfallText(m, cols, style = STYLES.plain) {
  const lines = header(m, cols)
  const L = partLines(m, cols)
  const tailW = width(L.tail(m.parts[0]))
  // When value, share and range cannot sit beside a readable bar, they move under it.
  const stacked = cols - L.labelW - 4 - tailW < 12
  const labelW = stacked ? Math.min(L.labelW, Math.max(6, Math.floor(cols * 0.35))) : L.labelW
  const barW = stacked ? Math.max(6, cols - labelW - 2) : cols - labelW - 4 - tailW
  const sq = style.emoji ? squareScale(m.total, barW) : null
  const n = sq ? squareCount(m.total, sq.unit) : barW
  for (const p of m.parts) {
    const [a, b] = spanCells(p, n)
    const bar = sq
      ? padEnd('  '.repeat(a) + squareOf(p.tone, p.groupIndex ?? 0).repeat(b - a), barW)
      : ' '.repeat(a) + '█'.repeat(b - a) + ' '.repeat(barW - b)
    const label = wrap(p.label, labelW)
    lines.push(`${padEnd(label[0], labelW)}  ${bar}${stacked ? '' : '  ' + L.tail(p)}`.trimEnd())
    for (const more of label.slice(1)) lines.push(more)
    if (stacked) for (const l of wrap(L.tail(p).trim().replace(/\s{2,}/g, ' · '), cols - 2)) lines.push(`  ${l}`)
  }
  lines.push(...wrap(m.summary, cols))
  if (m.groupSummary) lines.push(...wrap(m.groupSummary, cols))
  return [...lines, ...footer(m, cols, style, sq && squareText(sq.unit, m.unit))].join('\n')
}

// ---------- timeline: events with the gap since the previous one ----------

const EVENT_GLYPH = { bad: '✗', fail: '✗', good: '✓', ok: '✓', warn: '!', info: '•' }

export function timelineModel(data, cli = {}) {
  const o = options(data, cli)
  const rows = rowsOf(data)
  if (!rows.length) throw new VizError('timeline: no rows')
  const keys = keysOf(rows, data)
  const tk = o.t ?? ['t', 'time', 'at'].find((k) => keys.includes(k)) ?? keys[0]
  const xk = o.text ?? ['text', 'event', 'label'].find((k) => keys.includes(k)) ?? keys[1]
  let prev = null
  let first = null
  let last = null
  let span = 0
  const events = rows.map((r) => {
    const t = String(r[tk] ?? '')
    let gapText = ''
    const parsed = parseTime(t)
    if (parsed) {
      const gap = prev ? minutesBetween(prev, t) : null
      if (gap != null) {
        gapText = `+${fmtDuration(gap)}`
        span += gap
      } else if (!prev) first = t
      prev = t
      last = t
    }
    const status = r.status ?? r.tone ?? null
    if (status != null && !(status in EVENT_GLYPH)) throw new VizError(`timeline ${t}: unknown status ${JSON.stringify(status)} (use good, bad, warn or info)`)
    return { t, gapText, status, glyph: EVENT_GLYPH[status] ?? '•', text: String(r[xk] ?? '') }
  })
  const summary = `${events.length} events${first && last && first !== last ? ` · ${first}→${last} (${fmtDuration(span)})` : ''}`
  return { kind: 'timeline', title: o.title ?? null, note: o.note ?? null, source: o.source ?? null, asof: o.asof ?? null, events, summary, columns: o.columns ?? 1 }
}

export function timelineText(m, cols, style = STYLES.plain) {
  const lines = header(m, cols)
  const tW = widest(m.events.map((e) => e.t))
  const gW = widest(m.events.map((e) => e.gapText))
  const glyph = (e) => (style.emoji ? DOT[e.status] ?? '⚪' : e.glyph)
  const indent = tW + 2 + (gW ? gW + 2 : 0) + (style.emoji ? 3 : 2)
  for (const e of m.events) {
    const body = wrap(plain(e.text), Math.max(10, cols - indent))
    lines.push(`${padEnd(e.t, tW)}  ${gW ? padStart(e.gapText, gW) + '  ' : ''}${glyph(e)} ${body[0]}`.trimEnd())
    for (const more of body.slice(1)) lines.push(' '.repeat(indent) + more)
  }
  lines.push(m.summary)
  return [...lines, ...footer(m, cols, style)].join('\n')
}

// ---------- table ----------

// A cell is text, a number, a boolean, null, {pill, tone}, {text, tone} or a list of those.
// Emoji mode draws booleans as ✅/❌ and a toned cell with its status dot; null keeps the text.
function emojiCell(v) {
  if (v === true) return '✅'
  if (v === false) return '❌'
  if (Array.isArray(v)) return v.map((x) => emojiCell(x) ?? cellText(x)).join(' ')
  if (v && typeof v === 'object' && DOT[v.tone]) return `${DOT[v.tone]} ${v.pill != null ? plain(v.pill) : plain(v.text ?? '')}`
  return null
}

export function cellText(v) {
  if (v === null || v === undefined) return '—'
  if (v === true) return '✓'
  if (v === false) return '✗'
  if (Array.isArray(v)) return v.map(cellText).join(' ')
  if (typeof v === 'object') return v.pill != null ? `[${plain(v.pill)}]` : plain(v.text ?? '')
  return plain(v)
}

export function tableModel(data, cli = {}) {
  const o = options(data, cli)
  const rows = rowsOf(data)
  const cols = o.cols ? String(o.cols).split(',').map((c) => c.trim()) : null
  let columns
  if (cols) columns = cols.map((k) => ({ key: k, label: k }))
  else if (Array.isArray(data.columns)) columns = data.columns.map((c) => (typeof c === 'string' ? { key: c, label: c } : { key: c.key, label: c.label ?? c.key, align: c.align }))
  else columns = keysOf(rows, data).map((k) => ({ key: k, label: k }))
  for (const c of columns) {
    const vals = rows.map((r) => r[c.key]).filter((v) => v !== null && v !== undefined)
    c.summable = vals.length > 0 && vals.every(isNum)
    c.numeric = c.align ? c.align === 'right' : c.summable
    c.decimals = c.summable ? decimalsOf(vals) : 0
  }
  const fmt = (c, v) => (isNum(v) ? fmtNum(v, c.decimals) : cellText(v))
  const body = rows.map((r) => columns.map((c) => ({ raw: r[c.key], text: fmt(c, r[c.key]) })))
  let sum = null
  if (o.sum) {
    sum = columns.map((c, i) => {
      if (c.summable) return { raw: null, text: fmtNum(rows.reduce((s, r) => s + (isNum(r[c.key]) ? r[c.key] : 0), 0), c.decimals) }
      return { raw: null, text: i === 0 ? 'total' : '' }
    })
  }
  return { kind: 'table', title: o.title ?? null, note: o.note ?? null, source: o.source ?? null, asof: o.asof ?? null, columns, rows: body, sum, header: o.header !== false }
}

export function tableText(m, cols, style = STYLES.plain) {
  const lines = header(m, cols)
  const rows = style.emoji ? m.rows.map((r) => r.map((c) => ({ ...c, text: emojiCell(c.raw) ?? c.text }))) : m.rows
  const all = [...rows, ...(m.sum ? [m.sum] : [])]
  const widths = m.columns.map((c, i) => Math.max(m.header ? width(c.label) : 0, ...all.map((r) => width(r[i].text))))
  const gap = 2
  const fit = () => widths.reduce((s, w) => s + w, 0) + gap * (widths.length - 1)
  while (fit() > cols) {
    let k = -1
    widths.forEach((w, i) => { if (!m.columns[i].numeric && w > 6 && (k < 0 || w > widths[k])) k = i })
    if (k < 0) break
    widths[k] -= 1
  }
  const line = (cells) => {
    const wrapped = cells.map((cell, i) => (m.columns[i].numeric ? [cell] : wrap(cell, widths[i])))
    const height = Math.max(...wrapped.map((w) => w.length))
    const out = []
    for (let h = 0; h < height; h++) {
      out.push(wrapped.map((w, i) => (m.columns[i].numeric ? padStart(w[h] ?? '', widths[i]) : padEnd(w[h] ?? '', widths[i]))).join(' '.repeat(gap)).trimEnd())
    }
    return out
  }
  if (m.header) {
    lines.push(...line(m.columns.map((c) => c.label)))
    lines.push(widths.map((w) => '─'.repeat(w)).join(' '.repeat(gap)))
  }
  for (const r of rows) lines.push(...line(r.map((c) => c.text)))
  if (m.sum) {
    lines.push(widths.map((w) => '─'.repeat(w)).join(' '.repeat(gap)))
    lines.push(...line(m.sum.map((c) => c.text)))
  }
  return [...lines, ...footer(m, cols)].join('\n')
}

// ---------- dispatch ----------

export const KINDS = {
  bars: [barsModel, barsText],
  grouped: [groupedModel, groupedText],
  spark: [sparkModel, sparkText],
  strip: [stripModel, stripText],
  stack: [(d, o) => stackModel(d, o, 'stack'), stackText],
  waterfall: [(d, o) => stackModel(d, o, 'waterfall'), waterfallText],
  timeline: [timelineModel, timelineText],
  table: [tableModel, tableText],
}

export function render(kind, data, opts = {}, cols = 80, style = STYLES.plain) {
  const entry = KINDS[kind]
  if (!entry) throw new VizError(`unknown chart kind ${kind}`)
  return entry[1](entry[0](data, opts), Math.max(30, cols), style)
}
