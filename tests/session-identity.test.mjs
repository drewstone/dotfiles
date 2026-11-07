// Scenario tests for the session identity record through its real boundary: hook JSON on stdin to
// the SessionStart hooks (lineage and directive), the record on disk. The record is what `traces` reads
// to say who acted in an interactive session, so every new session must end up with harness, model,
// profile and directive variant, and nothing may be written as a placeholder.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOOKS = new URL('../claude/hooks/', import.meta.url).pathname
const START = join(HOOKS, 'lineage-session-start.sh')
const DIRECTIVE = join(HOOKS, 'inject-directive.sh')

function home() {
  const h = mkdtempSync(join(tmpdir(), 'session-identity-'))
  const claude = join(h, '.claude')
  mkdirSync(join(claude, 'directives', 'variants'), { recursive: true })
  writeFileSync(join(claude, 'directives', 'variants', 'alpha.md'), 'ALPHA BODY\n')
  writeFileSync(join(claude, 'directives', 'active'), 'alpha\n')
  writeFileSync(join(claude, 'CLAUDE.md'), '# Claude\n\n@AGENTS.md\n')
  writeFileSync(join(claude, 'AGENTS.md'), 'shared rules v1\n')
  mkdirSync(join(claude, 'skills', 'verify'), { recursive: true })
  writeFileSync(join(claude, 'skills', 'verify', 'SKILL.md'), 'verify skill\n')
  return h
}
const env = (h) => ({ ...process.env, HOME: h, LINEAGE_BIN: join(h, 'no-lineage') })
const run = (hook, h, input) => execFileSync('bash', [hook], { input: JSON.stringify(input), env: env(h), encoding: 'utf8' })
const recordPath = (h, session) => join(h, '.local', 'state', 'session-identity', 'claude-code', `${session}.json`)
const record = (h, session) => JSON.parse(readFileSync(recordPath(h, session), 'utf8'))

test('a new session records harness, model, profile, digests and its directive variant', () => {
  const h = home()
  run(START, h, { session_id: 's1', source: 'startup', model: 'claude-opus-5-5[1m]', cwd: '/tmp' })
  run(DIRECTIVE, h, { session_id: 's1', cwd: '/tmp' })
  const r = record(h, 's1')
  assert.equal(r.session_id, 's1')
  assert.equal(r.attributes['agent.harness'], 'claude-code')
  assert.equal(r.attributes['agent.model'], 'claude-opus-5-5[1m]')
  assert.equal(r.attributes['agent.profile.name'], 'dotfiles')
  assert.match(r.attributes['agent.profile.digest'], /^sha256:[0-9a-f]{64}$/)
  assert.match(r.attributes['agent.skills.digest'], /^sha256:[0-9a-f]{64}$/)
  assert.equal(r.attributes['agent.directive.variant'], 'alpha')
})

test('an --agent session is that agent; a missing model stays absent', () => {
  const h = home()
  run(START, h, { session_id: 's2', source: 'startup', agent_type: 'reviewer' })
  const r = record(h, 's2')
  assert.equal(r.attributes['agent.profile.name'], 'reviewer')
  assert.equal('agent.model' in r.attributes, false)
})

test('the profile digest follows the imported instructions and nothing else', () => {
  const h = home()
  run(START, h, { session_id: 'a', model: 'm' })
  run(START, h, { session_id: 'b', model: 'other' })
  writeFileSync(join(h, '.claude', 'AGENTS.md'), 'shared rules v2\n')
  run(START, h, { session_id: 'c', model: 'm' })
  const digest = (s) => record(h, s).attributes['agent.profile.digest']
  assert.equal(digest('a'), digest('b'))
  assert.notEqual(digest('a'), digest('c'))
  assert.equal(record(h, 'a').attributes['agent.skills.digest'], record(h, 'c').attributes['agent.skills.digest'])
})

test('no instructions and no skills mean no digests, not digests of nothing', () => {
  const h = mkdtempSync(join(tmpdir(), 'session-identity-bare-'))
  run(START, h, { session_id: 'bare', model: 'm' })
  const r = record(h, 'bare')
  assert.equal('agent.profile.digest' in r.attributes, false)
  assert.equal('agent.skills.digest' in r.attributes, false)
  assert.equal(r.attributes['agent.profile.name'], 'dotfiles')
})

test('a session id that is not one path segment writes nothing', () => {
  const h = home()
  for (const session_id of ['../escape', 'a/b', '.hidden', '']) run(START, h, { session_id, model: 'm' })
  const dir = join(h, '.local', 'state', 'session-identity', 'claude-code')
  assert.deepEqual(existsSync(dir) ? readdirSync(dir) : [], [])
  assert.equal(existsSync(join(h, '.local', 'state', 'session-identity', 'escape.json')), false)
})

test('a corrupt record is replaced, and the hooks still exit 0 without output', () => {
  const h = home()
  mkdirSync(join(h, '.local', 'state', 'session-identity', 'claude-code'), { recursive: true })
  writeFileSync(recordPath(h, 's3'), 'not json')
  assert.equal(run(START, h, { session_id: 's3', model: 'm' }), '')
  assert.equal(record(h, 's3').attributes['agent.model'], 'm')
})
