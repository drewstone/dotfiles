// beelink-gate's third placement: the same gate in a one-shot Tangle sandbox. It follows factory's
// src/sandbox.ts (owner key, GH_TOKEN answered by `gh auth git-credential`, output redaction) and streams
// each step's output live through spawnExact. Run by run_sandbox_gate (placement.sh):
//   node sandbox.mjs <repo-url> <sha> <install-mode> <class> <waited-s> <state-dir> <command> [args...]
// Exits with the command's status after the standard receipt line (host=sandbox); 2 when the commit cannot be
// fetched; 75 with a TEMPFAIL line when no box could be created or the box was lost. It writes the box id to
// BEELINK_GATE_SANDBOX_STARTED once a box exists and appends a JSON row to <state-dir>/sandbox-receipts.jsonl,
// which `beelink-gate --receipt` reads. A sandbox has no turbo cache, sparse checkout, mise Node or warm pnpm
// store; the receipt says cache=none node=image so a red result here is not mistaken for a beelink's.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SDK_VERSION = '0.64.40' // factory's pin; the only place the gate names it
const [repoUrl, sha, mode, gateClass, waitedArg, stateDir, ...command] = process.argv.slice(2)
const gateId = `sandbox-${randomBytes(16).toString('hex')}`
const say = (line) => process.stderr.write(`beelink-gate: ${line}\n`)
const utc = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z')
const tempfail = (why) => { say(`TEMPFAIL next_allowed=${utc(Date.now() + 5 * 60_000)} sandbox: ${why}`); process.exit(75) }
const seconds = (v) => { const m = /^(\d+)([smh]?)$/.exec(v); return m ? Number(m[1]) * ({ '': 1, s: 1, m: 60, h: 3600 })[m[2]] : NaN }

const repo = /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(repoUrl ?? '')?.[1]
if (!repo || !/^[0-9a-f]{40}$/i.test(sha ?? '') || !command.length) { say(`sandbox: invalid request for ${repoUrl}`); process.exit(2) }
// The same hold budget as a beelink gate (BEELINK_GATE_MAX_HOLD, 10 minutes for --light).
let holdS = seconds(process.env.BEELINK_GATE_MAX_HOLD || '45m')
if (!(holdS > 0)) { say(`invalid BEELINK_GATE_MAX_HOLD: ${process.env.BEELINK_GATE_MAX_HOLD}`); process.exit(2) }
if (mode === 'light') holdS = Math.min(holdS, 600)

const keyFile = join(homedir(), '.config', 'tangle', 'factory.key')
const apiKey = process.env.FACTORY_SANDBOX_KEY?.trim() || (existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : '')
if (!apiKey) tempfail(`no owner key: FACTORY_SANDBOX_KEY, or ${keyFile}`)

// The SDK lives outside this repo at one exact version, installed on first use (a lost race keeps the winner's copy).
async function loadSdk() {
  const dir = process.env.BEELINK_GATE_SANDBOX_SDK_DIR
    || join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'beelink-gate', `sandbox-sdk-${SDK_VERSION}`)
  const pkgDir = join(dir, 'node_modules', '@tangle-network', 'sandbox')
  if (!existsSync(join(pkgDir, 'package.json'))) {
    const tmp = `${dir}.${process.pid}`
    say(`sandbox: installing @tangle-network/sandbox@${SDK_VERSION} into ${dir}`)
    execFileSync('npm', ['install', '--prefix', tmp, '--no-audit', '--no-fund', `@tangle-network/sandbox@${SDK_VERSION}`], { stdio: ['ignore', 2, 2] })
    try { renameSync(tmp, dir) } catch { rmSync(tmp, { recursive: true, force: true }) }
  }
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
  return import(pathToFileURL(join(pkgDir, pkg.exports['.'].import)).href)
}

const quote = (s) => `'${s.replace(/'/g, `'"'"'`)}'`
// Factory's TOOL_PATH and GIT_AUTH: `gh` is on NIX_BIN_PATH, and the token stays in the environment, never in a URL,
// an argv or a config file. Public repos never ask for a credential.
const TOOL_PATH = 'PATH="${NIX_BIN_PATH:+$NIX_BIN_PATH:}$PATH"'
const GIT_AUTH = ['GIT_TERMINAL_PROMPT=0', 'GIT_CONFIG_COUNT=2', 'GIT_CONFIG_KEY_0=credential.https://github.com.helper', "GIT_CONFIG_VALUE_0=''",
  'GIT_CONFIG_KEY_1=credential.https://github.com.helper', `GIT_CONFIG_VALUE_1=${quote('!gh auth git-credential')}`].join(' ')
