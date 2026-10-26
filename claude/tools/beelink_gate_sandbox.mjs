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
import { existsSync, readFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

const TEMPFAIL = 75
// The SDK version factory's managed jobs run on (factory package.json); bump both together.
const SDK_VERSION = '0.64.40'
const BOX_PREFIX = 'beelink-gate-'
// Production hosts refused 16 GB with CAPACITY_EXHAUSTED on 2026-10-26 and admitted 8 GB in 2.5 s.
// A light gate (no install, at most 120 core-seconds) gets a small box; every other class gets 8 CPU / 8 GB.
const resources = (gateClass) => gateClass === 'light'
  ? { cpuCores: 2, memoryMB: 4096, diskGB: 20 }
  : { cpuCores: Number(process.env.BEELINK_GATE_SANDBOX_CPUS || 8), memoryMB: Number(process.env.BEELINK_GATE_SANDBOX_MEMORY_MB || 8192), diskGB: 40 }
// Each refused create counts toward the cell's create-failure streak; after one, no launcher here creates for 5 minutes.
const CAPACITY_BACKOFF_MS = 300_000
const cacheDir = () => path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), '.cache'), 'beelink-gate')
const MAX_LIVE = Number(process.env.BEELINK_GATE_SANDBOX_MAX || 4)
// The same hold budget as a Beelink gate (BEELINK_GATE_MAX_HOLD, e.g. 90m), default 45 minutes.
const holdSeconds = (v) => { const m = /^(\d+)([smh]?)$/.exec(v || ''); return m ? Number(m[1]) * ({ s: 1, m: 60, h: 3600 }[m[2]] || 1) : 45 * 60 }
const HOLD_S = holdSeconds(process.env.BEELINK_GATE_MAX_HOLD)
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

// Beelink gates commit in fixtures and merges under the host user's git identity; the box uses the launcher's.
const gitIdentity = (key) => spawnSync('git', ['config', '--get', key], { encoding: 'utf8' }).stdout?.trim() || ''
const quote = (s) => `'${String(s).replace(/'/g, `'"'"'`)}'`

