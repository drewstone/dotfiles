// Prepare the day-profiles workflow: correction-adjudication batches built with trace-mine's own prompt builder, a
// blind calibration set, and one file per day of Drew's turns. Prints the workflow args as JSON on stdout.
// Usage: node adjudicate.mjs <out> [--from DAY] [--to DAY]
//   reads  <out>/corpus/turns.jsonl (merge.mjs) and turns-labelled.jsonl (features.py)
//   writes <out>/corpus/adjudicate/batch-NNN.md, calib-000.md, calib-001.md, _map.json (short id -> turn id)
//          <out>/corpus/days/<day>.jsonl for every day with 40+ turns Drew typed, and days/_selected.json
// Every Drew or relay turn without a trace-mine model label is adjudicated. The 150 calibration turns already carry a
// trace-mine Opus label, are chosen by hash of their id (stable across runs) and are labelled blind, so post.py can
// score this pass against Opus. The system prompt is trace-mine's ADJUDICATION_SYSTEM without its reply-format line,
// because the workflow returns labels through a schema.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const ANALYST = process.env.TRACE_MINE_ANALYST ?? join(homedir(), '.local/share/tangle-tools/trace-insights/mine/analyst')
const { ADJUDICATION_SYSTEM, adjudicationPrompt } = await import(pathToFileURL(join(ANALYST, 'corrections.mjs')).href)

const { values, positionals } = parseArgs({ allowPositionals: true, options: { from: { type: 'string' }, to: { type: 'string' } } })
if (!positionals[0]) throw new Error('usage: node adjudicate.mjs <out> [--from DAY] [--to DAY]')
const CORPUS = join(resolve(positionals[0]), 'corpus')
const BATCH = 120
const CALIBRATION = 150
const MIN_DAY_TURNS = 40

const jsonl = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
const full = new Map(jsonl(join(CORPUS, 'turns.jsonl')).map((r) => [r.id, r]))
const own = jsonl(join(CORPUS, 'turns-labelled.jsonl')).filter((r) => r.who === 'drew' || r.who === 'relay')
const clip = (s, n) => { const f = String(s ?? '').replace(/\s+/g, ' ').trim(); return f.length <= n ? f : `${f.slice(0, n)}…` }
const hash = (s) => createHash('sha1').update(s).digest('hex')

// 1. Adjudication batches.
const dir = join(CORPUS, 'adjudicate')
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
const need = own.filter((r) => full.get(r.id)?.labelSource !== 'model')
const calib = own.filter((r) => full.get(r.id)?.labelSource === 'model').sort((a, b) => hash(a.id).localeCompare(hash(b.id))).slice(0, CALIBRATION)
const maps = {}
function write(name, items) {
  const map = {}
  const turns = items.map((r, i) => {
    map[`t${i + 1}`] = r.id
    return { id: `t${i + 1}`, previousAgent: r.previousAgent, afterInterrupt: Boolean(full.get(r.id)?.afterInterrupt), text: r.text }
  })
  writeFileSync(join(dir, `${name}.md`), adjudicationPrompt(turns) + '\n')
  maps[name] = map
}
for (let b = 0; b < need.length; b += BATCH) write(`batch-${String(b / BATCH).padStart(3, '0')}`, need.slice(b, b + BATCH))
const half = Math.ceil(calib.length / 2)
write('calib-000', calib.slice(0, half))
write('calib-001', calib.slice(half))
writeFileSync(join(dir, '_map.json'), JSON.stringify(maps))

// 2. Day files: every turn Drew sent that day, his own text verbatim, relays clipped.
const daysDir = join(CORPUS, 'days')
rmSync(daysDir, { recursive: true, force: true })
mkdirSync(daysDir, { recursive: true })
const byDay = new Map()
for (const r of own) if (r.day) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r])
const selected = [...byDay.keys()].sort()
  .filter((d) => (!values.from || d >= values.from) && (!values.to || d <= values.to))
  .filter((d) => byDay.get(d).filter((r) => r.who === 'drew').length >= MIN_DAY_TURNS)
for (const d of selected) {
  const lines = byDay.get(d).sort((a, b) => a.ts.localeCompare(b.ts)).map((r) => JSON.stringify({
    ts: r.ts.slice(11, 16), harness: r.harness, project: r.project, session: String(r.session).slice(0, 8), who: r.who,
    text: r.who === 'drew' ? r.text : clip(r.text, 600), agentBefore: clip(r.previousAgent, 280), next: r.next,
  }))
  writeFileSync(join(daysDir, `${d}.jsonl`), lines.join('\n') + '\n')
}
writeFileSync(join(daysDir, '_selected.json'), JSON.stringify(selected))

const batches = Object.keys(maps)
console.error(`adjudicate ${need.length} turns in ${batches.length - 2} batches + ${calib.length} calibration; ${selected.length} of ${byDay.size} days have ${MIN_DAY_TURNS}+ Drew turns`)
console.log(JSON.stringify({
  corpus: CORPUS,
  batches,
  days: selected,
  adjudicationSystem: ADJUDICATION_SYSTEM.split('\n').filter((line) => !line.startsWith('Reply with exactly')).join('\n'),
}))
