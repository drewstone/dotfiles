import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const command = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'claude', 'tools', 'agent-ask')
const KEY = 'tak_test_secret_value'
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const baseTurn = (overrides = {}) => ({
  workspaceId: 'ws1', threadId: 'th-1', turnId: 't-1', state: 'working', url: 'https://app.test/app/ws1/chat/th-1',
  reply: null, failure: null, assets: [], files: [], approvals: [], ...overrides,
})

/** A stand-in for one app's /api/operator/v1; each test scripts the turn reads. */
async function startApi(script = {}) {
  const calls = []
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local')
    let body = ''
    for await (const chunk of req) body += chunk
    const call = { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body: body ? JSON.parse(body) : null }
    calls.push(call)
    const json = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)) }
    if (req.headers.authorization !== `Bearer ${KEY}`) return json(401, { error: 'Invalid API key', code: 'api_key.invalid' })
    const path = url.pathname.replace(/^\/api\/operator\/v1/, '')
    if (!url.pathname.startsWith('/api/operator/v1')) return json(404, { error: 'not found' })
    if (path === '' ) return json(200, { app: { app: 'tax', apiVersion: 'v1', capabilities: [] }, principal: { keyId: 'k', scopes: [], workspaces: script.restrictedTo ?? null } })
    if (path === '/workspaces') return json(200, { workspaces: script.workspaces ?? [{ id: 'ws1', name: 'One' }, { id: 'ws2', name: 'Two' }] })
    if (req.method === 'POST' && path === '/workspaces/ws1/turns') {
      return json(202, { turn: baseTurn({ turnId: call.body.turnId, threadId: call.body.threadId ?? 'th-1', state: 'queued' }) })
    }
    const turnRead = /^\/workspaces\/ws1\/threads\/([^/]+)\/turns\/([^/]+)$/.exec(path)
    if (turnRead) {
      const reads = calls.filter((item) => /\/turns\/[^/]+$/.test(item.path) && item.method === 'GET').length
      return json(200, { turn: (script.turn ?? (() => baseTurn()))(reads, turnRead[2]) })
    }
    if (path === '/workspaces/ws1/threads/th-existing') return json(200, { thread: { id: 'th-existing', title: 'Old' }, latestTurn: script.latest ?? null })
    if (path === '/workspaces/ws1/assets/v1') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(PNG) }
    if (path === '/workspaces/ws1/file') return json(200, { file: { path: call.query.path, content: '# Plan\n', mediaType: 'text/markdown' } })
    if (path === '/workspaces/ws1/approvals') return json(200, { approvals: script.approvals ?? [] })
    if (path === '/workspaces/ws1/scorecard') {
      return json(200, { scorecard: { workspaceId: 'ws1', generatedAt: 'x', window: { start: '2026-10-02T00:00:00Z', end: '2026-10-09T00:00:00Z', days: 7 },
        metrics: [{ key: 'turns.completed', label: 'Completed agent turns', value: 4, unit: 'count' }, { key: 'spend.usd', label: 'Settled spend', value: 1.5, unit: 'usd' }],
        outcomes: [{ key: 'assets.clicks', label: 'Recorded clicks', value: null, unit: 'count' }], measurement: 'Counts.' } })
    }
    json(404, { error: 'No operator route matches this method and path', code: 'operator.route_not_found' })
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    calls,
    close: () => new Promise((done) => server.close(done)),
  }
}