const redact = (s) => s.replace(/(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, '$1[redacted]')
  .replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-[redacted]').replace(/:\/\/[^/@\s]+@/g, '://[redacted]@')
const INSTALL = 'if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile;'
  + ' elif [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then npm ci;'
  + ' elif [ -f yarn.lock ]; then corepack yarn install --immutable;'
  + ' elif [ -f bun.lock ] || [ -f bun.lockb ]; then bun install --frozen-lockfile; fi'

const { Sandbox } = await loadSdk().catch((error) => tempfail(`cannot load the Sandbox SDK: ${error.message}`))
const sandbox = new Sandbox({ apiKey, baseUrl: process.env.SANDBOX_BASE_URL?.trim() || 'https://sandbox.tangle.tools' })
let box, stopping = 0
const remove = () => (box ? box.delete().catch(() => undefined) : Promise.resolve())
for (const [signal, code] of [['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]]) {
  process.on(signal, () => { if (stopping) return; stopping = code; if (box) remove().finally(() => process.exit(code)) })
}

const createdAt = Date.now()
try {
  const stored = new Set((await sandbox.secrets.list()).map((secret) => secret.name))
  box = await sandbox.create({
    name: gateId, agent: false, ephemeral: true, retry: { capacity: false }, maxLifetimeSeconds: holdS + 900,
    secrets: stored.has('GH_TOKEN') ? ['GH_TOKEN'] : [],
    ...(process.env.BEELINK_GATE_SANDBOX_RESOURCES && { resources: JSON.parse(process.env.BEELINK_GATE_SANDBOX_RESOURCES) }),
  })
} catch (error) { tempfail(`no box: ${error.message}`) }
if (stopping) { await remove(); process.exit(stopping) }
if (process.env.BEELINK_GATE_SANDBOX_STARTED) writeFileSync(process.env.BEELINK_GATE_SANDBOX_STARTED, `${box.id}\n`)
const createS = Math.round((Date.now() - createdAt) / 1000)
say(`gate_id=${gateId} runs in sandbox box ${box.id} (created in ${createS}s); it ends with this launcher`)

const started = Date.now(), deadline = started + holdS * 1000
const timing = { create_s: createS }
let timedOut = 0
async function step(name, script) {
  const begin = Date.now()
  if (begin >= deadline) { timedOut = 1; say(`hold limit of ${holdS}s reached; stopped ${name}`); return 124 }
  const proc = await box.process.spawnExact('sh', ['-c', `export ${TOOL_PATH} CI=1 ${GIT_AUTH}; mkdir -p gate && cd gate || exit 2; ${script}`],
    { timeoutMs: deadline - begin })
  for await (const entry of proc.logs()) (entry.type === 'stderr' ? process.stderr : process.stdout).write(redact(entry.data))
  let code = Number(await proc.wait())
  if (!Number.isInteger(code) || code < 0) code = 1
  timing[`${name}_s`] = Math.round((Date.now() - begin) / 1000)
  if (code !== 0 && Date.now() >= deadline - 1000) { timedOut = 1; code = 124; say(`hold limit of ${holdS}s reached; stopped ${name}`) }
  return code
}

let code
try {
  say(`sandbox: fetching ${repo} ${sha}`)
  if (await step('fetch', `git init -q . && git fetch -q --depth 1 https://github.com/${repo}.git ${sha} && git checkout -q FETCH_HEAD`) !== 0) {
    await remove(); say(`sandbox: cannot fetch ${sha} from github.com/${repo}`); process.exit(2)
  }
  code = mode === 'no-install' || mode === 'light' ? 0 : await step('install', INSTALL)
  if (code === 0) code = await step('command', `exec ${command.map(quote).join(' ')}`)
} catch (error) {
  await remove()
  if (stopping) process.exit(stopping)
  tempfail(`box ${box.id} lost: ${error.message}`)
} finally {
  await remove()
}

const ran = Math.round((Date.now() - started) / 1000), waited = Number(waitedArg || 0) + createS
const display = process.env.BEELINK_GATE_SANDBOX_DISPLAY || command.join(' ')
process.stderr.write(`beelink-gate receipt: sha=${sha} install=${mode} command=${display} exit=${code} duration=${ran}s waited=${waited}s host=sandbox`
  + ` timed_out=${timedOut} watchdog=0 load=? preview=none class=${gateClass} cpu_s=? node=image rebuild=none cpu_pressure=? starved=0`
  + ` cgroup=none cache=none sparse=none checkout=cold workers=? reaped=0 bundle=none host_cpu=? gate_id=${gateId}\n`)
const row = { at: utc(Date.now()), host: 'sandbox', box: box.id, repo: `github.com/${repo}`, sha, mode, command: display, exit: code,
  waited_s: waited, ran_s: ran, timed_out: timedOut === 1, watchdog: false, launcher: hostname(), class: gateClass, gate_id: gateId,
  lane: process.env.BEELINK_GATE_LANE || null, pr_number: Number(process.env.BEELINK_GATE_PR) || null, timing }
try { mkdirSync(stateDir, { recursive: true }); appendFileSync(join(stateDir, 'sandbox-receipts.jsonl'), `${JSON.stringify(row)}\n`) } catch {}
process.exit(code)
