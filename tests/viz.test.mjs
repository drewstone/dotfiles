import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import * as core from '../claude/tools/viz-kit/core.mjs'
import { briefHtml, briefText, prepareBrief } from '../claude/tools/viz-kit/brief.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const viz = join(repoRoot, 'claude', 'tools', 'viz')
const fixtures = join(repoRoot, 'tests', 'fixtures', 'viz')
const example = join(repoRoot, 'claude', 'skills', 'report', 'assets', 'brief-example.json')
const kit = join(repoRoot, 'claude', 'skills', 'report', 'assets', 'brief-kit.html')
const update = process.env.VIZ_UPDATE_GOLDEN === '1'

function run(args, input) {
  return spawnSync(process.execPath, [viz, ...args], { encoding: 'utf8', input, env: { ...process.env, COLUMNS: '80' } })
}

// Each case renders a fixture and compares it byte for byte with its golden file.
// Regenerate deliberately with VIZ_UPDATE_GOLDEN=1 and read the diff before committing it.
const CASES = [
  ['bars-total', ['bars', 'causes.tsv', '--total', '171', '--title', 'Why turns failed, 171 failures', '--source', 'fixture', '--asof', '2026-10-10', '--width', '72']],
  ['bars-ratio', ['bars', 'canary-rate.tsv', '--target', '95', '--width', '60', '-q']],
  ['grouped-ratio', ['grouped', 'success.tsv', '--target', '95', '--target-label', 'launch bar', '--width', '72', '-q']],
  ['grouped-notes', ['grouped', 'latency.json', '--width', '72', '-q']],
  ['spark', ['spark', 'trend.tsv', '--unit', 's', '--width', '72', '-q']],
  ['strip-wide', ['strip', 'canary.tsv', '--title', 'Canary every 30 min', '--width', '72', '-q']],
  ['strip-narrow', ['strip', 'canary.tsv', '--width', '30', '-q']],
  ['stack', ['stack', 'turn.tsv', '--unit', 's', '--width', '60', '-q']],
  ['waterfall', ['waterfall', 'outage.tsv', '--unit', 'm', '--start', '00:45', '--end', '07:31', '--width', '100', '-q']],
  ['timeline', ['timeline', 'events.tsv', '--width', '64', '-q']],
  ['table', ['table', 'repos.tsv', '--sum', '--width', '50', '-q']],
]

for (const [name, args] of CASES) {
  test(`golden: ${name}`, () => {
    const out = run(args.map((a) => (a.includes('.') && existsSync(join(fixtures, a)) ? join(fixtures, a) : a)))
    assert.equal(out.status, 0, out.stderr)
    const golden = join(fixtures, `${name}.txt`)
    if (update || !existsSync(golden)) writeFileSync(golden, out.stdout)
    assert.equal(out.stdout, readFileSync(golden, 'utf8'))
  })
}

test('golden: the brief kit example in the terminal', () => {
  const out = run(['brief', example, '--width', '100'])
  assert.equal(out.status, 0, out.stderr)
  const golden = join(fixtures, 'brief-example.txt')
  if (update || !existsSync(golden)) writeFileSync(golden, out.stdout)
  assert.equal(out.stdout, readFileSync(golden, 'utf8'))
})

test('every chart stays inside the width it was given', () => {
  for (const [name, args] of CASES) {
    for (const cols of [40, 72, 120]) {
      const widened = args.map((a) => (a.includes('.') && existsSync(join(fixtures, a)) ? join(fixtures, a) : a))
      const at = widened.indexOf('--width')
      if (at >= 0) widened[at + 1] = String(cols)
      else widened.push('--width', String(cols))
      const out = run(widened)
      assert.equal(out.status, 0, `${name} at ${cols}: ${out.stderr}`)
      for (const line of out.stdout.trimEnd().split('\n')) assert.ok(core.width(line) <= cols, `${name} at ${cols}: ${JSON.stringify(line)} is ${core.width(line)} wide`)
    }
  }
})

