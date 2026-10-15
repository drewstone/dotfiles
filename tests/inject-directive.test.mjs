// Scenario tests for the directive hook through its real boundary: hook JSON on stdin, injected
// context on stdout, the assignment log on disk. The A/B unit is the session, so a session must keep
// the variant it was logged with when `active` changes under it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOOK = process.env.DIRECTIVE_HOOK ?? new URL('../claude/hooks/inject-directive.sh', import.meta.url).pathname

function home(active) {
  const h = mkdtempSync(join(tmpdir(), 'directive-'))
  const dir = join(h, '.claude', 'directives', 'variants')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'alpha.md'), 'ALPHA BODY\n')
  writeFileSync(join(dir, 'beta.md'), 'BETA BODY\n')
  writeFileSync(join(h, '.claude', 'directives', 'active'), `${active}\n`)
  return h
}
const setActive = (h, active) => writeFileSync(join(h, '.claude', 'directives', 'active'), `${active}\n`)
function turn(h, session) {
  const out = execFileSync('bash', [HOOK], { input: JSON.stringify({ session_id: session, cwd: '/tmp' }), env: { ...process.env, HOME: h }, encoding: 'utf8' })
  return out ? /variant=\\?"([^"\\]+)/.exec(JSON.parse(out).hookSpecificOutput.additionalContext)[1] : null
}
const log = (h) => readFileSync(join(h, '.claude', 'directives-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))

test('a session keeps its logged variant when active changes mid-session', () => {
  const h = home('alpha')
  assert.equal(turn(h, 's1'), 'alpha')
  setActive(h, 'beta')
  assert.equal(turn(h, 's1'), 'alpha')
  setActive(h, 'rotate:alpha,beta')
  assert.equal(turn(h, 's1'), 'alpha')
  assert.deepEqual(log(h).map((r) => [r.session, r.variant]), [['s1', 'alpha']])
})

test('a session logged before pinning recovers its variant from the log', () => {
  const h = home('rotate:alpha,beta')
  const seen = join(h, '.claude', '.directive-seen')
  mkdirSync(seen, { recursive: true })
  writeFileSync(join(seen, 'legacy'), '')
  writeFileSync(join(h, '.claude', 'directives-log.jsonl'), '{"ts":"2026-10-15T07:13:13Z","session":"legacy","variant":"beta","cwd":"/tmp"}\n')
  setActive(h, 'alpha')
  assert.equal(turn(h, 'legacy'), 'beta')
  assert.equal(readFileSync(join(seen, 'legacy'), 'utf8').trim(), 'beta')
})

test('a new session under rotation is logged once with the variant it was shown', () => {
  const h = home('rotate:alpha,beta')
  const first = turn(h, 'fresh-session')
  assert.ok(['alpha', 'beta'].includes(first))
  assert.equal(turn(h, 'fresh-session'), first)
  const rows = log(h)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].variant, first)
  assert.ok(existsSync(join(h, '.claude', '.directive-seen', 'fresh-session')))
})
