import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'claude', 'workflows', 'prove-journeys.js'), 'utf8')

/** Run the saved workflow's body the way the Workflow tool does, with scripted agents. */
async function runWorkflow(args, answer) {
  const body = source.replace(/^export const meta = /m, 'const meta = ')
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const calls = []
  const active = new Set()
  let peak = 0
  const agent = async (prompt, opts = {}) => {
    calls.push({ label: opts.label, phase: opts.phase, prompt })
    active.add(opts.label)
    peak = Math.max(peak, active.size)
    await new Promise((r) => setTimeout(r, 1))
    active.delete(opts.label)
    return answer(opts.label, prompt)
  }
  const parallel = (thunks) => Promise.all(thunks.map((t) => t().catch(() => null)))
  const run = new AsyncFunction('args', 'agent', 'parallel', 'phase', 'log', `${body}\nreturn { meta }`)
  const phases = []
  const result = await run(args, agent, parallel, (p) => phases.push(p), () => {})
  return { result, calls, phases, peak }
}

const ARGS = {
  app: 'tax', url: 'https://taxes.example.com', repo: 'tangle-network/tax-agent', host: 'beelink2-wsl', checkout: '~/code/_wt/tax-journeys',
  identities: [{ name: 'member', role: 'a household filer', workspaces: 'its personal workspace' }],
  flows: ['public-page', 'sign-in', 'first-question'].map((id) => ({ id, title: id, brief: `Prove ${id}.` })),
  outRoot: '/tmp/flows', stamp: '20261011',
}

const ANSWERS = (label) => {
  if (label === 'prepare') return { ready: true, signedIn: ['member: u1, verified'], chatContract: 'all visible', outDir: '/home/x/out', blockers: [] }
  if (label === 'critic') return { headline: '1 of 3', scorecard: [], verifiedFailures: [], uiCritique: [], scorerDisagreements: [], refutedOrUnproven: [], coverageGaps: [], criticFile: '/tmp/flows/c.json' }
  if (label === 'index') return '/tmp/flows/INDEX.md'
  return { journey: label, verdict: 'pass', oneLine: 'ok', steps: [], turns: [], outputQuality: { grade: 'B', why: 'fine' }, failures: [], folder: `/tmp/flows/${label}`, notCovered: [] }
}

test('records given flows two at a time, then reviews and indexes them', async () => {
  const { result, calls, phases, peak } = await runWorkflow(ARGS, ANSWERS)
  assert.deepEqual(calls.map((c) => c.label), ['prepare', 'public-page', 'sign-in', 'first-question', 'critic', 'index'])
  assert.deepEqual(phases, ['Prepare', 'Journeys', 'Critic', 'Index'])
  assert.equal(peak, 2)
  assert.equal(result.out, '/tmp/flows/journeys-tax-20261011')
  const journey = calls.find((c) => c.label === 'sign-in').prompt
  assert.match(journey, /cd ~\/code\/_wt\/tax-journeys && JOURNEYS_OUT=\$HOME\/\.local\/state\/agent-app-journeys\/tax\/runs\/20261011 nice -n 10 journeys-env -- pnpm exec agent-app-journeys run/)
  assert.match(journey, /At most 6 chat turns/)
  assert.match(calls.find((c) => c.label === 'critic').prompt, /"journey": "first-question"/)
})

test('plans the flows from the app\'s own definition when none are given, and stops on an unready host', async () => {
  const planned = { flows: [{ id: 'core-path', title: 'Core path', brief: 'Ask, get a saved result.' }], source: 'docs/production-launch-checklist.md' }
  const { result, calls } = await runWorkflow({ ...ARGS, flows: undefined, flowsSource: 'docs/production-launch-checklist.md' }, (label) => {
    if (label === 'plan') return planned
    if (label === 'prepare') return { ready: false, signedIn: [], chatContract: '', outDir: '', blockers: ['no session'] }
    return null
  })
  assert.deepEqual(calls.map((c) => c.label), ['plan', 'prepare'])
  assert.equal(result.error, 'host not ready')
})
