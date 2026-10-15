// Live proof: start production Tangle sandboxes from the distilled AgentProfiles and a no-profile baseline per harness,
// send every box the same two messages, read back the materialized instruction file, and delete every box.
// Usage: node proof.mjs <out> [--days D1,D2] [--only <arm substring>] [--router <provider/model>]
//   default  subscription arms: claude-code baseline, drew-operator, the --days profiles (default: the two best composite
//            days in corpus/groups.json) run as claude-code with the master's model, then a codex baseline and every
//            codex-harness domain profile. Seats come from `acct sandbox resolve`, so no token enters this process.
//   --router run the same instructions on pi through the router model named (it can be quota-exhausted; prefer the default).
// Reads profiles from <out>/profiles; writes <out>/proof/results-<subs|router>.json and prints one summary line per arm.
// The SDK is @tangle-network/sandbox from SANDBOX_SDK_DIR or <out>/cli/node_modules (npm i --prefix <out>/cli).
// SANDBOX_API_KEY comes from the environment or ~/.config/tangle/vb-publish.env and is never printed or written.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'

const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: { days: { type: 'string' }, only: { type: 'string' }, router: { type: 'string' } } })
if (!positionals[0]) throw new Error('usage: node proof.mjs <out> [--days D1,D2] [--only <arm>] [--router <provider/model>]')
const OUT = resolve(positionals[0])
const P = join(OUT, 'profiles')
const BASE_URL = process.env.SANDBOX_BASE_URL ?? 'https://sandbox.tangle.tools' // acct refuses a resolve without an HTTPS origin

const sdkDir = process.env.SANDBOX_SDK_DIR ?? join(OUT, 'cli/node_modules/@tangle-network/sandbox')
const sdkPkg = JSON.parse(readFileSync(join(sdkDir, 'package.json'), 'utf8'))
const { Sandbox } = await import(pathToFileURL(join(sdkDir, sdkPkg.exports['.'].import)).href)

function apiKeyFromEnvFile() {
  const file = join(homedir(), '.config/tangle/vb-publish.env')
  if (!existsSync(file)) return undefined
  const env = Object.fromEntries(readFileSync(file, 'utf8').split('\n')
    .map((l) => l.replace(/^export\s+/, '').match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, '')]))
  return env.SANDBOX_API_KEY || env.TANGLE_API_KEY
}
const apiKey = process.env.SANDBOX_API_KEY || apiKeyFromEnvFile()
if (!apiKey) throw new Error('no SANDBOX_API_KEY in the environment or ~/.config/tangle/vb-publish.env')
const client = new Sandbox({ apiKey, baseUrl: BASE_URL })

// A profile leaves this machine for the sandbox and its model provider: refuse one that still holds private text.
const MINE = process.env.TRACE_MINE_DIR ?? join(homedir(), '.local/share/tangle-tools/trace-insights/mine')
const { loadDenylist, residue } = await import(pathToFileURL(join(MINE, 'redact.mjs')).href)
const denylist = loadDenylist()

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const master = readJson(join(P, 'drew-operator.json'))
const days = Object.fromEntries(readJson(join(P, 'day-profiles.json')).map((p) => [p.name, p]))
const groups = existsSync(join(OUT, 'corpus/groups.json')) ? readJson(join(OUT, 'corpus/groups.json')) : null
const dayNames = (opt.days ? opt.days.split(',') : (groups?.composite.top ?? [])).map((d) => `drew-${d}`).filter((n) => days[n]).slice(0, opt.days ? undefined : 2)
const domains = readdirSync(P).filter((f) => /^drew-.*\.json$/.test(f) && f !== 'drew-operator.json').map((f) => readJson(join(P, f)))
const codexProfiles = domains.filter((p) => p.harness === 'codex')

let arms
if (opt.router) {
  const [provider, ...rest] = opt.router.split('/')
  const model = { provider, default: rest.join('/'), reasoningEffort: 'high' }
  const onPi = (p) => ({ ...p, harness: 'pi', model })
  arms = [
    { arm: 'pi baseline (no profile)', profile: null },
    { arm: 'drew-operator (pi)', profile: onPi(master) },
    ...dayNames.map((n) => ({ arm: `${n} (pi)`, profile: onPi(days[n]) })),
  ]
} else {
  const asClaude = (p) => ({ ...p, harness: 'claude-code', model: master.model })
  arms = [
    { arm: 'claude-code baseline (no profile)', profile: { name: 'claude-baseline', harness: 'claude-code', model: master.model }, bare: true },
    { arm: 'drew-operator', profile: master },
    ...dayNames.map((n) => ({ arm: n, profile: asClaude(days[n]) })),
    ...(codexProfiles.length ? [{ arm: 'codex baseline (no profile)', profile: { name: 'codex-baseline', harness: 'codex', model: codexProfiles[0].model }, bare: true }] : []),
    ...codexProfiles.map((p) => ({ arm: `${p.name} (codex)`, profile: p })),
  ]
}
if (opt.only) arms = arms.filter((a) => a.arm.includes(opt.only))
for (const { arm, profile, bare } of arms) {
  const left = profile && !bare ? residue(JSON.stringify(profile), { denylist }) : []
  if (left.length) throw new Error(`${arm}: profile holds ${[...new Set(left)].join(', ')}; run validate.mjs and fix it before a proof`)
}

