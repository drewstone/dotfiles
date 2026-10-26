#!/usr/bin/env node
// Sandbox placement for beelink-gate: when both Beelinks refuse or an auto gate has waited past
// BEELINK_GATE_SANDBOX_AFTER, the same command runs as one Tangle Sandbox managed process job.
// It prints the gate's output, appends a receipt to a Beelink's receipts.jsonl through
// `beelink-gate --sandbox-receipt` (so `--receipt` and gh-drew read it unchanged) and exits with
// the command's exit code. Exit 75 means no box was bought or none could start; the caller keeps
// waiting for a Beelink.
//
//   beelink_gate_sandbox.mjs run <repo-url> <sha> <mode> <class> [branch] -- <command> [args...]
//   beelink_gate_sandbox.mjs live    (prints live gate boxes, for --queue)
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

const TEMPFAIL = 75
// The SDK version factory's managed jobs run on (factory package.json); bump both together.
const SDK_VERSION = '0.64.40'
const BOX_PREFIX = 'beelink-gate-'
// Production hosts refused 16 GB with CAPACITY_EXHAUSTED on 2026-10-26 and admitted 8 GB in 2.5 s.
const RESOURCES = { cpuCores: Number(process.env.BEELINK_GATE_SANDBOX_CPUS || 8), memoryMB: Number(process.env.BEELINK_GATE_SANDBOX_MEMORY_MB || 8192), diskGB: 40 }
const MAX_LIVE = Number(process.env.BEELINK_GATE_SANDBOX_MAX || 4)
const HOLD_S = Number(process.env.BEELINK_GATE_SANDBOX_HOLD_S || 45 * 60)
const SETTLED = new Set(['succeeded', 'failed', 'cancelled', 'expired'])

const say = (line) => process.stderr.write(`beelink-gate: ${line}\n`)
const tempfail = (why) => { say(`TEMPFAIL next_allowed=${new Date(Date.now() + 300_000).toISOString().slice(0, 19)}Z sandbox ${why}`); process.exit(TEMPFAIL) }

function apiKey() {
  const file = path.join(homedir(), '.config', 'tangle', 'beelink-gate-sandbox.key')
  return process.env.BEELINK_GATE_SANDBOX_KEY?.trim() || (existsSync(file) ? readFileSync(file, 'utf8').trim() : '')
}

// The SDK is installed once per launcher into the gate's cache at the pinned version.
async function sdk() {
  const root = path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), '.cache'), 'beelink-gate', `sandbox-sdk-${SDK_VERSION}`)
  const entry = path.join(root, 'node_modules', '@tangle-network', 'sandbox', 'dist', 'index.js')
  if (!existsSync(entry)) {
    mkdirSync(root, { recursive: true })
    const npm = spawnSync('npm', ['install', '--prefix', root, '--no-save', '--no-audit', '--no-fund', '--ignore-scripts', `@tangle-network/sandbox@${SDK_VERSION}`],
      { encoding: 'utf8', timeout: 180_000 })
    if (npm.status !== 0 || !existsSync(entry)) tempfail(`SDK ${SDK_VERSION} install failed: ${(npm.stderr || '').trim().split('\n').at(-1)}`)
  }
  return import(entry)
}

const quote = (s) => `'${String(s).replace(/'/g, `'"'"'`)}'`

