#!/usr/bin/env node
// Sandbox placement for beelink-gate: when both Beelinks refuse or an auto gate has waited past
// BEELINK_GATE_SANDBOX_AFTER, the same command runs as one Tangle Sandbox managed process job. It prints the gate's
// output, appends a receipt to a Beelink's receipts.jsonl through `beelink-gate --sandbox-receipt` (so `--receipt` and
// gh-drew read it unchanged) and exits with the command's exit code. Exit 75 means no box was bought or none could
// start; the caller keeps waiting for a Beelink.
//
//   beelink_gate_sandbox.mjs run <repo-url> <sha> <mode> <class> [branch] -- <command> [args...]
//   beelink_gate_sandbox.mjs live    (prints live gate boxes, for --queue)
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

const TEMPFAIL = 75
// The SDK version factory's managed jobs run on (factory package.json); bump both together.
const SDK_VERSION = '0.64.40'
const BOX_PREFIX = 'beelink-gate-', gateBox = (name) => /^beelink-gate-[0-9a-f]{12}$/.test(name || '')  // the cap counts gate-id names only
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
export PATH="$HOME/.node/bin:$HOME/.local/bin:\${NIX_BIN_PATH:+$NIX_BIN_PATH:}$PATH" COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1 TURBO_CACHE_DIR="$HOME/.cache/turbo/repo" TMPDIR="$HOME/.tmp"
# The image's C toolchain ahead of nix's, whose cc and ld have no static glibc (sidecar -static: '-lc not found').
# PATH links, not CC: turbo's strict env mode drops CC and COMPILER_PATH (slim-edge/slim-ops after #723).
mkdir -p "$HOME/.local/bin" "$HOME/.tmp"; for t in cc gcc g++ c++ ld as ar; do [ ! -x "/usr/bin/$t" ] || ln -sf "/usr/bin/$t" "$HOME/.local/bin/$t"; done
# The box's cgroup allows 512 pids and threads count: turbo's 10 parallel builds, each Node plus rolldown's rayon
# pool, hit EAGAIN ('global thread pool has not been initialized', slim-edge 09:14Z). Callers can still override.
export TURBO_CONCURRENCY="\${TURBO_CONCURRENCY:-4}" RAYON_NUM_THREADS="\${RAYON_NUM_THREADS:-2}"
export GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=credential.https://github.com.helper GIT_CONFIG_VALUE_0= \\
  GIT_CONFIG_KEY_1=credential.https://github.com.helper GIT_CONFIG_VALUE_1='!gh auth git-credential'
