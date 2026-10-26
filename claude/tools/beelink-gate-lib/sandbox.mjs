// beelink-gate's third placement: the same gate in a one-shot Tangle sandbox. It follows factory's
// src/sandbox.ts (owner key, GH_TOKEN answered by `gh auth git-credential`, output redaction) and streams
// each step's output live through spawnExact. Run by run_sandbox_gate (placement.sh):
//   node sandbox.mjs <repo-url> <sha> <install-mode> <class> <waited-s> <state-dir> <command> [args...]
// Exits with the command's status after the standard receipt line (host=sandbox); 75 with a TEMPFAIL line when
// no box could be created, the commit could not be fetched in it, or the box was lost. It writes the box id to
// BEELINK_GATE_SANDBOX_STARTED once the box holds the commit and appends a JSON row to
// <state-dir>/sandbox-receipts.jsonl, a local log only: `--receipt` reads beelink rows alone, because this launcher
// can write that file. A sandbox has no turbo cache, sparse checkout, mise Node or warm pnpm store; the receipt says
// cache=none node=image so a red result here is not mistaken for a beelink's.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { constants, homedir, hostname } from 'node:os'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SDK_VERSION = '0.64.40' // factory's pin; the only place the gate names it
const [repoUrl, sha, mode, gateClass, waitedArg, stateDir, ...command] = process.argv.slice(2)
const gateId = `sandbox-${randomBytes(16).toString('hex')}`
const say = (line) => process.stderr.write(`beelink-gate: ${line}\n`)
const utc = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z')
const tempfail = (why) => { say(`TEMPFAIL next_allowed=${utc(Date.now() + 5 * 60_000)} sandbox: ${why}`); process.exit(75) }
const seconds = (v) => { const m = /^(\d+)([smh]?)$/.exec(v); return m ? Number(m[1]) * ({ '': 1, s: 1, m: 60, h: 3600 })[m[2]] : NaN }
const bounded = (promise, ms) => Promise.race([promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms).unref())])

const repo = /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(repoUrl ?? '')?.[1]
if (!repo || !/^[0-9a-f]{40}$/i.test(sha ?? '') || !command.length) { say(`sandbox: invalid request for ${repoUrl}`); process.exit(2) }
// The same hold budget as a beelink gate (BEELINK_GATE_MAX_HOLD, 10 minutes for --light).
let holdS = seconds(process.env.BEELINK_GATE_MAX_HOLD || '45m')
if (!(holdS > 0)) { say(`invalid BEELINK_GATE_MAX_HOLD: ${process.env.BEELINK_GATE_MAX_HOLD}`); process.exit(2) }
if (mode === 'light') holdS = Math.min(holdS, 600)
// A --light command keeps the beelink's core-second budget (BEELINK_GATE_LIGHT_CPU, 1-120).
const lightCpu = Number(process.env.BEELINK_GATE_LIGHT_CPU || 120)
if (mode === 'light' && !(Number.isInteger(lightCpu) && lightCpu >= 1 && lightCpu <= 120)) {
  say(`BEELINK_GATE_LIGHT_CPU must be 1-120 core-seconds, not ${process.env.BEELINK_GATE_LIGHT_CPU}; a larger check is a normal gate`); process.exit(2)
}

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

// A repo anyone can fetch gets no token at all. The probe ignores this launcher's credential helpers, askpass and
// URL rewrites, so it answers only for an anonymous client.
function publicRepo() {
  try {
    execFileSync('git', ['ls-remote', `https://github.com/${repo}.git`, 'HEAD'], { stdio: 'ignore', timeout: 30_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } })
    return true
  } catch { return false }
}

const quote = (s) => `'${s.replace(/'/g, `'"'"'`)}'`
// Factory's TOOL_PATH and GIT_AUTH: `gh` is on NIX_BIN_PATH. A private repo's GH_TOKEN is bound to github.com, so the
// box holds only a placeholder that the egress proxy swaps inside the Basic-auth header `gh auth git-credential` makes;
// install and command steps unset it either way.
const TOOL_PATH = 'PATH="${NIX_BIN_PATH:+$NIX_BIN_PATH:}$PATH"'
const GIT_AUTH = ['GIT_TERMINAL_PROMPT=0', 'GIT_CONFIG_COUNT=2', 'GIT_CONFIG_KEY_0=credential.https://github.com.helper', "GIT_CONFIG_VALUE_0=''",
  'GIT_CONFIG_KEY_1=credential.https://github.com.helper', `GIT_CONFIG_VALUE_1=${quote('!gh auth git-credential')}`].join(' ')
