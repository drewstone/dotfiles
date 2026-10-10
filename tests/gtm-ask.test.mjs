import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const command = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'claude', 'tools', 'gtm-ask')
const KEY = 'gak_test_secret_value'
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** A stand-in for the GTM operator API; each test scripts the parts it exercises. */
async function startApi(script = {}) {
  const calls = []
  const open = new Set()
  const threads = new Map([['th-existing', []]])
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local')
    let body = ''
    for await (const chunk of req) body += chunk
    const call = { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body: body ? JSON.parse(body) : null }
    calls.push(call)
    if (req.headers.authorization !== `Bearer ${KEY}`) {
      res.writeHead(401, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: 'Unauthorized' }))
    }
    const json = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)) }
    const stream = (events, hold) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' })
      for (const event of events) res.write(JSON.stringify(event) + '\n')
      if (hold) { open.add(res); res.on('close', () => open.delete(res)) } else res.end()
    }
    const refusal = script.minuteRefusals?.[`${req.method} ${url.pathname}`]
    if (refusal && refusal.left > 0) {
      refusal.left -= 1
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1' })
      return res.end(JSON.stringify({ code: 'api_key.request_limit_exceeded', limit: 'minute' }))
    }
    if (req.method === 'POST' && url.pathname === '/api/threads') {
      const id = `th-${threads.size}`
      threads.set(id, [])
      return json(201, { thread: { id, title: call.body.title } })
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const thread = threads.get(call.body.threadId) ?? []
      thread.push({ id: 'u1', role: 'user', content: call.body.content, parts: [] })
      threads.set(call.body.threadId, thread)
      return stream(script.chat ?? [], script.holdChat)
    }
    if (url.pathname === '/api/chat/running') {
      const refused = script.runningRefusal?.(calls)
      if (refused) return json(refused.status, refused.body)
      return json(200, { running: script.running?.(calls) ?? [] })
    }
    if (url.pathname.startsWith('/api/chat/replay/')) {
      const replay = typeof script.replay === 'function' ? script.replay(calls) : script.replay
      return replay ? stream(replay.events ?? replay, Boolean(replay.hold)) : json(404, { error: 'no buffer' })
    }
    if (url.pathname === '/api/chat/interactions') return json(200, { interactions: script.interactions ?? [] })
    const threadMatch = /^\/api\/threads\/([^/]+)$/.exec(url.pathname)
    if (threadMatch) {
      const messages = script.messages ?? [...(threads.get(threadMatch[1]) ?? []), ...(script.reply ? [script.reply] : [])]
      return json(200, { thread: { id: threadMatch[1] }, messages })
    }
    if (/\/asset-versions\/[^/]+\/file$/.test(url.pathname)) {
      res.writeHead(200, { 'content-type': 'image/png' })
      return res.end(PNG)
    }
    if (url.pathname === '/api/vault/file') return json(200, { file: { path: call.query.path, content: '# Plan\n' } })
    json(404, { error: 'not found' })
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    calls,
    async close() {
      for (const res of open) res.destroy()
      await new Promise((done) => server.close(done))
    },
  }
}