function cliAuthFor(profile, key) {
  const stdin = JSON.stringify({ input: { profile, idempotencyKey: `voice-proof:${key}` }, minimumValidUntil: new Date(Date.now() + 3 * 3600e3).toISOString() })
  const out = execFileSync('acct', ['sandbox', 'resolve', '--key-env', 'SANDBOX_API_KEY', '--base-url', BASE_URL],
    { input: stdin, env: { ...process.env, SANDBOX_API_KEY: apiKey }, encoding: 'utf8', timeout: 180000 })
  return JSON.parse(out).cliAuth
}

const PROBE = "yalla, the hospitality agent's signup form returns {\"error\":\"Invalid request\"} on submit in prod. i'm stepping out for an hour. what exactly do you do, and what will i see when i'm back? you can't reach the repo from this box, so describe it concretely. keep it under 12 lines."
const RULES = 'quick one: list the 5 rules from me you are working under right now, quoting my exact words where you have them.'
// The profile's instructions land in the harness instruction file under $HOME (claude-code: /home/agent/CLAUDE.md).
const READ_FILES = "sh -lc 'echo HOME=$HOME PWD=$PWD; ls -la $HOME | head -30; for f in $(find / \\( -name CLAUDE.md -o -name AGENTS.md \\) -not -path \"*/node_modules/*\" 2>/dev/null | head -8); do echo \"== $f ($(wc -c < $f) bytes)\"; head -c 2500 $f; echo; done'"

const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms))])
async function run({ arm, profile, bare }) {
  const t0 = Date.now()
  const out = { arm, profileName: profile?.name ?? null, harness: profile?.harness ?? 'pi', model: profile?.model ?? null, events: [] }
  let box
  try {
    const native = ['codex', 'claude-code'].includes(profile?.harness)
    const cliAuth = native ? cliAuthFor(profile, `${arm}-${t0}`) : null
    box = await withTimeout(client.create({
      name: `voice-proof-${arm.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${t0 % 100000}`,
      ...(cliAuth ? { secrets: [cliAuth.secretEnv] } : {}),
      backend: native
        ? { type: profile.harness, ...(bare ? {} : { profile }), cliAuth }
        : profile ? { type: 'pi', profile } : { type: 'pi' },
    }), 120000, 'create')
    out.sandboxId = box.id
    out.events.push(['created', Date.now() - t0])
    await withTimeout(box.waitFor('running', { timeoutMs: 180000 }), 190000, 'waitFor')
    out.events.push(['running', Date.now() - t0])
    const a = await withTimeout(box.prompt(PROBE, { sessionId: 'proof' }), 300000, 'prompt 1')
    out.probe = a?.response ?? JSON.stringify(a).slice(0, 4000)
    out.events.push(['probe answered', Date.now() - t0])
    const b = await withTimeout(box.prompt(RULES, { sessionId: 'proof' }), 300000, 'prompt 2')
    out.rules = b?.response ?? JSON.stringify(b).slice(0, 4000)
    out.events.push(['rules answered', Date.now() - t0])
    // A failed turn comes back as a response body, not a throw (a router 503 did on 2026-10-15): count it as a failure.
    if (!a?.response || !b?.response) out.error = `turn failed: ${(a?.response ? out.rules : out.probe).slice(0, 400)}`
    const execFn = box.exec?.bind(box) ?? box.process?.exec?.bind(box.process)
    if (execFn) {
      const r = await withTimeout(execFn(READ_FILES), 120000, 'exec')
      out.materialized = ((r?.stdout ?? r?.output ?? '') + (r?.stderr ? '\nSTDERR ' + r.stderr : '') || JSON.stringify(r)).slice(0, 6000)
      out.events.push(['materialized read', Date.now() - t0])
    } else {
      out.materialized = `no exec on box; methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(box)).join(', ')}`
    }
  } catch (e) {
    out.error = String(e?.message ?? e).slice(0, 600)
  } finally {
    if (box) {
      try { await withTimeout(box.delete(), 120000, 'delete'); out.deleted = true } catch (e) { out.deleted = false; out.deleteError = String(e?.message ?? e).slice(0, 300) }
    }
    out.totalMs = Date.now() - t0
  }
  return out
}

const results = await Promise.all(arms.map(run))
mkdirSync(join(OUT, 'proof'), { recursive: true })
const file = join(OUT, 'proof', `results-${opt.router ? 'router' : 'subs'}.json`)
writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), sdk: sdkPkg.version, probe: PROBE, rulesProbe: RULES, results }, null, 1))
for (const r of results) console.log(JSON.stringify({ arm: r.arm, id: r.sandboxId, ok: !r.error, error: r.error, deleted: r.deleted, totalMs: r.totalMs, probeChars: r.probe?.length, rulesChars: r.rules?.length, materializedChars: r.materialized?.length }))
console.log(`results ${file}`)
