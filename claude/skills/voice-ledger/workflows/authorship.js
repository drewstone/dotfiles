export const meta = {
  name: 'voice-ledger-authorship',
  description: 'Classify who wrote each long user turn (Drew, a relay he pasted, or another agent), audit a sample blind, and optionally map the AgentProfile system',
  whenToUse: 'voice-ledger step 4, after stage.py authorship. Args: {dir, batches, adcRoot?}.',
  phases: [
    { title: 'Authorship', detail: 'Haiku labels each long turn: drew, relay, agent, unsure', model: 'haiku' },
    { title: 'Audit', detail: 'independent re-label of a stratified sample to measure agreement' },
    { title: 'Profile map', detail: 'Haiku readers over schema, materialization, catalog', model: 'haiku' },
    { title: 'Profile synth', detail: 'merge and verify the map against code' },
  ],
}

// Args:
//   dir      absolute path of corpus/authorship (stage.py authorship prints it)
//   batches  number of batch-NNN.jsonl files in dir (stage.py authorship prints it)
//   adcRoot  optional: an agent-dev-container checkout at origin/develop; when given, three readers map the AgentProfile
//            interface, materialization and catalog into profileBrief, which the contrast workflow reads
const A = args || {}
if (!A.dir || !A.batches) return { error: 'args need dir and batches from `stage.py authorship <out>`' }
const DIR = A.dir
const NBATCH = A.batches
const pad = (n) => String(n).padStart(3, '0')

const LABELS = {
  type: 'object',
  properties: {
    labels: {
      type: 'array',
      items: {
        type: 'object',
        properties: { n: { type: 'integer' }, a: { type: 'string', enum: ['drew', 'relay', 'agent', 'unsure'] } },
        required: ['n', 'a'],
      },
    },
  },
  required: ['labels'],
}

const GUIDE = `Each line is one message that arrived in a coding-agent session (Claude Code, Codex, OpenCode, Pi) as a "user" turn.
Decide WHO WROTE the message text. The human is Drew, a founder/CTO directing many coding agents.

drew  = Drew typed or dictated it himself. Signs: first person, informal, lowercase starts, typos ("contineu", "exeuction"),
        run-on dictated speech ("I want you to ... so we can ... right?"), short commands ("status?", "yalla", "do it", "merge it"),
        questions, frustration, praise, vision talk, pasted URLs with his own sentence. Dictated speech can be long and well punctuated; still drew.
relay = Drew sent it, but most of the text is pasted from another agent's output or a document (a report, a handoff, a table),
        possibly with a short line of his own before or after.
agent = Another AI agent, operator session, fleet tool or script wrote it: speaks about Drew in the third person,
        status relays with exact UTC timestamps / SHAs / PR numbers / "lane" / "owner" jargon written as a report to a peer,
        templated briefs ("You are ...", "Read BRIEF.md"), test probes, review requests between agents, goal-loop continuations.
unsure = cannot tell.

"agentBefore" is the start of the agent reply the message answered; use it only as context.
Return one label per line: n is the 1-based line number in the file, a is the label. Label EVERY line.`

phase('Authorship')
const authorship = parallel(Array.from({ length: NBATCH }, (_, i) => () =>
  agent(`Read the file ${DIR}/batch-${pad(i)}.jsonl with the Read tool (it is JSONL; read all of it, use offset/limit if needed).\n\n${GUIDE}`,
    { label: `author:${pad(i)}`, phase: 'Authorship', schema: LABELS, model: 'haiku', effort: 'low' })
    .then((r) => ({ batch: i, labels: r?.labels ?? null }))))