# Every git in the box authenticates, whatever environment a command gives it: a partial clone fetches blobs
# lazily, and a nested git without the env helper failed 'could not read Username' (platform mapped planner, 08:45Z).
gh_bin=$(command -v gh) && git config --global credential.https://github.com.helper "!$gh_bin auth git-credential"
# Scratch on the 40 GB workspace, not the 4 GiB /tmp tmpfs (G7/G8 stage 16 GiB); the egress CA in npm and git config,
# which turbo's strict env cannot strip (G4: pnpm dlx 'self-signed certificate in certificate chain', 10-26).
[ -z "\${SSL_CERT_FILE:-}" ] || { echo "cafile=$SSL_CERT_FILE" >> "$HOME/.npmrc"; git config --global http.sslCAInfo "$SSL_CERT_FILE"; }
git config --global user.name ${quote(gitIdentity('user.name') || 'beelink-gate')}; git config --global user.email ${quote(gitIdentity('user.email') || 'beelink-gate@users.noreply.github.com')}
# A box restored from a warm snapshot already holds the repo's objects, Node, pnpm store and turbo cache.
step fetch; if [ -d repo/.git ]; then cd repo && git remote set-url origin ${quote(repoUrl)}; else rm -rf repo && git init -q repo && cd repo && git remote add origin ${quote(repoUrl)}; fi || exit 70
# A commit origin does not have is this gate's input, not the box: exit 71 never turns sandbox placement off.
git fetch -q --filter=blob:none origin ${sha} || { echo "beelink-gate-sandbox: ${sha} is not on origin; push it first" >&2; exit 71; }
for b in main develop ${branch ? quote(branch) : ''}; do git fetch -q --filter=blob:none origin "+refs/heads/$b:refs/remotes/origin/$b" 2>/dev/null; done
${branch ? `git checkout -qf -B ${quote(branch)} ${sha} && git branch -q --set-upstream-to=origin/${quote(branch)}` : `git checkout -qf --detach ${sha}`} || exit 70
git clean -ffdxq -e .turbo
# The repo's .nvmrc Node, else 24, the Beelinks' nvm default: the image's Node 22.16 crashed corepack's pnpm 12.15
# (MODULE_NOT_FOUND) on a repo without .nvmrc (10-26 07:38Z).
step node
v=24; [ ! -f .nvmrc ] || v=$(tr -d 'v \\n' < .nvmrc); have=$(node -v 2>/dev/null | tr -d v)
  case "$have" in "$v"|"$v".*) ;; *)
    f=$(curl -fsSL "https://nodejs.org/dist/latest-v\${v%%.*}.x/" | grep -o "node-v$v[0-9.]*-linux-x64.tar.xz" | head -1)
    [ -n "$f" ] || f=$(curl -fsSL "https://nodejs.org/dist/latest-v\${v%%.*}.x/" | grep -o 'node-v[0-9.]*-linux-x64.tar.xz' | head -1)
    rm -rf "$HOME/.node" && mkdir -p "$HOME/.node" && curl -fsSL "https://nodejs.org/dist/latest-v\${v%%.*}.x/$f" | tar -xJ -C "$HOME/.node" --strip-components=1 || exit 70 ;;
  esac
corepack enable --install-directory "$HOME/.local/bin" 2>/dev/null
# Python the way the Beelinks have it: .python-version, else 3.12. The image's python3 is 3.11, and tangle-tools'
# f-strings need 3.12 (disco-evolve-run, 08:55Z). Only repos with Python files pay for it.
if [ -n "$(git ls-files '*.py' | head -1)" ]; then  # not grep -q: under pipefail its early exit SIGPIPEs git, and this never ran
  pv=3.12; [ ! -f .python-version ] || pv=$(head -1 .python-version | tr -d ' \\n' | cut -d. -f1,2)
  case "$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null)" in "$pv") ;; *)
    step python
    url=$(gh api repos/astral-sh/python-build-standalone/releases/latest --jq '.assets[].browser_download_url' | grep -E "/cpython-$pv\\.[0-9]+\\+[0-9]+-x86_64-unknown-linux-gnu-install_only\\.tar\\.gz$" | head -1)
    [ -n "$url" ] && rm -rf "$HOME/.python" && mkdir -p "$HOME/.python" && curl -fsSL "$url" | tar -xz -C "$HOME/.python" --strip-components=1 || exit 70
    for b in python3 python "python$pv" pip3 pip; do [ -e "$HOME/.python/bin/$b" ] && ln -sf "$HOME/.python/bin/$b" "$HOME/.local/bin/$b"; done
    python3 --version >&2 ;;
  esac; export UV_PYTHON="$pv" UV_PYTHON_PREFERENCE=only-managed  # uv ignores nix's python3 ('system interpreter required') and took /usr/bin/python3.11
