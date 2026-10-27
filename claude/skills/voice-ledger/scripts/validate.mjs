// Validate AgentProfile JSON (one object or an array) the way the sandbox will take it: agent-interface's schema at the
// version the sidecar pins (the sidecar materializes profiles in a box), the catalog security policy, harness/model
// support, and privacy: no denylist entry, phone or card number, or credential may survive in a profile (trace-mine's
// redact.mjs residue check), because a profile is sent to sandboxes, other models and the catalog.
// Usage: node validate.mjs <profiles.json>...     prints one line per profile; exits 1 when any is rejected
//        node validate.mjs --scan <file>...       privacy residue check only, for any file (the page, a brief)
//        node validate.mjs --sandbox <file>...    schema and sandbox-create policy, which runs hooks, with no residue
//                                                 check: install.sh's profile holds only public dotfiles text
// ADC_ROOT (default ~/webb/agent-dev-container) is the checkout whose apps/sidecar resolves agent-interface;
// AGENT_INTERFACE_DIR overrides the package directory; TRACE_MINE_DENYLIST overrides the denylist path.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
if (args.length === 0) throw new Error('usage: node validate.mjs <profiles.json>... | --scan <file>... | --sandbox <file>...')
const sandbox = args[0] === '--sandbox'
if (sandbox) args.shift()
const MINE = process.env.TRACE_MINE_DIR ?? join(homedir(), '.local/share/tangle-tools/trace-insights/mine')
const { loadDenylist, residue } = sandbox ? { residue: () => [] } : await import(pathToFileURL(join(MINE, 'redact.mjs')).href)
const denylist = sandbox ? [] : loadDenylist() // throws when the denylist is unreadable or empty: no check means no pass
if (args[0] === '--scan') {
  let dirty = 0
  for (const file of args.slice(1)) {
    const found = residue(readFileSync(file, 'utf8'), { denylist })
    if (found.length) dirty += 1
    console.log(file, found.length ? `PRIVATE ${JSON.stringify([...new Set(found)])}` : 'CLEAN')
  }
  process.exit(dirty ? 1 : 0)
}

const ADC = process.env.ADC_ROOT ?? join(homedir(), 'webb/agent-dev-container')
const pkgDir = process.env.AGENT_INTERFACE_DIR ?? join(ADC, 'apps/sidecar/node_modules/@tangle-network/agent-interface')
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
const m = await import(pathToFileURL(join(pkgDir, pkg.exports['.'].import)).href)
console.log(`agent-interface ${pkg.version} from ${pkgDir}`)
const policy = { allowLocalMcp: false, allowHooks: sandbox, allowConnections: false, allowedMcpHosts: [] }

let bad = 0
for (const file of args) {
  const input = JSON.parse(readFileSync(file, 'utf8'))
  for (const p of Array.isArray(input) ? input : [input]) {
    const r = m.agentProfileSchema.safeParse(p)
    const sec = r.success && m.validateAgentProfileSecurity ? m.validateAgentProfileSecurity(p, policy).issues.filter((i) => i.level === 'error').map((i) => i.message) : []
    const privateHits = [...new Set(residue(JSON.stringify(p), { denylist }))]
    let support = ''
    if (m.harnessModelSupport && p.harness && p.model?.default) {
      try { support = JSON.stringify(m.harnessModelSupport(p.harness, p.model.default, p.model.provider)).slice(0, 120) } catch (e) { support = 'harnessModelSupport threw: ' + e.message.slice(0, 80) }
    }
    const ok = r.success && sec.length === 0 && privateHits.length === 0
    if (!ok) bad++
    console.log((p.name ?? '?').padEnd(28), ok ? 'OK' : 'REJECT',
      r.success ? '' : JSON.stringify(r.error.issues.map((i) => [i.path.join('.'), i.message.slice(0, 80)])),
      sec.length ? 'SECURITY ' + JSON.stringify(sec) : '', privateHits.length ? 'PRIVATE ' + JSON.stringify(privateHits) : '',
      support, 'bytes=' + new TextEncoder().encode(JSON.stringify(p)).length)
  }
}
process.exit(bad ? 1 : 0)