test('bars are drawn to scale with eighth-cell ends and the target behind them', () => {
  assert.equal(core.barCells(0.5, 20), '█'.repeat(10) + ' '.repeat(10))
  assert.equal(core.barCells(1 / 16, 8), '▌' + ' '.repeat(7))
  assert.equal(core.barCells(0, 4), '    ')
  assert.equal(core.barCells(0.001, 4), '▏   ', 'a nonzero value never draws as zero')
  assert.equal(core.barCells(null, 4, 0.5), '  ┆ ', 'a missing value draws no bar but keeps the target')
  assert.equal(core.barCells(1, 4, 0.5), '████', 'a bar past the target covers it')
  const m = core.barsModel({ rows: [{ label: 'a', value: 30 }, { label: 'b', value: 60 }] })
  assert.deepEqual(m.rows.map((r) => r.frac), [0.5, 1])
})

test('rates never round up to a whole, and tiny shares stay visible', () => {
  assert.equal(core.fmtShare(0.9999), '99.9%')
  assert.equal(core.fmtShare(0.0004), '<0.1%')
  assert.equal(core.fmtShare(1), '100%')
})

test('parts that exceed their whole are refused, and a shortfall is shown', () => {
  assert.throws(() => core.barsModel({ rows: [{ label: 'a', value: 5 }, { label: 'b', value: 6 }] }, { total: 10 }), /rows sum to 11 but the total is 10/)
  const short = core.barsModel({ rows: [{ label: 'a', value: 5 }] }, { total: 9 })
  assert.equal(short.rows.at(-1).label, '(unaccounted)')
  assert.equal(short.rows.at(-1).value, 4)
  assert.throws(() => core.stackModel({ rows: [{ label: 'a', value: 50 }, { label: 'b', value: 30 }] }, { unit: 'm', start: '00:00', end: '01:00' }), /parts sum to 80m but the whole is 60m/)
  const gap = core.stackModel({ rows: [{ label: 'a', value: 40 }] }, { unit: 'm', start: '23:30', end: '00:30' })
  assert.equal(gap.parts.at(-1).label, 'unattributed', 'a span past midnight still reconciles')
  assert.equal(gap.parts.at(-1).value, 20)
  assert.throws(() => core.stackModel({ rows: [{ label: 'a', value: 40 }] }, { unit: 'm', start: '00:00', end: '01:00', total: 50 }), /is 60 minutes but the total says 50/)
  assert.throws(() => core.groupedModel({ rows: [{ label: 'x', a: '11/10' }] }), /more than its denominator/)
  assert.throws(() => core.barsModel({ rows: [{ label: 'a', value: 120 }] }, { max: 100 }), /above the scale maximum/)
  assert.throws(() => core.stripModel({ rows: [{ t: '1', status: 'maybe' }] }), /unknown status "maybe"/)
  const mixed = core.timelineModel({ rows: [{ t: '23:40', text: 'a' }, { t: '2026-10-10T00:10', text: 'b' }] })
  assert.equal(mixed.events[1].gapText, '', 'a clock time and a timestamp give no gap rather than a wrong one')
})

test('the CLI names bad input and exits 2', () => {
  const bad = run(['bars', '-', '-q'], 'label\tvalue\na\t-3\n')
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /bars row 1 \(a\): bars need values >= 0/)
  assert.equal(run(['nope', '-q'], '[]').status, 2)
  assert.equal(run(['--help']).status, 0)
  const warned = run(['bars', '-'], 'label\tvalue\na\t3\n')
  assert.equal(warned.status, 0)
  assert.match(warned.stderr, /no --source/)
})