fi
# Login shells (bash -lc in gate commands) reset PATH to the image's /usr/bin, whose git 2.39 lacks
# check-attr --source (factory census, 10-26 08:2xZ). Beelink login shells keep the gate's tools; so does the box.
printf '%s\n' "export PATH=\"$HOME/.node/bin:$HOME/.local/bin:\${NIX_BIN_PATH:+$NIX_BIN_PATH:}\$PATH\"" '[ -f ~/.bashrc ] && . ~/.bashrc' > "$HOME/.bash_profile"
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
${/^[1-9][0-9]*$/.test(process.env.BEELINK_GATE_PR || '') ? `rc=$?; m="$HOME/.tmp/merge"; [ "$rc" != 0 ] || [ ! -f pnpm-lock.yaml ] || { step merge-lockfile  # as check_merge_lockfile
  git fetch -q origin "+refs/pull/${process.env.BEELINK_GATE_PR}/merge:refs/beelink-gate/merge" && [ "$(git rev-parse refs/beelink-gate/merge^2)" = "$(git rev-parse HEAD)" ] && rm -rf "$m" && mkdir -p "$m" && git archive refs/beelink-gate/merge | tar -x -C "$m" || exit 75
  (cd "$m" && pnpm install --frozen-lockfile --lockfile-only --ignore-scripts) || rc=65; rm -rf "$m"; }; exit "$rc"` : ''}
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
  if (existsSync(capacityOff) && Date.now() - statSync(capacityOff).mtimeMs < CAPACITY_BACKOFF_MS) tempfail(`platform refused a create (${readFileSync(capacityOff, 'utf8').trim().slice(0, 400)}); no create for 5 minutes`)
  // Warm source boxes hold snapshots, not gates, so they do not count toward the cap.
  const live = (await client.list().catch((error) => tempfail(`cannot list gate boxes, so the ${MAX_LIVE}-box cap is unchecked: ${String(error.message).slice(0, 160)}`))).filter((b) => gateBox(b.name) && !['deleted', 'stopped', 'failed'].includes(b.status))
  if (live.length >= MAX_LIVE) tempfail(`cap reached: ${live.length} of ${MAX_LIVE} gate boxes live`)
  const id = randomBytes(16).toString('hex')
  const gateId = `sandbox-${id}`
  const repo = repoUrl.replace(/^(?:git@([^:]+):|ssh:\/\/git@([^/]+)\/|https?:\/\/([^/]+)\/)(.+?)(?:\.git)?\/?$/, (_, a, b, c, r) => `${a || b || c}/${r}`)
  // A repo whose bootstrap failed in a box (no access, no Node) buys no box for an hour, across --retry and lanes.
  // Keyed by repo and commit, for 15 minutes: enough to stop --retry buying a box per attempt for a commit
  // that cannot bootstrap, without one bad commit closing the sandbox to every gate of the repo (10-26 08:14Z).
  const offMarker = path.join(cacheDir(), `sandbox-off-${repo.replace(/[^A-Za-z0-9._-]/g, '_')}-${sha.slice(0, 12)}`)
  if (existsSync(offMarker) && Date.now() - statSync(offMarker).mtimeMs < 900_000) tempfail(`off for ${repo} ${sha.slice(0, 12)} after a bootstrap failure: ${readFileSync(offMarker, 'utf8').trim()}`)
  const started = Date.now()
  const RESOURCES = resources(gateClass)
  say(`gate_id=${gateId}; placing on a Tangle sandbox (${RESOURCES.cpuCores} CPU, ${RESOURCES.memoryMB} MB)`)
  // Handlers come before create, so a stop during create still deletes the box once its id is known.
  const warm = await warmStart(client, repo)
  if (warm) say(`starting from warm snapshot ${warm.fromSnapshot.slice(0, 12)} of ${warm.fromSandboxId}`)
  const logPath = path.join(process.env.XDG_STATE_HOME || path.join(homedir(), '.local/state'), 'beelink-gate', 'sandbox-logs', `${gateId}.log`)
  const lastStage = () => { try { return (readFileSync(logPath, 'utf8').match(/beelink-gate-sandbox: (\S+)[^\n]*\n(?![\s\S]*beelink-gate-sandbox: )/) || [])[1] || 'none' } catch { return 'none' } }
  let box, stopping = false
  // Delete through the platform's retire path every box carrying this gate's name: a warm create that timed out
  // on the client can still be provisioning beside the cold fallback (slim-ops a264, 09:20Z). Cancel, then delete: a stop
  // backed up each ~10 GB box only to discard it (eu1 10-27); stop only on a 503 'sessions not sealed' (10-26 10:45Z).
  const boxName = `${BOX_PREFIX}${id.slice(0, 12)}`
  const named = async () => (await client.list().catch(() => [])).filter((b) => b.name === boxName && b.status !== 'deleted')
  const retire = async (target) => {
    await target.process.jobs.cancel('gate').catch(() => undefined)
    for (const attempt of [1, 2, 3, 4]) {
      try { await target.delete(); return } catch (error) { if (error.status === 404 || await client.get(target.id).then((b) => !b || b.status === 'deleted', () => false)) return; say(`box ${target.id} delete attempt ${attempt} failed: ${error.status || ''} ${String(error.message).slice(0, 160)}`); if (error.status === 503) await target.stop().catch(() => undefined); await new Promise((r) => setTimeout(r, 15_000)) }
    }
    say(`box ${target.id} NOT deleted; it stops at its ${HOLD_S + 600}s lifetime and is reclaimed ${300}s after`)
  }
  const stop = async () => {
    if (box) await retire(box)
    for (const other of (await named()).filter((b) => b.id !== box?.id)) {
      const found = await client.get(other.id).catch(() => null)
      if (found) { say(`retiring stray box ${other.id} of this gate`); await retire(found) }
    }
  }
  for (const [signal, code] of [['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]])
    process.on(signal, () => { stopping = true; stop().finally(() => process.exit(code)) })
  try {
    const spec = { name: boxName, resources: RESOURCES, secrets: ['GH_TOKEN'], egressPolicy: { mode: 'open' },
      maxLifetimeSeconds: HOLD_S + 600, idleTimeoutSeconds: HOLD_S, deleteAfterStoppedSeconds: 300, retry: { capacity: false } }
    // A refused warm restore falls back to one cold create; a capacity refusal does not.
    const create = (opts) => client.create(opts).catch(async (error) => {
      // A transient 503 that names a short retry ("Plan lookup unavailable; retry shortly", 5 s at 09:20Z) is
      // retried once after that delay; only capacity refusals and a second failure stand the launcher down.
      if (error.status !== 503 || error.code === 'CAPACITY_EXHAUSTED' || !(error.retryAfterMs > 0 && error.retryAfterMs <= 30_000)) throw error
      say(`create got 503 '${String(error.message).slice(0, 80)}'; retrying once in ${error.retryAfterMs} ms`)
      await new Promise((r) => setTimeout(r, error.retryAfterMs))
      return client.create(opts)
    })
    box = await create({ ...spec, ...warm }).catch(async (error) => {
      if (!warm || error.code === 'CAPACITY_EXHAUSTED' || error.status === 503) throw error
      say(`warm restore refused (${error.code || error.status}); creating cold`)
      for (const partial of await named()) await client.get(partial.id).then((b) => b && retire(b)).catch(() => undefined)
      return create(spec)
    })
  } catch (error) {
    // Every field the SDK error carries (request id, origin, endpoint, cell metadata) is evidence the capacity
    // owner asks for; on 10-26 only 'SERVER_ERROR' was kept for two 503s.
    const evidence = JSON.stringify({ at: new Date().toISOString(), message: String(error.message).slice(0, 400),
      // Scalars only, and nothing credential-shaped: SDK objects can carry the API key (memory sdk-objects-embed-api-keys).
      ...Object.fromEntries(Object.entries(error).filter(([k, v]) => ['string', 'number', 'boolean'].includes(typeof v)
        && !/key|token|secret|auth|header|cookie|password/i.test(k))) })
    if (error.code === 'CAPACITY_EXHAUSTED' || error.status === 503) {
      mkdirSync(cacheDir(), { recursive: true })
      writeFileSync(capacityOff, `${evidence}\n`)
    }
    tempfail(`create refused: ${evidence.slice(0, 600)}`)
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
    // The box and its files go with it; the gate's log is kept here as it streams, so a launcher or box killed
    // mid-run still leaves its last stage (slim-ops a264 ended 137 during install with nothing retained).
    mkdirSync(path.dirname(logPath), { recursive: true })
    let shown = 0
    const keep = (text) => { process.stdout.write(text); try { appendFileSync(logPath, text) } catch {} }
    const pollUntil = Date.now() + (HOLD_S + 120) * 1000
    while (!SETTLED.has(record?.state) && Date.now() < pollUntil) {
      await new Promise((r) => setTimeout(r, 5000))
      const log = await box.read('gate.log').catch(() => '')
      if (log.length > shown) { keep(log.slice(shown)); shown = log.length }
      record = await box.process.jobs.get('gate').catch(() => record)
    }
    const log = await box.read('gate.log').catch(() => '')
    if (log.length > shown) keep(log.slice(shown))
    // Only a recorded exit counts: a killed, expired or unreadable job has none, and must not read as 0.
    const written = (await box.read('gate.exit').catch(() => '')).trim()
    if (/^\d+$/.test(written)) exit = Number(written)
    else if (['succeeded', 'failed'].includes(record?.state) && Number.isInteger(record.lastExitCode)) exit = record.lastExitCode
  } catch (error) {
    say(`sandbox ${box.id} job failed before a result: ${String(error.message).slice(0, 200)}`)
  } finally {
    await stop()
  }
  if (exit === null) tempfail(`gate on ${box.id} ended ${record?.state ?? 'unsubmitted'} without an exit code at stage ${lastStage()}; log ${logPath}`)
  if (exit === 71) tempfail(`${sha} is not on origin ${repoUrl}; push it, then gate again`)
  // Exit 70 is a bootstrap step (fetch, Node) that failed before the command: not a red gate.
  if (exit === 70) {
    mkdirSync(path.dirname(offMarker), { recursive: true })
    writeFileSync(offMarker, `${box.id} bootstrap exit 70 at ${new Date().toISOString()}\n`)
    tempfail(`bootstrap failed before the command on ${box.id}`)
  }
  const ranS = Math.round((Date.now() - created) / 1000)
  const receipt = { gate_id: gateId, at: new Date().toISOString(), host: 'sandbox', placement: 'sandbox', box: box.id, repo, sha, mode,
    class: gateClass || 'normal', command: command.join(' '), exit, ran_s: ranS, waited_s: Number(process.env.BEELINK_GATE_PLACED_WAIT || 0) + Math.round((created - started) / 1000),
    lane: process.env.BEELINK_GATE_LANE || '', launcher: hostname(), pr_number: process.env.BEELINK_GATE_PR || null,
    log: logPath, last_stage: lastStage() }
  if (process.env.BEELINK_GATE_SANDBOX_RECEIPT) writeFileSync(process.env.BEELINK_GATE_SANDBOX_RECEIPT, `${JSON.stringify(receipt)}\n`)
  say(`receipt: sha=${sha} install=${mode} exit=${exit} duration=${ranS}s placement=sandbox box=${box.id} gate_id=${gateId}`)
  process.exit(exit)
}

const warmName = (repo) => `${BOX_PREFIX}warm-${repo.split('/').slice(-2).join('-').replace(/[^A-Za-z0-9-]/g, '-')}`.slice(0, 63)

// The newest synced snapshot of the repo's warm source box: Node, pnpm store, git objects and turbo cache.
async function warmStart(client, repo) {
  if (process.env.BEELINK_GATE_SANDBOX_WARM === '0') return null
  const source = (await client.list().catch(() => [])).find((b) => b.name === warmName(repo) && b.status !== 'deleted')
  if (!source) return null
  const box = await client.get(source.id).catch(() => null)
  const snaps = (await box?.listSnapshots().catch(() => []) ?? []).filter((s) => s.remoteSync === 'synced' && s.tags?.includes('beelink-gate-warm'))
  snaps.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  return snaps[0] ? { fromSnapshot: snaps[0].snapshotId, fromSandboxId: source.id } : null
}

// `warm <repo-url> [ref]`: build the repo's warm source box at its default branch with a frozen install (no typecheck:
// a fresh agent-container checkout's turbo check-types hung 43 min without its workspace builds), drop node_modules (a store-only snapshot restored in 41 s against 83 s with them, and the
// install took 26 s either way), snapshot it and stop it. The previous source box is deleted once the new one is synced.
async function warmBuild([repoUrl, ref = '']) {
  const key = apiKey()
  if (!key) tempfail('warm has no key')
  const { Sandbox } = await sdk()
  const client = new Sandbox({ apiKey: key, baseUrl: process.env.BEELINK_GATE_SANDBOX_URL || 'https://sandbox.tangle.tools' })
  const repo = repoUrl.replace(/^(?:git@([^:]+):|ssh:\/\/git@([^/]+)\/|https?:\/\/([^/]+)\/)(.+?)(?:\.git)?\/?$/, (_, a, b, c, r) => `${a || b || c}/${r}`)
  const head = ref || spawnSync('git', ['ls-remote', repoUrl, 'HEAD'], { encoding: 'utf8' }).stdout.split(/\s/)[0]
  if (!/^[0-9a-f]{40}$/.test(head)) tempfail(`warm cannot read ${repoUrl} HEAD`)
  const old = (await client.list().catch(() => [])).filter((b) => b.name === warmName(repo) && b.status !== 'deleted')
  const box = await client.create({ name: warmName(repo), resources: resources('normal'), secrets: ['GH_TOKEN'], egressPolicy: { mode: 'open' },
    maxLifetimeSeconds: 7200, idleTimeoutSeconds: 3600, retry: { capacity: false } })
  say(`warm ${repo} at ${head} on ${box.id}`)
  try {
    const script = gateScript({ repoUrl, sha: head, mode: 'install', branch: '', command: ['bash', '-c',
      'find . -name node_modules -type d -prune -exec rm -rf {} +'] })
    await box.write('gate.sh', script)
    let record = await box.process.jobs.submit({ id: 'warm', executable: 'bash', args: ['-c', 'bash gate.sh > gate.log 2>&1; echo $? > gate.exit'], cwd: '.',
      envKeys: ['PATH', 'NIX_BIN_PATH', 'GH_TOKEN'], deadlineAt: Date.now() + 3600_000,
      restart: { maxAttempts: 1, initialBackoffMs: 1000, maxBackoffMs: 1000, exitCodes: [], afterInterruption: false } })
    while (!SETTLED.has(record?.state)) { await new Promise((r) => setTimeout(r, 10000)); record = await box.process.jobs.get('warm').catch(() => record) }
    const exit = (await box.read('gate.exit').catch(() => '')).trim()
    if (exit !== '0') { process.stdout.write((await box.read('gate.log').catch(() => '')).slice(-4000)); throw new Error(`warm bootstrap exit ${exit || 'unknown'}`) }
    // The snapshot call can time out at the edge (524) after the platform accepted it; the listing is the truth.
    await box.snapshot({ tags: ['beelink-gate-warm'], wait: false }).catch((e) => say(`snapshot call: ${e.status || e.message}`))
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 15000))
      const synced = (await box.listSnapshots().catch(() => [])).find((s) => s.remoteSync === 'synced')
      if (synced) {
        say(`warm ${repo}: snapshot ${synced.snapshotId} ${synced.sizeBytes} bytes synced`)
        await box.stop().catch((e) => say(`stop: ${e.message}`))
        for (const prior of old) await (await client.get(prior.id))?.delete().catch(() => undefined)
        return
      }
    }
    throw new Error('snapshot never synced')
  } catch (error) {
    await box.delete().catch(() => undefined)
    say(`warm ${repo} failed: ${error.message}`)
    process.exit(1)
  }
}

async function listLive() {
  const key = apiKey()
  if (!key) return
  const { Sandbox } = await sdk()
  const client = new Sandbox({ apiKey: key, baseUrl: process.env.BEELINK_GATE_SANDBOX_URL || 'https://sandbox.tangle.tools' })
  for (const b of await client.list())  // a failed listing is an error, never 'no boxes' (slim-ops 34f, 14:5xZ)
    if (gateBox(b.name) && !['deleted', 'stopped', 'failed'].includes(b.status))
      console.log(JSON.stringify({ box: b.id, name: b.name, status: b.status, created: b.createdAt }))
}

const [action, ...rest] = process.argv.slice(2)
if (action === 'run') await run(rest)
else if (action === 'live') await listLive()
else if (action === 'warm') await warmBuild(rest)
else { say('usage: beelink_gate_sandbox.mjs run|live|warm ...'); process.exit(64) }