// The in-box gate: the repo's .nvmrc Node, its packageManager through corepack, the gated commit with
// the default branch's origin ref (turbo --filter=...[origin/develop] needs it), the frozen install the
// Beelink gate runs, then the command. Each step prints a marker; the last one names a failed step.
function gateScript({ repoUrl, sha, mode, branch, command }) {
  const install = mode === 'install' || mode === 'ship'
  return `set -o pipefail
step() { echo "beelink-gate-sandbox: $1 $(date -u +%H:%M:%SZ)" >&2; }
export HOME=$(getent passwd "$(id -u)" | cut -d: -f6); cd "$HOME"
export PATH="$HOME/.node/bin:$HOME/.local/bin:\${NIX_BIN_PATH:+$NIX_BIN_PATH:}$PATH" COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1
export GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=credential.https://github.com.helper GIT_CONFIG_VALUE_0= \\
  GIT_CONFIG_KEY_1=credential.https://github.com.helper GIT_CONFIG_VALUE_1='!gh auth git-credential'
step fetch
rm -rf repo && git init -q repo && cd repo && git remote add origin ${quote(repoUrl)} || exit 70
git fetch -q --filter=blob:none origin ${sha} || exit 70
for b in main develop ${branch ? quote(branch) : ''}; do git fetch -q --filter=blob:none origin "+refs/heads/$b:refs/remotes/origin/$b" 2>/dev/null; done
${branch ? `git checkout -q -B ${quote(branch)} ${sha} && git branch -q --set-upstream-to=origin/${quote(branch)}` : `git checkout -q --detach ${sha}`} || exit 70
if [ -f .nvmrc ]; then
  step node
  v=$(tr -d 'v \\n' < .nvmrc); have=$(node -v 2>/dev/null | tr -d v)
  case "$have" in "$v"|"$v".*) ;; *)
    f=$(curl -fsSL "https://nodejs.org/dist/latest-v\${v%%.*}.x/" | grep -o "node-v$v[0-9.]*-linux-x64.tar.xz" | head -1)
    [ -n "$f" ] || f=$(curl -fsSL "https://nodejs.org/dist/latest-v\${v%%.*}.x/" | grep -o 'node-v[0-9.]*-linux-x64.tar.xz' | head -1)
    rm -rf "$HOME/.node" && mkdir -p "$HOME/.node" && curl -fsSL "https://nodejs.org/dist/latest-v\${v%%.*}.x/$f" | tar -xJ -C "$HOME/.node" --strip-components=1 || exit 70 ;;
  esac
fi
mkdir -p "$HOME/.local/bin" && corepack enable --install-directory "$HOME/.local/bin" 2>/dev/null
${install ? `step install
if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile
elif [ -f package-lock.json ]; then npm ci
elif [ -f yarn.lock ]; then if grep -q '__metadata' yarn.lock; then yarn install --immutable; else yarn install --frozen-lockfile; fi
elif [ -f package.json ] && grep -q '"dependencies"\\|"devDependencies"' package.json; then echo 'no supported lockfile' >&2; exit 1
fi || exit $?` : ''}
step command
${command.map(quote).join(' ')}
`
}