function run(api, args, { env = {}, input } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'agent-ask-test-'))
  return new Promise((done) => {
    const child = spawn(process.execPath, [command, ...args], {
      env: {
        PATH: process.env.PATH, HOME: home, TAX_BASE_URL: api?.base ?? 'http://127.0.0.1:9', TAX_OPERATOR_API_KEY: KEY,
        AGENT_ASK_HOLD_SECONDS: '1', AGENT_ASK_RETRY_MS: '20', ...env,
      },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    if (input !== undefined) child.stdin.end(input)
    else child.stdin.end()
    child.on('close', (code) => {
      rmSync(home, { recursive: true, force: true })
      assert.ok(!stdout.includes(KEY) && !stderr.includes(KEY), 'the key never reaches output')
      done({ code, stdout, stderr })
    })
  })
}

test('an ask starts a turn with a client turn id, holds reads until it settles, and prints the result', async () => {
  const api = await startApi({
    turn: (reads, turnId) => reads < 2 ? baseTurn({ turnId }) : baseTurn({
      turnId, state: 'succeeded', model: 'gpt-6-luna', costUsd: 0.31,
      reply: { content: 'Plan written.', mediaType: 'text/markdown' },
      files: [{ path: 'research/plan.md', action: 'created' }],
      assets: [{ id: 'v1', path: '/api/operator/v1/workspaces/ws1/assets/v1' }],
    }),
  })
  try {
    const result = await run(api, ['--app', 'tax', '--workspace', 'ws1', 'Draft the filing plan'])
    assert.equal(result.code, 0, result.stderr)
    const start = api.calls.find((call) => call.method === 'POST')
    assert.equal(start.path, '/api/operator/v1/workspaces/ws1/turns')
    assert.match(start.body.turnId, /^[0-9a-f-]{36}$/)
    assert.deepEqual(Object.keys(start.body).sort(), ['content', 'title', 'turnId'])
    assert.equal(start.body.title, 'Draft the filing plan')
    const reads = api.calls.filter((call) => call.method === 'GET' && call.path.endsWith(`/turns/${start.body.turnId}`))
    assert.equal(reads.length, 2)
    assert.equal(reads[0].query.wait, '1')
    assert.match(result.stdout, /status {3}completed \(model gpt-6-luna, \$0\.31\)/)
    assert.match(result.stdout, /Plan written\./)
    assert.match(result.stdout, /created {2}research\/plan\.md/)
    assert.match(result.stdout, /\/api\/operator\/v1\/workspaces\/ws1\/assets\/v1/)
  } finally {
    await api.close()
  }
})

test('--json and --download return one object and save the referenced assets', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-ask-assets-'))
  const api = await startApi({
    turn: (_reads, turnId) => baseTurn({ turnId, state: 'succeeded', reply: { content: 'Done', mediaType: 'text/markdown' },
      assets: [{ id: 'v1', path: '/api/operator/v1/workspaces/ws1/assets/v1' }] }),
  })
  try {
    const result = await run(api, ['--app', 'tax', '--workspace', 'ws1', '--json', '--download', directory, 'Make the ad'])
    assert.equal(result.code, 0, result.stderr)
    const parsed = JSON.parse(result.stdout)
    assert.equal(parsed.status, 'completed')
    assert.equal(parsed.app, 'tax')
    assert.equal(parsed.assets[0].file, join(directory, 'v1.png'))
    assert.ok(existsSync(parsed.assets[0].file))
    assert.deepEqual(readFileSync(parsed.assets[0].file), PNG)
  } finally {
    await api.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('exits 4 with the approvals a turn waits on, and 3 when the wait ends first', async () => {
  const approval = { id: 'h1', kind: 'hub', title: 'twitter tweets.create', decidedBy: 'owner', url: 'https://app.test/app/ws1/chat/th-1' }
  const waiting = await startApi({ turn: (_reads, turnId) => baseTurn({ turnId, approvals: [approval] }) })
  try {
    const result = await run(waiting, ['--app', 'tax', '--workspace', 'ws1', 'Post it'])
    assert.equal(result.code, 4, result.stderr)
    assert.match(result.stdout, /status {3}waiting/)
    assert.match(result.stdout, /hub {7}twitter tweets\.create {2}\(owner decides at https:\/\/app\.test/)
  } finally {
    await waiting.close()
  }
  const slow = await startApi()
  try {
    const result = await run(slow, ['--app', 'tax', '--workspace', 'ws1', '--wait', '2s', 'Research the market'])
    assert.equal(result.code, 3, result.stderr)
    assert.match(result.stdout, /follow with: agent-ask --app tax --workspace ws1 status th-1 --wait 30m/)
    const admitted = await run(slow, ['--app', 'tax', '--workspace', 'ws1', '--wait', '0', 'Research again'])
    assert.equal(admitted.code, 3)
    assert.match(admitted.stdout, /status {3}admitted/)
  } finally {
    await slow.close()
  }
})

test('uses the Tangle agent key when the app has no key of its own', async () => {
  const api = await startApi({ turn: (_reads, turnId) => baseTurn({ turnId, state: 'succeeded', reply: { content: 'ok', mediaType: 'text/markdown' } }) })
  try {
    const result = await run(api, ['--app', 'tax', '--workspace', 'ws1', 'Go'], { env: { TAX_OPERATOR_API_KEY: '', TANGLE_AGENT_KEY: KEY } })
    assert.equal(result.code, 0, result.stderr)
  } finally {
    await api.close()
  }
  const missing = await run(null, ['--app', 'tax', '--workspace', 'ws1', 'Go'], { env: { TAX_OPERATOR_API_KEY: '' } })
  assert.equal(missing.code, 2)
  assert.match(missing.stderr, /set TAX_OPERATOR_API_KEY .* or TANGLE_AGENT_KEY/)
})

test('a failed turn exits 1 and prints its failure', async () => {
  const api = await startApi({ turn: (_reads, turnId) => baseTurn({ turnId, state: 'failed', failure: { code: 'sandbox_unavailable', message: 'The sandbox did not start' } }) })
  try {
    const result = await run(api, ['--app', 'tax', '--workspace', 'ws1', 'Do it'])
    assert.equal(result.code, 1)
    assert.match(result.stdout, /failure  sandbox_unavailable The sandbox did not start/)
  } finally {
    await api.close()
  }
})

test('status reads the latest turn, and a running thread refuses a second ask', async () => {
  const api = await startApi({ latest: baseTurn({ threadId: 'th-existing', turnId: 't-9', state: 'working' }) })
  try {
    const status = await run(api, ['--app', 'tax', '--workspace', 'ws1', 'status', 'th-existing'])
    assert.equal(status.code, 3)
    assert.match(status.stdout, /status {3}running/)
    const refused = await run(api, ['--app', 'tax', '--workspace', 'ws1', '--thread', 'th-existing', 'More'])
    assert.equal(refused.code, 3)
    assert.match(refused.stderr, /already has a running turn/)
    assert.equal(api.calls.filter((call) => call.method === 'POST').length, 0)
  } finally {
    await api.close()
  }
})

test('picks the key\'s only workspace, or asks for one', async () => {
  const restricted = await startApi({ restrictedTo: ['ws1'], turn: (_reads, turnId) => baseTurn({ turnId, state: 'succeeded', reply: { content: 'ok', mediaType: 'text/markdown' } }) })
  try {
    const result = await run(restricted, ['--app', 'tax', 'Go'])
    assert.equal(result.code, 0, result.stderr)
  } finally {
    await restricted.close()
  }
  const many = await startApi()
  try {
    const result = await run(many, ['--app', 'tax', 'Go'])
    assert.equal(result.code, 2)
    assert.match(result.stderr, /choose a workspace with --workspace or TAX_WORKSPACE_ID/)
    assert.match(result.stderr, /ws2 {2}Two/)
  } finally {
    await many.close()
  }
})

test('reads files, approvals and the scorecard', async () => {
  const api = await startApi({ approvals: [{ id: 'a1', kind: 'asset', title: 'Asset awaiting review', decidedBy: 'editor' }] })
  try {
    const file = await run(api, ['--app', 'tax', '--workspace', 'ws1', 'file', 'research/plan.md'])
    assert.equal(file.stdout, '# Plan\n')
    const approvals = await run(api, ['--app', 'tax', '--workspace', 'ws1', 'approvals'])
    assert.equal(approvals.code, 4)
    assert.match(approvals.stdout, /asset {5}Asset awaiting review {2}\(editor decides\)/)
    const scorecard = await run(api, ['--app', 'tax', '--workspace', 'ws1', 'scorecard'])
    assert.equal(scorecard.code, 0)
    assert.match(scorecard.stdout, /Completed agent turns\s+4/)
    assert.match(scorecard.stdout, /Settled spend\s+\$1\.50/)
    assert.match(scorecard.stdout, /Recorded clicks\s+—/)
  } finally {
    await api.close()
  }
})

test('refuses plaintext remote origins, unknown apps, and reports an app that does not serve the API', async () => {
  const remote = await run(null, ['--app', 'tax', '--workspace', 'ws1', 'Go'], { env: { TAX_BASE_URL: 'http://taxes.example.com' } })
  assert.equal(remote.code, 2)
  assert.match(remote.stderr, /refusing to send a key to http:\/\/taxes\.example\.com/)
  const unknown = await run(null, ['--app', 'nope', 'Go'])
  assert.equal(unknown.code, 2)
  assert.match(unknown.stderr, /unknown app "nope"/)
  const legacy = createServer((_req, res) => { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<html>Not Found</html>') })
  await new Promise((done) => legacy.listen(0, '127.0.0.1', done))
  try {
    const result = await run({ base: `http://127.0.0.1:${legacy.address().port}` }, ['--app', 'tax', '--workspace', 'ws1', 'Go'])
    assert.equal(result.code, 1)
    assert.match(result.stderr, /Tax Agent at http:\/\/127\.0\.0\.1:\d+ does not serve the operator API yet/)
  } finally {
    await new Promise((done) => legacy.close(done))
  }
  const wrongKey = await startApi()
  try {
    const result = await run(wrongKey, ['--app', 'tax', '--workspace', 'ws1', 'Go'], { env: { TAX_OPERATOR_API_KEY: 'tak_wrong' } })
    assert.equal(result.code, 1)
    assert.match(result.stderr, /401 api_key\.invalid/)
  } finally {
    await wrongKey.close()
  }
})
