// Brief specs: check them, attach chart models, and render the page or the terminal view.
//
// A brief is the JSON spec the report skill's brief kit draws
// (claude/skills/report/assets/brief-kit.html). The builder computes every chart's
// numbers here, with the same models `viz` prints in a terminal, and embeds them in
// the page; the page's script only lays them out. So `viz brief spec.json` and the
// published page state the same values.
import { readFileSync } from 'node:fs'
import * as core from './core.mjs'

const KIT = new URL('../../skills/report/assets/brief-kit.html', import.meta.url)

const BLOCKS = new Set(['text', 'callout', 'cols', 'board', 'tiles', 'hist', 'hbars', 'stack', 'dots', 'heatmap',
  'timeline', 'steps', 'table', 'bets', 'decisions', 'grouped', 'strip', 'waterfall', 'events'])
const CHARTS = new Set(['hist', 'hbars', 'stack', 'dots', 'heatmap', 'timeline', 'grouped', 'strip', 'waterfall', 'events'])
const TONES = new Set(['good', 'warn', 'serious', 'crit', 'blind', 'accent'])
const TEXT_TONES = new Set(['bad', 'ok', 'warn'])
// Status tones a viz model uses, mapped to the kit's tones.
const MODEL_TONE = { good: 'good', ok: 'good', warn: 'warn', serious: 'serious', bad: 'crit', crit: 'crit', fail: 'crit', dim: 'blind', blind: 'blind', accent: 'accent', info: 'accent' }

const MAX_SERIES = 3
const MODEL_BLOCKS = new Set(['grouped', 'strip', 'waterfall', 'events'])

