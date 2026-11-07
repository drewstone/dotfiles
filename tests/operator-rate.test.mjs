import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { ratePerMinute, takeSlot } from '../claude/tools/operator-api/rate.mjs'

const rate = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'claude', 'tools', 'operator-api', 'rate.mjs')
const KEY = 'tak_rate_test_secret'

/** Child processes that each take `slots` slots and print one line per slot. */
function clients(count, slots, env) {
  const script = `const { takeSlot } = await import(${JSON.stringify(rate)}); for (let i = 0; i < ${slots}; i++) { await takeSlot(${JSON.stringify(KEY)}); console.log('slot') }`
  const lines = []
  const children = Array.from({ length: count }, () => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { env: { PATH: process.env.PATH, ...env } })
    child.stdout.on('data', (chunk) => { lines.push(...String(chunk).trim().split('\n')) })
    return child
  })
  const done = Promise.all(children.map((child) => new Promise((ok) => child.on('close', ok))))
  return { lines, children, done }
}

test('the budget is shared by processes on one host and loses no update', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'operator-rate-'))
  try {
    const run = clients(6, 4, { OPERATOR_API_STATE_DIR: dir, OPERATOR_API_RATE_PER_MIN: '24' })
    await run.done
    assert.equal(run.lines.length, 24)
    const [file] = readdirSync(dir).filter((name) => name.endsWith('.json'))
    assert.equal(JSON.parse(readFileSync(join(dir, file), 'utf8')).length, 24)
    assert.ok(!file.includes(KEY), 'the state file is named by a hash, not the key')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('processes past the budget wait instead of sending', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'operator-rate-'))
  try {
    const run = clients(4, 3, { OPERATOR_API_STATE_DIR: dir, OPERATOR_API_RATE_PER_MIN: '8' })
    await new Promise((ok) => setTimeout(ok, 2_000))
    assert.equal(run.lines.length, 8)
    for (const child of run.children) child.kill()
    await run.done
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a window that has passed frees its slots', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'operator-rate-'))
  try {
    let now = 1_000_000
    const env = { OPERATOR_API_STATE_DIR: dir, OPERATOR_API_RATE_PER_MIN: '2' }
    assert.equal(await takeSlot(KEY, { env, now: () => now }), 0)
    assert.equal(await takeSlot(KEY, { env, now: () => now }), 0)
    now += 60_001
    assert.equal(await takeSlot(KEY, { env, now: () => now }), 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the per-host share is configurable and 0 turns the budget off', () => {
  assert.equal(ratePerMinute({}), 50)
  assert.equal(ratePerMinute({ OPERATOR_API_RATE_PER_MIN: '20' }), 20)
  assert.equal(ratePerMinute({ OPERATOR_API_RATE_PER_MIN: '0' }), 0)
  assert.throws(() => ratePerMinute({ OPERATOR_API_RATE_PER_MIN: 'many' }), /whole number/)
})