test('brief specs fail on broken data and warn on missing climb parts', () => {
  const { errors } = prepareBrief({ title: 'T', thesis: 'x', sections: [{ title: 's', blocks: [
    { type: 'nope' },
    { type: 'heatmap', cols: 1, rows: [{ label: 'r', cells: [{}, {}] }] },
    { type: 'hbars', title: 'PRs', total: 10, rows: [['a', 6], ['b', 6]] },
    { type: 'waterfall', unit: 'm', start: '00:00', end: '00:30', rows: [{ label: 'a', value: 40 }] },
    { type: 'grouped', rows: [{ label: 'x', a: 1, b: 2, c: 3, d: 4 }] },
  ] }] })
  assert.match(errors[0], /unknown block type "nope"/)
  assert.match(errors[1], /more cells than cols/)
  assert.match(errors[2], /\(hbars "PRs"\): bars: rows sum to 12 but the total is 10/)
  assert.match(errors[3], /parts sum to 40m but the whole is 30m/)
  assert.match(errors[4], /4 series/)
  const { warnings } = prepareBrief({ title: 'A title far too long for a name', thesis: 'x', sections: [{ title: 's', blocks: [{ type: 'bets', items: [{ title: 'b' }] }] }] })
  assert.ok(warnings.some((w) => /two to four words/.test(w)))
  assert.ok(warnings.some((w) => /no premortem or target/.test(w)))
  assert.ok(warnings.some((w) => /no hill/.test(w)) && warnings.some((w) => /no chart/.test(w)) && warnings.some((w) => /no decisions/.test(w)))
})

test('the page embeds the spec without letting it close the script or expand replacement patterns', () => {
  const { spec } = prepareBrief({ title: 'Escape Test', thesis: '</script><script>alert(1)</script> costs $& and $1', sections: [] })
  const page = briefHtml(spec)
  const data = page.slice(page.indexOf('<script id="brief" type="application/json">'), page.indexOf('</script>', page.indexOf('<script id="brief"')))
  assert.ok(!data.includes('</script><script>'), 'no raw script close inside the data')
  assert.equal(JSON.parse(data.replace(/^<script[^>]*>/, '')).thesis, '</script><script>alert(1)</script> costs $& and $1')
  assert.match(page, /<title>Escape Test<\/title>/)
})

test('the page keeps the artifact contract: theme tokens both ways, no outside scripts', () => {
  const page = readFileSync(kit, 'utf8')
  assert.match(page, /@media \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme="light"\]\)/)
  assert.match(page, /:root\[data-theme="dark"\]/)
  assert.match(page, /body \{ background: var\(--bg\)/)
  assert.ok(!/<script[^>]+src=/.test(page), 'scripts are inline')
  for (const href of page.match(/href="[^"]+"/g) ?? []) assert.match(href, /^href="https:\/\/fonts\.(googleapis|gstatic)\.com/)
})

// The page draws only what the models carry, so every model value must reach the terminal too.
test('the terminal view states every value the page draws', () => {
  const { spec, errors } = prepareBrief(JSON.parse(readFileSync(example, 'utf8')))
  assert.deepEqual(errors, [])
  const text = briefText(spec, 100).replace(/\s+/g, ' ')
  const expected = []
  const visit = (blocks) => {
    for (const b of blocks) {
      if (b.type === 'cols') visit(b.blocks)
      const m = b.model
      if (!m) continue
      if (m.rows) for (const r of m.rows) expected.push(r.valueText, r.shareText)
      if (m.parts) for (const p of m.parts) expected.push(p.valueText, p.shareText, p.range)
      if (m.cells && m.kind === 'grouped') for (const row of m.cells) for (const c of row) expected.push(c.text)
      if (m.kind === 'strip') expected.push(...m.notes)
      if (m.events) for (const e of m.events) expected.push(e.gapText, e.t)
      expected.push(m.summary, m.groupSummary, m.targetText)
    }
  }
  for (const sec of spec.sections) visit(sec.blocks)
  const missing = expected.filter(Boolean).filter((x) => !text.includes(x.replace(/\s+/g, ' ')))
  assert.deepEqual(missing, [])
  assert.ok(expected.filter(Boolean).length > 40, `the example exercises the model-drawn blocks (${expected.filter(Boolean).length} values)`)
})