function run(api, args, { env = {}, input } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'gtm-ask-test-'))
  return new Promise((done) => {
    const child = spawn(process.execPath, [command, ...args], {
      env: {
        PATH: process.env.PATH, HOME: home, GTM_BASE_URL: api?.base ?? 'http://127.0.0.1:9',
        GTM_OPERATOR_API_KEY: KEY, GTM_ASK_POLL_MS: '20', GTM_ASK_POLL_MAX_MS: '160', GTM_ASK_INTERACTION_GRACE_MS: '100', ...env,
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

const completed = (executionId) => [
  { type: 'turn', turnId: 'x' },
  { type: 'execution.started', data: { executionId } },
  { type: 'text', text: 'Working' },
  { type: 'done', data: { outcome: { type: 'completed' } } },
  { type: 'stream.terminal', data: { status: 'completed' }, id: '9' },
]

const reply = (threadId, extra = {}) => ({
  id: `assistant:gtm-agent:${threadId}:0`,
  role: 'assistant',
  content: 'Plan written. Preview: /api/workspaces/ws1/asset-versions/v123/file',
  model: 'gpt-6.1-sol',
  parts: [
    { type: 'session-artifact', path: 'research/plan.md', action: 'created' },
    { type: 'tool', state: { output: '{"url":"/api/workspaces/ws1/asset-versions/v456/file"}' } },
  ],
  ...extra,
})

test('a new ask creates a thread, sends the default model, and prints reply, assets and vault writes', async () => {
  const api = await startApi({ chat: completed('gtm-agent:th-1:0'), reply: reply('th-1') })
  try {
    const result = await run(api, ['--workspace', 'ws1', 'Draft the launch plan'])
    assert.equal(result.code, 0, result.stderr)
    const chat = api.calls.find((call) => call.path === '/api/chat')
    assert.equal(chat.body.model, 'gpt-6-luna')
    assert.equal(chat.body.workspaceId, 'ws1')
    assert.equal(chat.body.threadId, 'th-1')
    assert.equal(chat.body.content, 'Draft the launch plan')
    assert.match(chat.body.turnId, /^[0-9a-f-]{36}$/)
    assert.equal(api.calls.find((call) => call.path === '/api/threads').body.title, 'Draft the launch plan')
    assert.match(result.stderr, /thread th-1 .*\/app\/ws1\/chat\/th-1/)
    assert.match(result.stdout, /status {3}completed/)
    assert.match(result.stdout, /Plan written\./)
    assert.match(result.stdout, /created {2}research\/plan\.md/)
    assert.match(result.stdout, /\/api\/workspaces\/ws1\/asset-versions\/v123\/file/)
    assert.match(result.stdout, /asset-versions\/v456\/file/)
  } finally {
    await api.close()
  }
})

test('--json and --download return one object and save the referenced assets', async () => {
  const api = await startApi({ chat: completed('gtm-agent:th-1:0'), reply: reply('th-1') })
  const directory = mkdtempSync(join(tmpdir(), 'gtm-ask-assets-'))
  try {
    const result = await run(api, ['--workspace', 'ws1', '--json', '--download', directory, '-'], { input: 'Make two ads\n' })
    assert.equal(result.code, 0, result.stderr)
    const output = JSON.parse(result.stdout)
    assert.equal(output.status, 'completed')
    assert.equal(output.executionId, 'gtm-agent:th-1:0')
    assert.deepEqual(output.vault, [{ action: 'created', path: 'research/plan.md' }])
    assert.deepEqual(output.assets.map((asset) => asset.versionId), ['v123', 'v456'])
    assert.ok(existsSync(output.assets[0].file))
    assert.deepEqual(readFileSync(output.assets[0].file), PNG)
    assert.equal(api.calls.find((call) => call.path === '/api/chat').body.content, 'Make two ads')
  } finally {
    rmSync(directory, { recursive: true, force: true })
    await api.close()
  }
})

test('a stream that drops early is followed by polling until the thread has no running turn', async () => {
  let reads = 0
  const api = await startApi({
    chat: [{ type: 'turn', turnId: 'x' }],
    running: () => (reads++ < 2 ? ['x'] : []),
    reply: reply('th-1'),
  })
  try {
    const result = await run(api, ['--workspace', 'ws1', 'Draft the plan'])
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /completed/)
    assert.ok(api.calls.filter((call) => call.path === '/api/chat/running').length >= 3)
  } finally {
    await api.close()
  }
})

test('checks between streams back off exponentially to the cap instead of polling at a fixed interval', async () => {
  const times = []
  const api = await startApi({
    chat: [{ type: 'turn', turnId: 'x' }],
    running: () => { times.push(Date.now()); return times.length < 7 ? ['x'] : [] },
    reply: reply('th-1'),
  })
  try {
    const result = await run(api, ['--workspace', 'ws1', 'Draft the plan'])
    assert.equal(result.code, 0, result.stderr)
    const gaps = times.slice(1).map((time, index) => time - times[index])
    assert.ok(gaps[1] >= gaps[0] * 1.5 && gaps[2] >= gaps[1] * 1.5, `gaps grow: ${gaps.join(', ')}`)
    assert.ok(gaps.at(-1) >= 150 && gaps.at(-1) < 400, `the last gaps sit at the 160 ms cap: ${gaps.join(', ')}`)
  } finally {
    await api.close()
  }
})

test('a replay that carries the wait costs one request, and a reopened replay resumes after the last event', async () => {
  let replays = 0
  const api = await startApi({
    chat: [{ type: 'turn', turnId: 'x' }, { type: 'execution.started', data: { executionId: 'gtm-agent:th-1:0' } }],
    running: (calls) => (calls.filter((call) => call.path.startsWith('/api/chat/replay/')).length < 2 ? ['x'] : []),
    replay: () => (++replays === 1
      ? [{ seq: 5, type: 'text', text: 'a' }, { seq: 7, type: 'text', text: 'b' }]
      : [{ seq: 8, type: 'done', data: {} }, { seq: 9, type: 'stream.terminal', data: { status: 'completed' } }]),
    reply: reply('th-1'),
  })
  try {
    const result = await run(api, ['--workspace', 'ws1', 'Draft the plan'])
    assert.equal(result.code, 0, result.stderr)
    const opened = api.calls.filter((call) => call.path.startsWith('/api/chat/replay/'))
    assert.deepEqual(opened.map((call) => call.query.fromSeq), ['0', '7'])
    assert.ok(api.calls.length <= 10, `${api.calls.length} requests for the whole turn`)
  } finally {
    await api.close()
  }
})

test('a spent daily allowance stops the wait with the server\'s reason instead of retrying', async () => {
  const api = await startApi({
    chat: [{ type: 'turn', turnId: 'x' }],
    runningRefusal: () => ({ status: 429, body: { code: 'api_key.request_limit_exceeded', limit: 'daily', resetAt: '2026-10-11T00:00:00.000Z' } }),
  })
  try {
    const result = await run(api, ['--workspace', 'ws1', 'Draft the plan'])
    assert.equal(result.code, 1)
    assert.match(result.stderr, /429.*daily.*2026-10-11T00:00:00\.000Z/)
    assert.equal(api.calls.filter((call) => call.path === '/api/chat/running').length, 1)
  } finally {
    await api.close()
  }
})

test('status reports the answer row, not the work-product rows written before it', async () => {
  const api = await startApi({
    messages: [
      { id: 'u1', role: 'user', content: 'Build the shortlist', parts: [] },
      { id: 'wp1', role: 'assistant', content: '', parts: [{ type: 'work_product', kind: 'outreach_draft' }] },
      { id: 'wp2', role: 'assistant', content: '', parts: [{ type: 'work_product', kind: 'outreach_draft' }] },
      { id: 'assistant:gtm-agent:th-existing:0', role: 'assistant', content: 'Two drafts are held for review.', parts: [] },
    ],
  })
  try {
    const result = await run(api, ['status', 'th-existing', '--workspace', 'ws1', '--json'])
    assert.equal(result.code, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout).reply, 'Two drafts are held for review.')
  } finally {
    await api.close()
  }
})

test('held calls approved by the thread\'s auto-approve mode report the agent as still resuming', async () => {
  const api = await startApi({
    chat: completed('gtm-agent:th-1:0'),
    reply: reply('th-1', { parts: [{ type: 'tool', hubApprovalAuto: { mode: 'thread' }, hubApprovalDecision: { decision: 'approve' }, state: { status: 'error', error: '{"code":"HUB_APPROVAL_REQUIRED"}' } }] }),
  })
  try {
    const result = await run(api, ['--workspace', 'ws1', 'Open the pull request'])
    assert.equal(result.code, 3)
    assert.match(result.stdout, /status {3}resuming/)
    assert.match(result.stdout, /1 held call ran on the thread's auto-approve mode .*follow with: gtm-ask status th-1 --wait 30m/)
  } finally {
    await api.close()
  }
})

test('a request refused by the per-minute limit is sent again after Retry-After', async () => {
  const api = await startApi({
    chat: completed('gtm-agent:th-1:0'), reply: reply('th-1'),
    minuteRefusals: { 'POST /api/threads': { left: 1 }, 'POST /api/chat': { left: 1 } },
  })
  try {
    const result = await run(api, ['--workspace', 'ws1', 'Draft the plan'])
    assert.equal(result.code, 0, result.stderr)
    assert.equal(api.calls.filter((call) => call.path === '/api/threads' && call.method === 'POST').length, 2)
    assert.equal(api.calls.filter((call) => call.path === '/api/chat').length, 2)
    const chats = api.calls.filter((call) => call.path === '/api/chat')
    assert.equal(chats[0].body.turnId, chats[1].body.turnId, 'the retried send keeps its turn id')
  } finally {
    await api.close()
  }
})

test('a turn-failure notice is reported as a failure', async () => {
  const api = await startApi({
    chat: completed('gtm-agent:th-1:0'),
    reply: reply('th-1', { content: '', parts: [{ type: 'notice', noticeKind: 'turn-failure', code: 'sandbox.native_turn_failed', text: 'opencode execution failed: Forbidden' }] }),
  })
  try {
    const result = await run(api, ['--workspace', 'ws1', 'Draft the plan'])
    assert.equal(result.code, 1)
    assert.match(result.stdout, /status {3}failed/)
    assert.match(result.stdout, /Forbidden/)
  } finally {
    await api.close()
  }
})

test('a thread with a running turn is not sent another message', async () => {
  const api = await startApi({ running: () => ['busy'] })
  try {
    const result = await run(api, ['--workspace', 'ws1', '--thread', 'th-existing', 'Next step'])
    assert.equal(result.code, 3)
    assert.match(result.stderr, /gtm-ask status th-existing --wait 30m/)
    assert.equal(api.calls.some((call) => call.path === '/api/chat'), false)
  } finally {
    await api.close()
  }
})

test('a question the agent leaves open stops the wait and is listed as pending', async () => {
  const api = await startApi({
    chat: [
      { type: 'turn', turnId: 'x' },
      { type: 'execution.started', data: { executionId: 'gtm-agent:th-1:0' } },
      { type: 'interaction', data: { request: { id: 'q1', kind: 'question', title: 'Which audience first?' } } },
    ],
    holdChat: true,
  })
  try {
    const result = await run(api, ['--workspace', 'ws1', 'Draft the plan'])
    assert.equal(result.code, 4)
    assert.match(result.stdout, /status {3}waiting/)
    assert.match(result.stdout, /question {2}Which audience first\?/)
  } finally {
    await api.close()
  }
})

test('an undecided Hub approval in the reply is listed as pending', async () => {
  const approval = { code: 'HUB_APPROVAL_REQUIRED', approval: { id: 'ap1', connectionId: 'c1', actionPath: 'posts/create', providerId: 'linkedin', status: 'pending', expiresAt: '2026-10-09T00:00:00Z' } }
  const api = await startApi({
    chat: completed('gtm-agent:th-1:0'),
    reply: reply('th-1', { parts: [{ type: 'tool', state: { error: `Hub refused: ${JSON.stringify(approval)}` } }] }),
  })
  try {
    const result = await run(api, ['--workspace', 'ws1', 'Post it'])
    assert.equal(result.code, 4)
    assert.match(result.stdout, /hub {7}linkedin posts\/create {2}expires 2026-10-09T00:00:00Z/)
  } finally {
    await api.close()
  }
})

test('the wait budget ends with the turn still running and a follow command', async () => {
  const api = await startApi({ chat: [{ type: 'turn', turnId: 'x' }], holdChat: true })
  try {
    const result = await run(api, ['--workspace', 'ws1', '--wait', '300ms', 'Draft the plan'])
    assert.equal(result.code, 3)
    assert.match(result.stdout, /status {3}running/)
    assert.match(result.stdout, /follow with: gtm-ask status th-1 --wait 30m --workspace ws1/)
  } finally {
    await api.close()
  }
})

test('--wait 0 returns once the execution is admitted', async () => {
  const api = await startApi({
    chat: [{ type: 'turn', turnId: 'x' }, { type: 'execution.started', data: { executionId: 'gtm-agent:th-1:0' } }],
    holdChat: true,
  })
  try {
    const result = await run(api, ['--workspace', 'ws1', '--wait', '0', '--json', 'Draft the plan'])
    assert.equal(result.code, 0, result.stderr)
    const output = JSON.parse(result.stdout)
    assert.equal(output.status, 'admitted')
    assert.equal(output.executionId, 'gtm-agent:th-1:0')
  } finally {
    await api.close()
  }
})

test('status prints the reply to the thread\'s latest ask without waiting', async () => {
  const api = await startApi({ reply: reply('th-existing') })
  try {
    const result = await run(api, ['status', 'th-existing', '--workspace', 'ws1'])
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /Plan written\./)
    assert.equal(api.calls.some((call) => call.path.startsWith('/api/chat/replay')), false)
  } finally {
    await api.close()
  }
})

test('file prints a vault file', async () => {
  const api = await startApi()
  try {
    const result = await run(api, ['file', 'research/plan.md', '--workspace', 'ws1'])
    assert.equal(result.code, 0, result.stderr)
    assert.equal(result.stdout, '# Plan\n')
    assert.deepEqual(api.calls[0].query, { workspaceId: 'ws1', path: 'research/plan.md' })
  } finally {
    await api.close()
  }
})

test('a missing key is a configuration error that names where to store it', async () => {
  const result = await run(null, ['Draft the plan'], { env: { GTM_OPERATOR_API_KEY: '', GTM_ASK_SECRETS_FILE: '/nonexistent/agent-state.env' } })
  assert.equal(result.code, 2)
  assert.match(result.stderr, /no operator key: set GTM_OPERATOR_API_KEY, or store one with `dotenvx set/)
})

test('a vault without the slot says the checkout may be behind tangle-devops main', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gtm-ask-vault-'))
  const vault = join(directory, 'agent-state.env')
  writeFileSync(vault, 'OTHER_KEY="value"\n')
  try {
    const result = await run(null, ['Draft the plan'], { env: { GTM_OPERATOR_API_KEY: '', GTM_ASK_SECRETS_FILE: vault } })
    assert.equal(result.code, 2)
    assert.match(result.stderr, /GTM_OPERATOR_API_KEY is not readable in .*agent-state\.env|install dotenvx/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