async function run(argv) {
  const sep = argv.indexOf('--')
  if (sep < 4) { say('usage: beelink_gate_sandbox.mjs run <repo-url> <sha> <mode> <class> [branch] -- <command>'); process.exit(64) }
  const [repoUrl, sha, mode, gateClass, branch = ''] = argv.slice(0, sep)
  const command = argv.slice(sep + 1)
  const key = apiKey()
  if (!key) tempfail('placement has no key: set BEELINK_GATE_SANDBOX_KEY or ~/.config/tangle/beelink-gate-sandbox.key')
  const { Sandbox } = await sdk()
  const client = new Sandbox({ apiKey: key, baseUrl: process.env.BEELINK_GATE_SANDBOX_URL || 'https://sandbox.tangle.tools' })
  // A global cap across launchers: gate boxes are named, so the live list is the count.
  const live = (await client.list().catch(() => [])).filter((b) => b.name?.startsWith(BOX_PREFIX) && !['deleted', 'stopped', 'failed'].includes(b.status))
  if (live.length >= MAX_LIVE) tempfail(`cap reached: ${live.length} of ${MAX_LIVE} gate boxes live`)
  const id = randomBytes(16).toString('hex')
  const gateId = `sandbox-${id}`
  const repo = repoUrl.replace(/^(?:git@([^:]+):|ssh:\/\/git@([^/]+)\/|https?:\/\/([^/]+)\/)(.+?)(?:\.git)?\/?$/, (_, a, b, c, r) => `${a || b || c}/${r}`)
  const started = Date.now()
  say(`gate_id=${gateId}; placing on a Tangle sandbox (${RESOURCES.cpuCores} CPU, ${RESOURCES.memoryMB} MB)`)
  let box
  try {
    box = await client.create({ name: `${BOX_PREFIX}${id.slice(0, 12)}`, resources: RESOURCES, secrets: ['GH_TOKEN'], egressPolicy: { mode: 'open' },
      maxLifetimeSeconds: HOLD_S + 600, idleTimeoutSeconds: HOLD_S, deleteAfterStoppedSeconds: 300, retry: { capacity: false } })
  } catch (error) {
    tempfail(`create refused: ${error.code || error.status || ''} ${String(error.message).slice(0, 200)}`)
  }
  const created = Date.now()
  let exit = 1, outcome = 'unknown'
  const stop = async () => { await box.delete().catch(() => undefined) }
  process.on('SIGTERM', () => { stop().finally(() => process.exit(143)) })
  process.on('SIGINT', () => { stop().finally(() => process.exit(130)) })
  try {
    await box.write('gate.sh', gateScript({ repoUrl, sha, mode, branch, command }))
    const job = await box.process.jobs.submit({ id: 'gate', executable: 'bash', args: ['-c', 'bash gate.sh > gate.log 2>&1; echo $? > gate.exit'], cwd: '.',
      envKeys: ['PATH', 'NIX_BIN_PATH', 'GH_TOKEN'], deadlineAt: Date.now() + HOLD_S * 1000,
      restart: { maxAttempts: 1, initialBackoffMs: 1000, maxBackoffMs: 1000, exitCodes: [], afterInterruption: false } })
    say(`sandbox ${box.id} admitted after ${Math.round((created - started) / 1000)}s; running ${command.join(' ')}`)
    let shown = 0, record = job
    for (;;) {
      await new Promise((r) => setTimeout(r, 5000))
      const log = await box.read('gate.log').catch(() => '')
      if (log.length > shown) { process.stdout.write(log.slice(shown)); shown = log.length }
      record = await box.process.jobs.get('gate').catch(() => record)
      if (record && SETTLED.has(record.state)) break
    }
    const log = await box.read('gate.log').catch(() => '')
    if (log.length > shown) process.stdout.write(log.slice(shown))
    const code = Number((await box.read('gate.exit').catch(() => '')).trim())
    exit = Number.isInteger(code) && String(code) !== '' ? code : (record.lastExitCode ?? 1)
    // Exit 70 is a bootstrap step (fetch, Node) that failed before the command: not a red gate.
    outcome = exit === 70 ? 'bootstrap_failed' : 'returned'
  } finally {
    await stop()
  }
  const ranS = Math.round((Date.now() - created) / 1000)
  const receipt = { gate_id: gateId, at: new Date().toISOString(), host: 'sandbox', placement: 'sandbox', box: box.id, repo, sha, mode,
    class: gateClass || 'normal', command: command.join(' '), exit, ran_s: ranS, waited_s: Number(process.env.BEELINK_GATE_PLACED_WAIT || 0) + Math.round((created - started) / 1000),
    lane: process.env.BEELINK_GATE_LANE || '', launcher: hostname(), pr_number: process.env.BEELINK_GATE_PR || null, outcome }
  if (process.env.BEELINK_GATE_SANDBOX_RECEIPT) writeFileSync(process.env.BEELINK_GATE_SANDBOX_RECEIPT, `${JSON.stringify(receipt)}\n`)
  say(`receipt: sha=${sha} install=${mode} exit=${exit} duration=${ranS}s placement=sandbox box=${box.id} gate_id=${gateId}`)
  if (outcome === 'bootstrap_failed') tempfail(`bootstrap failed before the command on ${box.id}`)
  process.exit(exit)
}

async function listLive() {
  const key = apiKey()
  if (!key) return
  const { Sandbox } = await sdk()
  const client = new Sandbox({ apiKey: key, baseUrl: process.env.BEELINK_GATE_SANDBOX_URL || 'https://sandbox.tangle.tools' })
  for (const b of await client.list().catch(() => []))
    if (b.name?.startsWith(BOX_PREFIX) && !['deleted', 'stopped', 'failed'].includes(b.status))
      console.log(JSON.stringify({ box: b.id, name: b.name, status: b.status, created: b.createdAt }))
}

const [action, ...rest] = process.argv.slice(2)
if (action === 'run') await run(rest)
else if (action === 'live') await listLive()
else { say('usage: beelink_gate_sandbox.mjs run|live ...'); process.exit(64) }
