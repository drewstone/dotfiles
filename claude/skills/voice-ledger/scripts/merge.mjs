// Merge per-harness extracts into one Drew-turn corpus, join trace-mine's correction labels, and roll up per day.
// Day = America/Los_Angeles calendar date with a 04:00 cutoff, so a late-night session stays with its day.
// Usage: node merge.mjs <out>
//   reads  <out>/extract/<harness>-<host>.jsonl (claude-<host>.jsonl from trace-mine's extract.mjs, the rest from
//          multi_extract.py) and <out>/extract/trace-mine-labels.jsonl (trace-mine's analyst turns.jsonl, if present)
//   writes <out>/corpus/turns.jsonl, days.json, merge-stats.json
// The lexical detector comes from trace-mine (TRACE_MINE_ANALYST overrides its directory); it misses about two thirds
// of corrections, so its label is only a placeholder until the adjudication pass replaces it.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ANALYST = process.env.TRACE_MINE_ANALYST ?? join(homedir(), '.local/share/tangle-tools/trace-insights/mine/analyst')
const { detectCorrection } = await import(pathToFileURL(join(ANALYST, 'corrections.mjs')).href)

if (!process.argv[2]) throw new Error('usage: node merge.mjs <out>')
const OUT = resolve(process.argv[2])
const EXTRACT = join(OUT, 'extract') + '/'
const DIR = join(OUT, 'corpus') + '/'
mkdirSync(DIR, { recursive: true })
const LABELS = EXTRACT + 'trace-mine-labels.jsonl'
// Machine turns that the per-harness extractors let through: harness posture blocks, goal loops,
// probes, and operator agents (the cofounder session, fleet) typing into a pane on Drew's behalf.
const MACHINE = [
  /^System: Requested permission posture/u, /^<codex_internal_context/u, /^<in-app-browser-context/u,
  /^You are a senior staff engineer operating a browser/u, /^Warmup$/u, /^# YALLA\. Read this twice/u,
  /^From the cofounder session/u, /^MOONSHOTS from Drew/u, /^Read BRIEF\.md/u, /^Reply with exactly/u,
  /^You must use the read tool/u, /^say ok$/u, /^(Scope update|Design note|Note) from Drew/u, /^\d\d:\d\d (MDT|UTC|PDT|CEST|Z)\b/u,
  /^\[fleet/u, /^Independent senior review of commit/u, /^You are an independent senior reviewer/u,
  /^You are (auto-dev|an expert optimization assistant|a [\w -]+ (agent|reviewer|operator|engineer)\b)/u,
]
// An operator agent writes about Drew in the third person; Drew does not.
const THIRD_PERSON_DREW = /\b(Drew('s)? (said|says|asked|asks|wants|wanted|call|brief|decided|approved|is|has|will|to)|from Drew|for Drew|tell Drew|Drew:)/u
const MACHINE_CWD = /\/tmp\/(vb-cli-bridge-workspaces|pi-skill-probe|trace-mine)|\/foreman-projects\//u
function cleanText(text) {
  return text.replace(/<image name=\[Image #\d+\][^>]*>(<\/image>)?/gu, '[image]').trim()
}
const RELAY = (s) => s.length > 1500 && ((s.match(/\n\|/g) ?? []).length > 3 || (s.match(/\n#/g) ?? []).length > 2 || (s.match(/\n- /g) ?? []).length > 8)
const PRAISE = /\b(perfect|amazing|awesome|love (it|this|that)|beautiful|excellent|great (job|work)|nice work|well done|incredible|nailed it|exactly( right)?|this is great|so good|fantastic|brilliant)\b/iu
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
function dayOf(ts) {
  const ms = Date.parse(ts)
  if (!Number.isFinite(ms)) return null
  const shifted = new Date(ms - 4 * 3600e3) // 04:00 PT cutoff
  const p = Object.fromEntries(dayFmt.formatToParts(shifted).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
function projectOf(cwd) {
  if (!cwd) return 'unknown'
  const m = cwd.match(/\/(?:webb|code)\/(?:_wt\/)?([^/]+)/) ?? cwd.match(/\/(company|dotfiles|tmp|private)\b/)
  let p = m ? m[1] : cwd.split('/').filter(Boolean).slice(-1)[0] ?? 'home'
  p = p.replace(/-(wt|worktree|installed|pr|fix|feat)[-\w]*$/u, '').replace(/-20\d{6}.*$/u, '')
  if (/^\/(Users|home)\/drew\/?$/.test(cwd)) p = 'home'
  return p
}

// trace-mine model labels, keyed by host:turn-uuid.
const labels = new Map()
const labelsByTime = new Map()
if (existsSync(LABELS)) {
  for (const line of readFileSync(LABELS, 'utf8').split('\n')) {
    if (!line) continue
    const r = JSON.parse(line)
    labels.set(r.id, r)
    if (r.host && r.session && r.ts) labelsByTime.set(`${r.host}:${r.session}:${String(r.ts).slice(0, 19)}`, r)
  }
} else console.error(`no ${LABELS}: every turn goes to the adjudication pass`)

const rows = []
const seen = new Set()
let dropped = 0
let extracted = 0
let duplicates = 0
for (const name of readdirSync(EXTRACT).filter((n) => n.endsWith('.jsonl') && n !== 'trace-mine-labels.jsonl')) {
  const isClaude = name.startsWith('claude-')
  for (const line of readFileSync(EXTRACT + name, 'utf8').split('\n')) {
    if (!line) continue
    const rec = JSON.parse(line)
    const harness = isClaude ? 'claude-code' : rec.harness
    for (const t of rec.turns ?? []) {
      extracted += 1
      const text = cleanText(t.text ?? '')
      const key = createHash('sha1').update(`${text}\0${String(t.ts).slice(0, 16)}`).digest('hex')
      if (seen.has(key)) { duplicates += 1; continue } // the same turn copied into a resumed or forked transcript
      seen.add(key)
      if (!text || MACHINE.some((re) => re.test(text)) || THIRD_PERSON_DREW.test(text) || MACHINE_CWD.test(rec.cwd ?? '')) { dropped += 1; continue }
      const author = isClaude ? (RELAY(text) ? 'relay' : 'human') : t.author
      const id = isClaude && t.id ? `${rec.host}:${t.id}` : `${rec.host}:${rec.session}:${t.ts}`
      // Rows from traces carry no record uuid; trace-mine labels also join by host, session and turn time.
      const model = labels.get(id) ?? labelsByTime.get(`${rec.host}:${rec.session}:${String(t.ts).slice(0, 19)}`)
      const lex = detectCorrection({ text })
      const correction = model && model.detector !== 'lexical' ? model.correction : lex.correction
      rows.push({
        id, host: rec.host, harness, session: rec.session, cwd: rec.cwd, project: projectOf(rec.cwd),
        ts: t.ts, day: dayOf(t.ts), author, text,
        words: text.split(/\s+/).filter(Boolean).length,
        afterInterrupt: Boolean(t.afterInterrupt || t.interrupted),
        correction, theme: model?.theme ?? lex.theme ?? null, labelSource: model && model.detector !== 'lexical' ? 'model' : 'lexical',
        praise: author === 'human' && PRAISE.test(text),
        previousAgent: t.previousAgent ?? '', reply: t.reply ?? '',
      })
    }
  }
}
rows.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
writeFileSync(DIR + 'turns.jsonl', rows.map((r) => JSON.stringify(r)).join('\n') + '\n')

const days = {}
for (const r of rows) {
  if (!r.day) continue
  const d = (days[r.day] ??= { day: r.day, turns: 0, human: 0, relay: 0, words: 0, corrections: 0, praise: 0, interrupts: 0, sessions: new Set(), harness: {}, project: {}, hosts: {}, themes: {} })
  d.turns += 1
  d[r.author === 'relay' ? 'relay' : 'human'] += 1
  d.words += r.words
  if (r.correction) { d.corrections += 1; if (r.theme) d.themes[r.theme] = (d.themes[r.theme] ?? 0) + 1 }
  if (r.praise) d.praise += 1
  if (r.afterInterrupt) d.interrupts += 1
  d.sessions.add(`${r.host}:${r.session}`)
  d.harness[r.harness] = (d.harness[r.harness] ?? 0) + 1
  d.project[r.project] = (d.project[r.project] ?? 0) + 1
  d.hosts[r.host] = (d.hosts[r.host] ?? 0) + 1
}
const out = Object.values(days).sort((a, b) => a.day.localeCompare(b.day)).map((d) => ({
  ...d, sessions: d.sessions.size, correctionRate: +(d.corrections / d.turns).toFixed(3),
  project: Object.fromEntries(Object.entries(d.project).sort((a, b) => b[1] - a[1]).slice(0, 8)),
}))
writeFileSync(DIR + 'days.json', JSON.stringify(out, null, 1))
const count = (key) => Object.fromEntries([...new Set(rows.map((r) => r[key]))].map((k) => [k, rows.filter((r) => r[key] === k).length]))
writeFileSync(DIR + 'merge-stats.json', JSON.stringify({ extracted, duplicates, machineDropped: dropped, turns: rows.length, harness: count('harness'), host: count('host') }, null, 1))
console.log(`machineDropped=${dropped} turns=${rows.length} days=${out.length} modelLabelled=${rows.filter((r) => r.labelSource === 'model').length}`)
for (const d of out) console.log(d.day, String(d.turns).padStart(4), 'corr', String(d.corrections).padStart(3), (d.correctionRate * 100).toFixed(0).padStart(3) + '%', 'praise', d.praise, 'relay', d.relay, JSON.stringify(d.harness), Object.keys(d.project).slice(0, 4).join(','))