const MAP = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    facts: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, file: { type: 'string' }, line: { type: 'integer' } }, required: ['claim', 'file'] } },
  },
  required: ['summary', 'facts'],
}
const ROOT = A.adcRoot
const READERS = ROOT ? [
  { key: 'interface', prompt: `In ${ROOT}, map the AgentProfile INTERFACE: every field of the AgentProfile type/schema (name, prompt/systemPrompt, model, skills, tools, mcp, permissions, subagents, hooks, files, etc.), what each means, and which are required. The schema is exported by @tangle-network/agent-interface (look under ${ROOT}/apps/sidecar/node_modules/@tangle-network/agent-interface/dist for .d.ts) and re-exported by packages/cli-agent-registry; also read packages/agent-backend-types/src/profile-types.ts and the user docs products/sandbox/web/src/docs/content/cloud-agents-profiles.md. Cite file and line for every fact.` },
  { key: 'materialize', prompt: `In ${ROOT}, explain how an AgentProfile is MATERIALIZED inside a sandbox for each harness (claude-code, codex, opencode, pi, others): which files are written where (instruction files like CLAUDE.md/AGENTS.md, skills directories, MCP config, settings, subagent definitions, hooks), how the system prompt is composed, how skills are mounted (not inlined), and what happens on resume/snapshot. Read packages/agent-profile-materialize/src (profile-materializer.ts, harness.ts, profile-prompt.ts, mcp.ts, subagents.ts, hooks.ts, workspace-files.ts, workspace-apply.ts, profile-plan.ts) and apps/sidecar/src/interactive/profile-workspace.ts and apps/sidecar/src/storage/profile-store.ts. Cite file and line for every fact.` },
  { key: 'catalog', prompt: `In ${ROOT}, explain how AgentProfiles are PUBLISHED, NAMED and RESOLVED: the platform agent-profile catalog (products/platform/api/src/lib/workflow-agent-profiles.ts, products/platform/api/profiles/gtm.json, products/platform/api/src/lib/profiles/gtm.ts), resolution in apps/orchestrator/src/lib/profile-resolution.ts, the CLI flag --profile in products/sandbox/cli/src/commands/sandbox.ts, the SDK example products/sandbox/sdk/examples/profile-catalog.ts, the sidecar route apps/sidecar/src/routes/agents-profile-bundle.ts, and the authoring conventions in ~/.claude/skills/profile-authoring/SKILL.md. Give the exact commands/API calls to publish a new profile and create a sandbox from it by name. Cite file and line for every fact.` },
] : []
if (ROOT) phase('Profile map')
else log('no adcRoot: skipping the AgentProfile map; the contrast workflow reads the previous run\'s profile-brief.md')
const maps = parallel(READERS.map((r) => () =>
  agent(r.prompt, { label: `map:${r.key}`, phase: 'Profile map', schema: MAP, model: 'haiku' }).then((m) => ({ key: r.key, ...(m ?? {}) }))))

const [labelled, mapped] = await Promise.all([authorship, maps])

const synth = ROOT ? (phase('Profile synth'), agent(`Three readers mapped the AgentProfile system in ${ROOT}. Their notes (JSON):\n${JSON.stringify(mapped.filter(Boolean))}\n\nVerify the load-bearing claims by reading the cited files (spot-check at least 8 claims; drop or fix any that are wrong). Then write a compact markdown brief with these sections:\n1. Concept: what an AgentProfile is, in 3 sentences.\n2. Interface: a table of fields (name, type, required, meaning).\n3. Materialization: a table per harness of what lands where in the sandbox.\n4. Publish and run: exact commands/API calls to register a profile in the catalog and start a sandbox from it by name.\n5. Template: a minimal valid AgentProfile JSON we can emit for a "day profile" distilled from a person's own messages (systemPrompt in their words, skills, model), with the fields that must be present to validate.\n6. Corrections: claims from the readers you found wrong.\nCite file:line throughout.`,
  { label: 'profile-synth', phase: 'Profile synth' })) : Promise.resolve(null)

phase('Audit')
// Stratified audit: 6 lines from each batch at fixed offsets, re-labelled blind by a stronger model.
const picks = []
for (const b of labelled) {
  if (!b?.labels) continue
  for (const n of [3, 41, 79, 117, 155, 193]) {
    const l = b.labels.find((x) => x.n === n)
    if (l) picks.push({ batch: b.batch, n, first: l.a })
  }
}
const AUDIT = {
  type: 'object',
  properties: { labels: { type: 'array', items: { type: 'object', properties: { batch: { type: 'integer' }, n: { type: 'integer' }, a: { type: 'string', enum: ['drew', 'relay', 'agent', 'unsure'] } }, required: ['batch', 'n', 'a'] } } },
  required: ['labels'],
}
const chunks = [picks.slice(0, Math.ceil(picks.length / 2)), picks.slice(Math.ceil(picks.length / 2))]
const audits = await parallel(chunks.map((c, k) => () =>
  agent(`Re-label these lines blind. For each (batch, n) read line n (1-based) of ${DIR}/batch-<batch as 3 digits>.jsonl.\nLines: ${JSON.stringify(c.map(({ batch, n }) => ({ batch, n })))}\n\n${GUIDE}\nReturn {batch, n, a} for every listed line.`,
    { label: `audit:${k}`, phase: 'Audit', schema: AUDIT })))
const second = new Map(audits.filter(Boolean).flatMap((a) => a.labels).map((l) => [`${l.batch}:${l.n}`, l.a]))
let agree = 0, compared = 0
const confusion = {}
for (const p of picks) {
  const s = second.get(`${p.batch}:${p.n}`)
  if (!s) continue
  compared += 1
  if (s === p.first) agree += 1
  const k = `${p.first}->${s}`
  confusion[k] = (confusion[k] ?? 0) + 1
}
log(`audit agreement ${agree}/${compared}`)
const brief = await synth
return { labelled, audit: { agree, compared, confusion }, profileBrief: brief, profileNotes: mapped }