function htmlText(s) {
  return String(s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}

function toneOk(t, allowed) {
  return t === undefined || t === null || allowed.has(t)
}

// Build the viz model a chart block draws from; throws VizError on data that does not reconcile.
function modelFor(b) {
  switch (b.type) {
    case 'hbars': {
      if (!Array.isArray(b.rows) || !b.rows.every((r) => Array.isArray(r) && r.length >= 2)) throw new core.VizError('hbars rows must be [label, value, inner?, tip?]')
      const hot = new Set(b.hot ?? [])
      const rows = b.rows.map(([label, value]) => ({ label: String(label), value, tone: hot.has(label) ? 'crit' : null }))
      const m = core.barsModel({ rows }, { unit: b.suffix != null ? undefined : b.unit, total: b.total, target: b.target, targetLabel: b.targetLabel, max: b.max, sort: b.sort, remainder: b.remainder })
      const d = core.decimalsOf(rows.map((r) => r.value))
      m.rows.forEach((r, i) => {
        const src = b.rows[i]
        if (!src) return
        if (b.suffix != null) r.valueText = core.fmtNum(r.value, d) + b.suffix
        if (src[2] != null) r.innerFrac = src[2] / m.max
        r.tip = src[3] ?? null
      })
      return m
    }
    case 'stack': {
      const rows = (b.parts ?? []).map((p) => (Array.isArray(p) ? { label: p[0], value: p[1], tone: p[2] ?? null } : p))
      return core.stackModel({ rows }, { unit: b.unit, total: b.total, remainder: b.remainder }, 'stack')
    }
    case 'hist': {
      const values = b.values ?? []
      if (!values.length) throw new core.VizError('hist needs values')
      if (b.labels && b.labels.length !== values.length) throw new core.VizError('hist labels and values differ in length')
      const rows = values.map((v, i) => ({ label: String((b.labels ?? [])[i] ?? i + 1), value: v }))
      return core.barsModel({ rows }, { unit: b.unit, max: b.max })
    }
    case 'grouped': {
      const m = core.groupedModel(b, {})
      if (m.series.length > MAX_SERIES) throw new core.VizError(`grouped has ${m.series.length} series; past ${MAX_SERIES} colors stop separating, so facet the chart or fold the rest into "other"`)
      return m
    }
    case 'strip': return core.stripModel(b, {})
    case 'waterfall': return core.stackModel(b, {}, 'waterfall')
    case 'events': return core.timelineModel(b, {})
    default: return null
  }
}

// Models speak viz's tone words (bad, dim, info); the page draws only the kit's status tones.
function kitTones(m) {
  for (const x of [...(m.rows ?? []), ...(m.parts ?? []), ...(m.series ?? [])]) if (x.tone) x.tone = MODEL_TONE[x.tone]
  for (const e of m.events ?? []) e.status = MODEL_TONE[e.status] ?? 'blind'
  return m
}

function walk(blocks, where, errors, warnings, seen) {
  if (!Array.isArray(blocks)) { errors.push(`${where}: blocks must be a list`); return }
  blocks.forEach((b, i) => {
    const at = `${where}[${i}]`
    const t = b?.type
    if (!BLOCKS.has(t)) { errors.push(`${at}: unknown block type ${JSON.stringify(t)}`); return }
    seen.add(t)
    if (t === 'cols') walk(b.blocks ?? [], `${at}.blocks`, errors, warnings, seen)
    if (t === 'heatmap') for (const r of b.rows ?? []) if ((r.cells ?? []).length > (b.cols ?? 0)) errors.push(`${at}: heatmap row ${JSON.stringify(r.label)} has more cells than cols`)
    if ((t === 'dots' || t === 'timeline') && !(b.start && b.end)) errors.push(`${at}: ${t} needs ISO start and end`)
    // Tiles color their number like text (bad/ok/warn); every other block uses status tones.
    const allowed = t === 'tiles' ? TEXT_TONES : MODEL_BLOCKS.has(t) ? new Set(Object.keys(MODEL_TONE)) : TONES
    for (const key of ['rows', 'items', 'points']) {
      for (const x of b[key] ?? []) if (x && typeof x === 'object' && !Array.isArray(x) && !toneOk(x.tone, allowed)) errors.push(`${at}: unknown tone ${JSON.stringify(x.tone)} for ${t}`)
    }
    for (const p of t === 'stack' ? b.parts ?? [] : []) {
      const tone = Array.isArray(p) ? p[2] : p?.tone
      if (!toneOk(tone, TONES)) errors.push(`${at}: unknown tone ${JSON.stringify(tone)} for stack`)
    }
    if (t === 'bets') {
      for (const [j, x] of (b.items ?? []).entries()) {
        const missing = ['premortem', 'target'].filter((k) => !x[k])
        if (missing.length) warnings.push(`${at}.items[${j}] ${JSON.stringify(x.title ?? '')}: no ${missing.join(' or ')}; a proposal needs a number to beat and a pre-mortem`)
      }
    }
    try {
      const model = modelFor(b)
      if (model) b.model = kitTones(model)
    } catch (error) {
      if (!(error instanceof core.VizError)) throw error
      errors.push(`${at} (${t}${b.title ? ` "${b.title}"` : ''}): ${error.message}`)
    }
  })
}

// Check a spec and attach chart models. Errors block rendering; warnings name missing climb parts.
export function prepareBrief(input) {
  const spec = structuredClone(input)
  const errors = []
  const warnings = []
  const seen = new Set()
  for (const k of ['title', 'thesis', 'sections']) if (!spec[k] || (Array.isArray(spec[k]) && !spec[k].length)) errors.push(`missing ${k}`)
  if (spec.title && String(spec.title).trim().split(/\s+/).length > 5) warnings.push(`title has more than five words; an artifact title is a name of two to four words`)
  ;(spec.sections ?? []).forEach((sec, i) => {
    if (!sec.title) errors.push(`sections[${i}]: missing title`)
    walk(sec.blocks ?? [], `sections[${i}].blocks`, errors, warnings, seen)
  })
  for (const x of spec.stats ?? []) if (!toneOk(x.tone, TEXT_TONES)) errors.push(`stats: unknown tone ${JSON.stringify(x.tone)}`)
  if (!spec.hill) warnings.push('no hill: name the metric, baseline, target and owner this brief moves')
  if (!spec.method) warnings.push('no method: state each source, query, window and denominator')
  if (![...seen].some((t) => CHARTS.has(t))) warnings.push('no chart: a brief with more than one dimension shows its shape')
  if (!seen.has('decisions')) warnings.push('no decisions block: state what the reader must decide, or say none')
  return { spec, errors, warnings }
}

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function briefHtml(prepared) {
  const kit = readFileSync(KIT, 'utf8')
  // `<` is escaped so no string in the spec can close the script element that carries it.
  const body = JSON.stringify(prepared).replace(/</g, '\\u003c')
  return kit.replace('__TITLE__', () => escHtml(prepared.title ?? 'Brief')).replace('__SPEC__', () => body)
}

// ---------- terminal view ----------

const STATE_GLYPH = { good: '✓', done: '✓', ok: '✓', crit: '✗', block: '✗', serious: '!', warn: '!', wait: '…', you: '→', blind: '·', accent: '•' }
const rule = (label, cols) => {
  const head = `── ${label} `
  return head + '─'.repeat(Math.max(3, cols - core.width(head)))
}
const para = (text, cols, indent = '') => core.wrap(htmlText(text), cols - indent.length).map((l) => (indent + l).trimEnd())
const indented = (text, cols, indent = '  ') => core.wrap(text, cols - indent.length).map((l) => indent + l)
const titled = (b, cols) => [...(b.title ? core.wrap(htmlText(b.title), cols) : []), ...(b.sub ? para(b.sub, cols) : [])]
const noted = (b, cols) => (b.note ? para(b.note, cols) : [])

function blockText(b, cols) {
  const m = b.model
  const out = []
  const chart = (text) => text.split('\n')
  switch (b.type) {
    case 'text': out.push(...para(b.html, cols)); break
    case 'callout': out.push(...para(b.html, cols, '│ ')); break
    case 'cols': for (const x of b.blocks ?? []) { out.push(...blockText(x, cols), ''); } out.pop(); break
    case 'board':
      for (const r of b.rows ?? []) {
        out.push(...core.wrap(`${STATE_GLYPH[r.tone] ?? '•'} [${r.chip ?? r.tone ?? ''}] ${r.title}${r.when ? ` (${r.when})` : ''}`, cols))
        if (r.text) out.push(...para(r.text, cols, '  '))
        if (r.owner || r.next) out.push(...indented(`owner ${r.owner ?? 'none'}${r.next ? ` · next: ${htmlText(r.next)}` : ''}`, cols))
      }
      break
    case 'tiles': {
      const rows = (b.items ?? []).map((x) => ({ name: x.name, value: `${x.value}${x.unit ? ' ' + x.unit : ''}`, tier: x.tiers ? x.tiers.map((t, i) => (i === x.on ? `[${t}]` : t)).join(' ') : '', note: htmlText(x.fine ?? '') }))
      const cols4 = ['name', 'value', 'tier', 'note'].filter((k) => rows.some((r) => r[k]))
      out.push(...chart(core.tableText(core.tableModel({ rows, columns: cols4 }, { header: false }), cols)))
      break
    }
    case 'hist': out.push(...titled(b, cols), ...chart(core.barsText({ ...m, title: null }, cols)), ...noted(b, cols)); break
    case 'hbars': {
      out.push(...titled(b, cols), ...chart(core.barsText({ ...m, title: null }, cols)))
      const tips = m.rows.filter((r) => r.tip).map((r) => `${r.label}: ${htmlText(r.tip)}`)
      if (tips.length) out.push(...core.wrap(tips.join(' · '), cols))
      const inner = (b.rows ?? []).filter((r) => r[2] != null).map((r) => `${r[0]} ${core.fmtNum(r[2], core.decimalsOf([r[2]]))}`)
      if (inner.length) out.push(...core.wrap(`inner marks: ${inner.join(' · ')}`, cols))
      out.push(...noted(b, cols))
      break
    }
    case 'stack': out.push(...titled(b, cols), ...chart(core.stackText({ ...m, title: null }, cols)), ...noted(b, cols)); break
    case 'grouped': out.push(...titled(b, cols), ...chart(core.groupedText({ ...m, title: null, note: null }, cols)), ...noted(b, cols)); break
    case 'strip': out.push(...titled(b, cols), ...chart(core.stripText({ ...m, title: null, note: null }, cols)), ...noted(b, cols)); break
    case 'waterfall': out.push(...titled(b, cols), ...chart(core.waterfallText({ ...m, title: null, note: null }, cols)), ...noted(b, cols)); break
    case 'events': out.push(...titled(b, cols), ...chart(core.timelineText({ ...m, title: null, note: null, events: m.events.map((e) => ({ ...e, text: htmlText(e.text) })) }, cols)), ...noted(b, cols)); break
    case 'dots': {
      out.push(...titled(b, cols))
      const rows = (b.points ?? []).map((p) => ({ t: p.t, y: p.y ?? null, state: p.tone ?? '', tip: htmlText(p.tip ?? '') }))
      out.push(...chart(core.tableText(core.tableModel({ rows, columns: ['t', 'y', 'state', 'tip'] }, {}), cols)), ...noted(b, cols))
      break
    }
    case 'heatmap': {
      out.push(...titled(b, cols))
      const labels = Object.entries(b.colLabels ?? {}).map(([j, l]) => `${Number(j) + 1}=${l}`).join(' · ')
      for (const r of b.rows ?? []) {
        const cells = Array.from({ length: b.cols ?? 0 }, (_, j) => r.cells?.[j])
        out.push(`${r.label}${r.sub ? ` (${r.sub})` : ''}`)
        out.push('  ' + cells.map((c) => (c ? STATE_GLYPH[c.state] ?? '•' : ' ')).join(' '))
        const tips = cells.map((c, j) => (c?.tip ? `${j + 1}: ${htmlText(c.tip)}` : null)).filter(Boolean)
        if (tips.length) out.push(...indented(tips.join(' · '), cols))
      }
      if (labels) out.push(...core.wrap(`columns ${labels}`, cols))
      if (b.marker) out.push(`marker at column ${b.marker.at + 1}: ${b.marker.label}`)
      out.push(...noted(b, cols))
      break
    }
    case 'timeline': {
      out.push(...titled(b, cols))
      for (const ln of b.lanes ?? []) {
        out.push(ln.label)
        for (const sg of ln.segments ?? []) out.push(...indented(`${STATE_GLYPH[sg.tone] ?? '•'} ${sg.from} → ${sg.to}${sg.tip ? ` · ${htmlText(sg.tip)}` : ''}`, cols))
        for (const mk of ln.marks ?? []) out.push(...indented(`${mk.shape} at ${mk.at}${mk.tip ? ` · ${htmlText(mk.tip)}` : ''}`, cols))
      }
      if (b.now) out.push(`now ${b.now}`)
      out.push(...noted(b, cols))
      break
    }
    case 'steps':
      out.push(...titled(b, cols))
      ;(b.items ?? []).forEach((x, i) => {
        out.push(...core.wrap(`${STATE_GLYPH[x.state] ?? String(i + 1)} ${x.title}${x.when ? ` (${x.when})` : ''}`, cols))
        if (x.text) out.push(...para(x.text, cols, '  '))
      })
      break
    case 'table': {
      out.push(...titled(b, cols))
      const head = b.head ?? []
      const rows = (b.rows ?? []).map((r) => Object.fromEntries(r.map((c, i) => [head[i] ?? `col${i + 1}`, typeof c === 'string' ? htmlText(c) : c])))
      out.push(...chart(core.tableText(core.tableModel({ rows, columns: head.length ? head : undefined }, {}), cols)), ...noted(b, cols))
      break
    }
    case 'bets':
      ;(b.items ?? []).forEach((x, i) => {
        out.push(...core.wrap(`${x.tag ?? `Bet ${i + 1}`}${x.lead ? ' (lead)' : ''}: ${x.title}`, cols))
        for (const [k, v] of [['evidence', x.why], ['build', x.build], ['pre-mortem', x.premortem], ['target', x.target]]) if (v) out.push(...para(`${k}: ${v}`, cols, '  '))
      })
      break
    case 'decisions':
      ;(b.items ?? []).forEach((x, i) => {
        out.push(...core.wrap(`${i + 1}. ${x.title}`, cols))
        if (x.text) out.push(...para(x.text, cols, '   '))
        if (x.rec) out.push(...para(x.rec, cols, '   '))
      })
      break
    default: break
  }
  return out
}

export function briefText(prepared, cols = 100, only = null) {
  const out = []
  const s = prepared
  if (s.eyebrow?.length) out.push(...core.wrap(s.eyebrow.join(' · '), cols))
  out.push(...core.wrap(`${s.thesis ?? ''}${s.thesisAlert ? ' ' + s.thesisAlert : ''}`, cols))
  if (s.dek) out.push(...para(s.dek, cols))
  if (s.hill) out.push(...core.wrap(`hill: ${s.hill.metric} · ${s.hill.baseline} → ${s.hill.target}${s.hill.owner ? ` · owner ${s.hill.owner}` : ''}`, cols))
  if (s.stats?.length) out.push(...core.tableText(core.tableModel({ rows: s.stats.map((x) => ({ v: x.v, l: x.l })), columns: ['v', 'l'] }, { header: false }), cols).split('\n'))
  ;(s.sections ?? []).forEach((sec, i) => {
    if (only && !only.some((o) => String(i + 1) === o || `${sec.key ?? ''} ${sec.title}`.toLowerCase().includes(o.toLowerCase()))) return
    out.push('', rule(`${sec.key ? sec.key + ' · ' : ''}${sec.title}`, cols))
    if (sec.lede) out.push(...para(sec.lede, cols))
    for (const b of sec.blocks ?? []) out.push('', ...blockText(b, cols))
  })
  if (!only) {
    if (s.method) out.push('', ...para(`Method. ${s.method}`, cols))
    if (s.caveats) out.push(...para(`Caveats. ${s.caveats}`, cols))
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