const redact = (s) => s.replace(/(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, '$1[redacted]')
  .replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-[redacted]').replace(/:\/\/[^/@\s]+@/g, '://[redacted]@')
// Install and run with the repo's pnpm, as a beelink does (install.sh repo_pnpm_version, passed in by placement.sh):
// pnpm 11 enforces minimumReleaseAge and pnpm 10 ignores it.
const PNPM_SHIM = `${process.env.BEELINK_GATE_SANDBOX_PNPM_FN || ''}
if [ -f pnpm-lock.yaml ] && want=$(repo_pnpm_version 2>/dev/null) && [ "$want" != "$(pnpm --version 2>/dev/null)" ]; then
  mkdir -p .git/beelink-gate-bin && printf '#!/bin/sh\\nexec npx --yes "pnpm@%s" "$@"\\n' "$want" > .git/beelink-gate-bin/pnpm \\
    && chmod +x .git/beelink-gate-bin/pnpm && echo "beelink-gate: using the repo's pnpm $want" >&2
fi
exit 0`
const INSTALL = 'if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile;'
  + ' elif [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then npm ci;'
  + ' elif [ -f yarn.lock ]; then corepack yarn install --immutable;'
  + ' elif [ -f bun.lock ] || [ -f bun.lockb ]; then bun install --frozen-lockfile; fi'
// A shell -c command runs under pipefail, as on a beelink: `sh -c 'node --test ... | tail -12'` exited 0 on a failing
// test and --merge merged discovery-lab #2097 red. The receipt still names the command as requested.
const runCommand = /^(sh|dash|bash)$/.test(basename(command[0])) && /^-[A-Za-z]*c[A-Za-z]*$/.test(command[1] ?? '')
  ? ['bash', '-o', 'pipefail', ...command.slice(1)] : command
// --light: no browser, and a command past its core-second budget fails (RLIMIT_CPU ends it with SIGXCPU).
const LIGHT = `mkdir -p .git/beelink-gate-no-browsers && export PLAYWRIGHT_BROWSERS_PATH="$PWD/.git/beelink-gate-no-browsers" && ulimit -t ${lightCpu} || exit 2; `
const XCPU = 128 + constants.signals.SIGXCPU

const { Sandbox } = await loadSdk().catch((error) => tempfail(`cannot load the Sandbox SDK: ${error.message}`))
const sandbox = new Sandbox({ apiKey, baseUrl: process.env.SANDBOX_BASE_URL?.trim() || 'https://sandbox.tangle.tools' })
let box, removing, stopping = 0
// Every exit deletes the box once; a delete that fails or hangs is reported, and never keeps the launcher waiting.
const remove = () => {
  if (!box) return Promise.resolve()
  removing ??= bounded(box.delete(), 30_000).catch((error) => say(`sandbox: could not delete box ${box.id}: ${error.message}`))
  return removing
}
for (const [signal, code] of [['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]]) {
  process.on(signal, () => { if (stopping) return; stopping = code; if (box) remove().finally(() => process.exit(code)) })
}

const createdAt = Date.now()
let token = false
try {
  token = !publicRepo() && (await sandbox.secrets.list()).some((secret) => secret.name === 'GH_TOKEN')
  box = await sandbox.create({
    name: gateId, agent: false, ephemeral: true, retry: { capacity: false }, maxLifetimeSeconds: holdS + 900,
    // No implicit owner secrets, startup scripts or Hub credential; a private repo keeps the default owner context
    // until isolated is confirmed to carry a host-bound secret.
    ...(token ? { secrets: [{ name: 'GH_TOKEN', host: 'github.com' }] } : { secrets: [], ownerContext: 'isolated' }),
    ...(process.env.BEELINK_GATE_SANDBOX_RESOURCES && { resources: JSON.parse(process.env.BEELINK_GATE_SANDBOX_RESOURCES) }),
  })
} catch (error) {
  if (error?.allocationId) {
    await bounded(sandbox.get(error.allocationId).then((orphan) => orphan?.delete()), 30_000)
      .catch((cause) => say(`sandbox: could not delete box ${error.allocationId}: ${cause.message}`))
  }
  tempfail(`no box: ${error.message}`)
}

const createS = Math.round((Date.now() - createdAt) / 1000)
const started = Date.now(), deadline = started + holdS * 1000
const timing = { create_s: createS }
let timedOut = 0
const signalNumber = (signal) => (/^\d+$/.test(String(signal)) ? Number(signal) : constants.signals[signal] ?? constants.signals[`SIG${signal}`]) || 1
async function step(name, script, { withToken = false } = {}) {
  const begin = Date.now()
  if (begin >= deadline) { timedOut = 1; say(`hold limit of ${holdS}s reached; stopped ${name}`); return 124 }
  const proc = await box.process.spawnExact('bash', ['-c', `export ${TOOL_PATH} CI=1 ${GIT_AUTH}; mkdir -p gate && cd gate || exit 2;`
    + ` export PATH="$PWD/.git/beelink-gate-bin:$PATH"; ${withToken ? '' : 'unset GH_TOKEN GITHUB_TOKEN; '}${script}`], { timeoutMs: deadline - begin })
  // Redact whole lines: a token split across two log chunks matches in neither.
  const pending = { stdout: '', stderr: '' }
  try {
    for await (const entry of proc.logs()) {
      const stream = entry.type === 'stderr' ? 'stderr' : 'stdout'
      const text = pending[stream] + entry.data
      const cut = Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r')) + 1
      pending[stream] = text.slice(cut)
      if (cut) process[stream].write(redact(text.slice(0, cut)))
    }
  } finally {
    for (const stream of ['stdout', 'stderr']) if (pending[stream]) process[stream].write(redact(pending[stream]))
  }
  const reported = await proc.wait()
  const status = await proc.status().catch(() => ({ exitCode: reported }))
  timing[`${name}_s`] = Math.round((Date.now() - begin) / 1000)
  const atDeadline = Date.now() >= deadline - 1000
  // A signal kill (OOM, or the runtime's timeoutMs at the hold deadline) can report a null exit code; never read it as 0.
  let code = Number.isInteger(status.exitCode) && status.exitCode >= 0 && !status.exitSignal ? status.exitCode
    : atDeadline ? 124 : 128 + signalNumber(status.exitSignal)
  if (code !== 0 && atDeadline) { timedOut = 1; code = 124; say(`hold limit of ${holdS}s reached; stopped ${name}`) }
  return code
}

let code
try {
  if (stopping) { await remove(); process.exit(stopping) }
  say(`gate_id=${gateId} runs in sandbox box ${box.id} (created in ${createS}s); it ends with this launcher`)
  say(`sandbox: fetching ${repo} ${sha}`)
  const fetch = `git init -q . && git fetch -q --depth 1 https://github.com/${repo}.git ${sha} && git checkout -q FETCH_HEAD || exit 1\n${PNPM_SHIM}`
  // A box that cannot fetch is environmental (no access, no git, network): give the gate back like a beelink would.
  if (await step('fetch', fetch, { withToken: true }) !== 0) { await remove(); tempfail(`cannot fetch ${sha} from github.com/${repo} in box ${box.id}`) }
  if (process.env.BEELINK_GATE_SANDBOX_STARTED) writeFileSync(process.env.BEELINK_GATE_SANDBOX_STARTED, `${box.id}\n`)
  code = mode === 'no-install' || mode === 'light' ? 0 : await step('install', INSTALL)
  if (code === 0) code = await step('command', `${mode === 'light' ? LIGHT : ''}umask 022; exec ${runCommand.map(quote).join(' ')}`)
  if (mode === 'light' && code === XCPU) {
    say(`LIGHT GATE OVER BUDGET: the command used more than the ${lightCpu} core-seconds it declared; run it as a normal gate`)
    code = 1
  }
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
