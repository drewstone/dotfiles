// The change ledger through its real boundary: PostToolUse JSON on stdin to the hook, a real git
// repository on disk, the row in ~/.local/state/change-ledger/changes.jsonl. The agent-eval
// procedure registry joins an intent to the changes of its span by these rows, so each commit and
// pull request must name its session, its tool call and its repository, and a session the hook
// never saw must leave no row (unknown, never "no change").
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOOK = new URL('../claude/hooks/change-ledger.sh', import.meta.url).pathname

function scratch(remote = `https://user:token${'@'}github.com/acme/widgets.git`) {
  const root = mkdtempSync(join(tmpdir(), 'change-ledger-'))
  const repo = join(root, 'repo')
  const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], {
    encoding: 'utf8', env: { ...process.env, GIT_ALLOW_TEST_IDENTITY: '1' },
  })
  execFileSync('git', ['init', '-q', repo])
  git('remote', 'add', 'origin', remote)
  return { root, repo, git, state: join(root, 'state') }
}

function hook(s, payload, extra = {}) {
  const r = spawnSync('bash', [HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', cwd: s.repo, ...payload }),
    env: { ...process.env, HOME: s.root, CHANGE_LEDGER_DIR: s.state, ...extra },
    encoding: 'utf8',
  })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, '')
}
const rows = (s) => (existsSync(join(s.state, 'changes.jsonl'))
  ? readFileSync(join(s.state, 'changes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])

test('a commit writes the session, the tool call, the repository and the full sha, no credential', () => {
  const s = scratch()
  const stdout = s.git('commit', '--allow-empty', '-m', 'one')
  hook(s, { session_id: 'sess-1', tool_use_id: 'toolu_1', tool_input: { command: 'git commit --allow-empty -m one' }, tool_response: { stdout, stderr: '', interrupted: false } })
  const sha = s.git('rev-parse', 'HEAD').trim()
  const [observed, commit] = rows(s)
  assert.equal(observed.action, 'observed')
  assert.equal(observed.sessionId, 'sess-1')
  assert.deepEqual(
    { action: commit.action, sessionId: commit.sessionId, agentId: commit.agentId, toolUseId: commit.toolUseId, remote: commit.remote, sha: commit.sha, pr: commit.pr, harness: commit.harness },
    { action: 'commit', sessionId: 'sess-1', agentId: null, toolUseId: 'toolu_1', remote: 'acme/widgets', sha, pr: null, harness: 'claude-code' })
  assert.doesNotMatch(readFileSync(join(s.state, 'changes.jsonl'), 'utf8'), /token|user:|git commit/)
})

test('a subagent commit names the agent, a cd into the repository finds it, and a failed commit writes nothing', () => {
  const s = scratch('git@github.com:acme/widgets.git')
  const stdout = s.git('commit', '--allow-empty', '-m', 'two')
  hook(s, { session_id: 'sess-1', agent_id: 'agent-7', tool_use_id: 'toolu_2', cwd: s.root, tool_input: { command: 'cd repo && git commit -m two' }, tool_response: { stdout, stderr: '' } })
  hook(s, { session_id: 'sess-1', agent_id: 'agent-7', tool_use_id: 'toolu_3', tool_input: { command: 'git commit -m none' }, tool_response: { stdout: 'nothing to commit, working tree clean', stderr: '' } })
  const written = rows(s)
  assert.deepEqual(written.map((r) => r.action), ['observed', 'commit'])
  assert.equal(written[1].agentId, 'agent-7')
  assert.equal(written[1].sessionId, 'sess-1')
  assert.equal(written[1].remote, 'acme/widgets')
})

test('gh pr create names the pull request by its URL, and gh pr merge by its number and repository flag', () => {
  const s = scratch()
  hook(s, { session_id: 's', tool_use_id: 't1', tool_input: { command: 'gh-bot pr create --title x --body y' }, tool_response: { stdout: 'https://github.com/acme/widgets/pull/41\n' } })
  hook(s, { session_id: 's', tool_use_id: 't2', tool_input: { command: 'gh-bot pr merge 41 --merge -R acme/widgets' }, tool_response: { stdout: '' } })
  hook(s, { session_id: 's', tool_use_id: 't3', tool_input: { command: 'gh-bot pr merge 42 --merge' }, tool_response: { stdout: '' } })
  const [, create, merge, local] = rows(s)
  assert.deepEqual([create.action, create.remote, create.pr, create.toolUseId], ['pr-create', 'acme/widgets', 41, 't1'])
  assert.deepEqual([merge.action, merge.remote, merge.pr], ['pr-merge', 'acme/widgets', 41])
  assert.deepEqual([local.action, local.remote, local.pr], ['pr-merge', 'acme/widgets', 42])
})

test('a session that only ran other commands leaves one observed row, then none; unseen sessions leave nothing', () => {
  const s = scratch()
  for (const id of ['a', 'b', 'c']) hook(s, { session_id: 'only-reads', tool_use_id: id, tool_input: { command: 'ls' }, tool_response: { stdout: 'x' } })
  assert.deepEqual(rows(s).map((r) => [r.sessionId, r.action]), [['only-reads', 'observed']])
  assert.equal(rows(s).some((r) => r.sessionId === 'never-ran'), false)
})

test('a malformed payload or an unsafe session id is ignored and the hook still exits 0', () => {
  const s = scratch()
  const env = { ...process.env, HOME: s.root, CHANGE_LEDGER_DIR: s.state }
  assert.equal(spawnSync('bash', [HOOK], { input: 'not json commit', env }).status, 0)
  hook(s, { session_id: '../escape', tool_input: { command: 'git commit -m x' }, tool_response: { stdout: '[main abc1234] x' } })
  assert.deepEqual(rows(s), [])
})