// The in-box gate: the repo's .nvmrc Node, its packageManager through corepack, the gated commit with
// the default branch's origin ref (turbo --filter=...[origin/develop] needs it), the frozen install the
// Beelink gate runs, then the command. Each step prints a marker; the last one names a failed step.
function gateScript({ repoUrl, sha, mode, branch, command }) {
  // A box has no SSH key: lanes' git@github.com URLs failed every fetch (exit 70 on four repos, 07:07-07:27Z).
  // GitHub repos are fetched over https through gh's credential helper.
  repoUrl = repoUrl.replace(/^(?:git@github\.com:|ssh:\/\/git@github\.com\/)/, 'https://github.com/')
  const install = mode === 'install' || mode === 'ship'
  return `set -o pipefail
step() { echo "beelink-gate-sandbox: $1 $(date -u +%H:%M:%SZ)" >&2; }
export HOME=$(getent passwd "$(id -u)" | cut -d: -f6); cd "$HOME"
export PATH="$HOME/.node/bin:$HOME/.local/bin:\${NIX_BIN_PATH:+$NIX_BIN_PATH:}$PATH" COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1
export GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=credential.https://github.com.helper GIT_CONFIG_VALUE_0= \\
  GIT_CONFIG_KEY_1=credential.https://github.com.helper GIT_CONFIG_VALUE_1='!gh auth git-credential'
git config --global user.name ${quote(gitIdentity('user.name') || 'beelink-gate')}; git config --global user.email ${quote(gitIdentity('user.email') || 'beelink-gate@users.noreply.github.com')}
step fetch
rm -rf repo && git init -q repo && cd repo && git remote add origin ${quote(repoUrl)} || exit 70
git fetch -q --filter=blob:none origin ${sha} || exit 70
for b in main develop ${branch ? quote(branch) : ''}; do git fetch -q --filter=blob:none origin "+refs/heads/$b:refs/remotes/origin/$b" 2>/dev/null; done
${branch ? `git checkout -q -B ${quote(branch)} ${sha} && git branch -q --set-upstream-to=origin/${quote(branch)}` : `git checkout -q --detach ${sha}`} || exit 70
# The repo's .nvmrc Node, else 24, the Beelinks' nvm default: the image's Node 22.16 crashed corepack's pnpm 12.15
# (MODULE_NOT_FOUND) on a repo without .nvmrc (10-26 07:38Z).
step node
v=24; [ ! -f .nvmrc ] || v=$(tr -d 'v \\n' < .nvmrc); have=$(node -v 2>/dev/null | tr -d v)
{
  case "$have" in "$v"|"$v".*) ;; *)
    f=$(curl -fsSL "https://nodejs.org/dist/latest-v\${v%%.*}.x/" | grep -o "node-v$v[0-9.]*-linux-x64.tar.xz" | head -1)
    [ -n "$f" ] || f=$(curl -fsSL "https://nodejs.org/dist/latest-v\${v%%.*}.x/" | grep -o 'node-v[0-9.]*-linux-x64.tar.xz' | head -1)
    rm -rf "$HOME/.node" && mkdir -p "$HOME/.node" && curl -fsSL "https://nodejs.org/dist/latest-v\${v%%.*}.x/$f" | tar -xJ -C "$HOME/.node" --strip-components=1 || exit 70 ;;
  esac
}
mkdir -p "$HOME/.local/bin" && corepack enable --install-directory "$HOME/.local/bin" 2>/dev/null
# A package manager that cannot start is the box's toolchain, not the gated code: bootstrap, never a red gate.
if [ -f pnpm-lock.yaml ]; then pnpm --version >/dev/null || exit 70; elif [ -f yarn.lock ]; then yarn --version >/dev/null || exit 70; fi
${install ? `step install
if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile --config.ignore-scripts=false
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
  const capacityOff = path.join(cacheDir(), 'sandbox-capacity-refused')
  if (existsSync(capacityOff) && Date.now() - statSync(capacityOff).mtimeMs < CAPACITY_BACKOFF_MS) tempfail(`platform refused capacity at ${readFileSync(capacityOff, 'utf8').trim()}; no create for 5 minutes`)
  // Warm source boxes hold snapshots, not gates, so they do not count toward the cap.
  const live = (await client.list().catch(() => [])).filter((b) => b.name?.startsWith(BOX_PREFIX) && !b.name.startsWith(`${BOX_PREFIX}warm-`) && !['deleted', 'stopped', 'failed'].includes(b.status))
  if (live.length >= MAX_LIVE) tempfail(`cap reached: ${live.length} of ${MAX_LIVE} gate boxes live`)
  const id = randomBytes(16).toString('hex')
  const gateId = `sandbox-${id}`
  const repo = repoUrl.replace(/^(?:git@([^:]+):|ssh:\/\/git@([^/]+)\/|https?:\/\/([^/]+)\/)(.+?)(?:\.git)?\/?$/, (_, a, b, c, r) => `${a || b || c}/${r}`)
  // A repo whose bootstrap failed in a box (no access, no Node) buys no box for an hour, across --retry and lanes.
  const offMarker = path.join(cacheDir(), `sandbox-off-${repo.replace(/[^A-Za-z0-9._-]/g, '_')}`)
  if (existsSync(offMarker) && Date.now() - statSync(offMarker).mtimeMs < 3600_000) tempfail(`off for ${repo} after a bootstrap failure: ${readFileSync(offMarker, 'utf8').trim()}`)
  const started = Date.now()
  const RESOURCES = resources(gateClass)
  say(`gate_id=${gateId}; placing on a Tangle sandbox (${RESOURCES.cpuCores} CPU, ${RESOURCES.memoryMB} MB)`)
  // Handlers come before create, so a stop during create still deletes the box once its id is known.
  let box, stopping = false
  // Delete through the platform's retire path; a failure is retried once and reported, never swallowed.
  const stop = async () => {
    if (!box) return
    for (const attempt of [1, 2]) {
      try { await box.delete(); return } catch (error) { say(`box ${box.id} delete attempt ${attempt} failed: ${error.status || ''} ${String(error.message).slice(0, 160)}`) }
    }
    say(`box ${box.id} NOT deleted; it stops at its ${HOLD_S + 600}s lifetime and is reclaimed ${300}s after`)
  }
  for (const [signal, code] of [['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]])
    process.on(signal, () => { stopping = true; stop().finally(() => process.exit(code)) })
  try {
    box = await client.create({ name: `${BOX_PREFIX}${id.slice(0, 12)}`, resources: RESOURCES, secrets: ['GH_TOKEN'], egressPolicy: { mode: 'open' },
      maxLifetimeSeconds: HOLD_S + 600, idleTimeoutSeconds: HOLD_S, deleteAfterStoppedSeconds: 300, retry: { capacity: false } })
  } catch (error) {
    if (error.code === 'CAPACITY_EXHAUSTED' || error.status === 503) {
      mkdirSync(cacheDir(), { recursive: true })
      writeFileSync(capacityOff, `${new Date().toISOString()} ${error.code || error.status}\n`)
    }
    tempfail(`create refused: ${error.code || error.status || ''} ${String(error.message).slice(0, 200)}`)
  }
  if (stopping) { await stop(); process.exit(143) }
  const created = Date.now()
  let exit = null, record
  try {
    await box.write('gate.sh', gateScript({ repoUrl, sha, mode, branch, command }))
    record = await box.process.jobs.submit({ id: 'gate', executable: 'bash', args: ['-c', 'bash gate.sh > gate.log 2>&1; echo $? > gate.exit'], cwd: '.',
      envKeys: ['PATH', 'NIX_BIN_PATH', 'GH_TOKEN'], deadlineAt: Date.now() + HOLD_S * 1000,
      restart: { maxAttempts: 1, initialBackoffMs: 1000, maxBackoffMs: 1000, exitCodes: [], afterInterruption: false } })
    say(`sandbox ${box.id} admitted after ${Math.round((created - started) / 1000)}s; running ${command.join(' ')}`)
    let shown = 0
    const pollUntil = Date.now() + (HOLD_S + 120) * 1000
    while (!SETTLED.has(record?.state) && Date.now() < pollUntil) {
      await new Promise((r) => setTimeout(r, 5000))
      const log = await box.read('gate.log').catch(() => '')
      if (log.length > shown) { process.stdout.write(log.slice(shown)); shown = log.length }
      record = await box.process.jobs.get('gate').catch(() => record)
    }
    const log = await box.read('gate.log').catch(() => '')
    if (log.length > shown) process.stdout.write(log.slice(shown))
    // Only a recorded exit counts: a killed, expired or unreadable job has none, and must not read as 0.
    const written = (await box.read('gate.exit').catch(() => '')).trim()
    if (/^\d+$/.test(written)) exit = Number(written)
    else if (['succeeded', 'failed'].includes(record?.state) && Number.isInteger(record.lastExitCode)) exit = record.lastExitCode
  } catch (error) {
    say(`sandbox ${box.id} job failed before a result: ${String(error.message).slice(0, 200)}`)
  } finally {
    await stop()
  }
  if (exit === null) tempfail(`gate on ${box.id} ended ${record?.state ?? 'unsubmitted'} without an exit code`)
  // Exit 70 is a bootstrap step (fetch, Node) that failed before the command: not a red gate.
  if (exit === 70) {
    mkdirSync(path.dirname(offMarker), { recursive: true })
    writeFileSync(offMarker, `${box.id} bootstrap exit 70 at ${new Date().toISOString()}\n`)
    tempfail(`bootstrap failed before the command on ${box.id}`)
  }
  const ranS = Math.round((Date.now() - created) / 1000)
  const receipt = { gate_id: gateId, at: new Date().toISOString(), host: 'sandbox', placement: 'sandbox', box: box.id, repo, sha, mode,
    class: gateClass || 'normal', command: command.join(' '), exit, ran_s: ranS, waited_s: Number(process.env.BEELINK_GATE_PLACED_WAIT || 0) + Math.round((created - started) / 1000),
    lane: process.env.BEELINK_GATE_LANE || '', launcher: hostname(), pr_number: process.env.BEELINK_GATE_PR || null }
  if (process.env.BEELINK_GATE_SANDBOX_RECEIPT) writeFileSync(process.env.BEELINK_GATE_SANDBOX_RECEIPT, `${JSON.stringify(receipt)}\n`)
  say(`receipt: sha=${sha} install=${mode} exit=${exit} duration=${ranS}s placement=sandbox box=${box.id} gate_id=${gateId}`)
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
