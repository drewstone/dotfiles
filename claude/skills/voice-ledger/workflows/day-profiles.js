export const meta = {
  name: 'voice-ledger-day-profiles',
  description: 'Label every Drew turn for corrections with the trace-mine prompt and distill one profile per day from his verbatim messages (sonnet, per the agent cap)',
  whenToUse: 'voice-ledger step 6, after adjudicate.mjs. Args: {corpus, batches, days, adjudicationSystem, models}.',
  phases: [
    { title: 'Adjudicate', detail: 'trace-mine correction prompt over every turn without a trace-mine model label, plus a blind calibration set', model: 'sonnet' },
    { title: 'Day profiles', detail: 'one agent per day reads every Drew turn and distills domains, voice, and an AgentProfile', model: 'sonnet' },
  ],
}

// Args (adjudicate.mjs prints all but models):
//   corpus              absolute path of <out>/corpus
//   batches             adjudication batch names in corpus/adjudicate (batch-NNN and calib-000/001)
//   days                days to profile, YYYY-MM-DD, each with corpus/days/<day>.jsonl
//   adjudicationSystem  trace-mine's ADJUDICATION_SYSTEM (its owner is trace-mine's corrections.mjs; never copy it here)
//   models              {"claude-code": {...}, "codex": {...}, "pi": {...}}: the AgentProfile model block per harness
//                       (pi also serves opencode days), current per /model-freshness
const A = args || {}
const missingArgs = ['corpus', 'batches', 'days', 'adjudicationSystem', 'models'].filter((k) => !A[k])
if (missingArgs.length) return { error: `missing args: ${missingArgs.join(', ')}` }
const S = A.corpus
const BATCHES = A.batches
const DAYS = A.days
const ADJ_SYSTEM = A.adjudicationSystem
const model = (h) => JSON.stringify(A.models[h])

const ADJ = {
  type: 'object',
  properties: {
    labels: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          correction: { type: 'boolean' },
          theme: { type: ['string', 'null'], enum: ['communication', 'rigor', 'scope', 'cost', 'autonomy', 'safety', null] },
          quote: { type: ['string', 'null'] },
        },
        required: ['id', 'correction', 'theme', 'quote'],
      },
    },
  },
  required: ['labels'],
}

const adjudication = parallel(BATCHES.map((b) => () =>
  agent(`${ADJ_SYSTEM}\n\nRead every turn in ${S}/adjudicate/${b}.md with the Read tool (use offset/limit to read all of it). Each turn starts with "### Turn t<n>". Return one label per turn, in order, with id "t<n>". quote is the shortest exact phrase from the person's text that shows the correction, or null. Label EVERY turn in the file.`,
    { label: `adj:${b}`, phase: 'Adjudicate', schema: ADJ, model: 'sonnet', effort: 'low' })
    .then((r) => ({ batch: b, labels: r?.labels ?? null }))))

const LIST = { type: 'array', items: { type: 'string' } }
const QT = { type: 'array', items: { type: 'object', properties: { quote: { type: 'string' }, context: { type: 'string' } }, required: ['quote', 'context'] } }
const DAY = {
  type: 'object',
  properties: {
    day: { type: 'string' },
    headline: { type: 'string' },
    domains: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, share: { type: 'number' } }, required: ['name', 'share'] } },
    tasks: { type: 'array', items: { type: 'object', properties: { task: { type: 'string' }, project: { type: 'string' }, status: { type: 'string', enum: ['shipped', 'progressed', 'stalled', 'abandoned', 'unclear'] }, evidence: { type: 'string' } }, required: ['task', 'project', 'status', 'evidence'] } },
    goals: LIST,
    concepts: { type: 'array', items: { type: 'object', properties: { term: { type: 'string' }, weight: { type: 'integer' } }, required: ['term', 'weight'] } },
    signatures: { type: 'array', items: { type: 'object', properties: { pattern: { type: 'string' }, examples: LIST }, required: ['pattern', 'examples'] } },
    rules: LIST,
    corrections: QT,
    praise: QT,
    worked: { type: 'array', items: { type: 'object', properties: { pattern: { type: 'string' }, evidence: { type: 'string' } }, required: ['pattern', 'evidence'] } },
    failed: { type: 'array', items: { type: 'object', properties: { pattern: { type: 'string' }, evidence: { type: 'string' } }, required: ['pattern', 'evidence'] } },
    essence: LIST,
    judged: { type: 'object', properties: { score: { type: 'integer' }, basis: { type: 'string' } }, required: ['score', 'basis'] },
    profile: { type: 'object' },
  },
  required: ['day', 'headline', 'domains', 'tasks', 'goals', 'concepts', 'signatures', 'rules', 'corrections', 'praise', 'worked', 'failed', 'essence', 'judged', 'profile'],
}

const dayPrompt = (d) => `You are distilling ONE working day of Drew — the founder and CTO of Tangle, who directs many AI coding agents (Claude Code, Codex, Pi, OpenCode) across his company's products — from his own messages.

Read ALL of ${S}/days/${d}.jsonl with the Read tool (JSONL, one Drew turn per line; read in chunks with offset/limit until the end). Fields: ts (UTC HH:MM), harness, project (repo or directory), session, who ("drew" = he typed or dictated it; "relay" = he pasted another agent's output, clipped), text (verbatim), agentBefore (start of the agent reply he was answering), next (his NEXT reaction in that session: correction, praise, go, status, other, end).

Produce the day's profile. Rules:
- Every string you put in goals, examples, rules, corrections.quote, praise.quote and essence MUST be copied EXACTLY from a "drew" line's text (a contiguous substring, typos kept). Never paraphrase inside a quote. These are checked mechanically.
- headline: one sentence on what the day was about and how it went.
- domains: the 2-6 domains of work with share of his attention (shares sum to ~1).
- tasks: the concrete tasks he drove, with status judged from the turns (shipped / progressed / stalled / abandoned / unclear) and the evidence.
- concepts: 20-40 weighted terms (1-10) that form the day's concept cloud — product names, technical ideas, values.
- signatures: 4-10 recurring ways he talks that day (e.g. one-word go-aheads, dictated vision monologues, demands for evidence), each with 1-3 verbatim examples.
- rules: standing rules he stated for agents that day (verbatim).
- corrections and praise: verbatim quote + context (what the agent did that triggered it, from agentBefore or the sequence).
- worked / failed: patterns in how he and the agents interacted that led to progress vs friction, with evidence.
- essence: 10-20 verbatim lines that best carry the day's intent and voice — the lines you would keep if you could keep only these.
- judged: your 0-100 judgment of how productive and aligned the day was, with basis. Label it as judgment; base it on corrections, praise, shipped tasks, and his tone.
- profile: an AgentProfile JSON object distilled from this day, so an agent could work the way Drew wanted that day:
  {"name": "drew-${d}", "description": "<one line>", "version": "${d}", "tags": ["day-profile", <domains>],
   "harness": "<the harness he used most that day: claude-code | codex | opencode | pi>",
   "model": <claude-code: ${model('claude-code')}; codex: ${model('codex')}; pi or opencode: ${model('pi')}>,
   "prompt": {"instructions": ["<role in one sentence, in Drew's terms>", "<6-15 operating rules, each built from his own words that day, quoting him where possible>"]},
   "resources": {"failOnError": true},
   "metadata": {"source": {"kind": "day-profile", "date": "${d}", "drewTurns": <count of drew lines>}}}
  Do NOT use prompt.systemPrompt (it replaces the harness's own guidance). Keep instructions under 3,500 characters total.
Return the structured object.`

const dayProfiles = parallel(DAYS.map((d) => () =>
  agent(dayPrompt(d), { label: `day:${d}`, phase: 'Day profiles', schema: DAY, model: 'sonnet' })))

const [adj, days] = await Promise.all([adjudication, dayProfiles])
log(`adjudicated ${adj.filter((a) => a?.labels).length}/${BATCHES.length} batches; profiled ${days.filter(Boolean).length}/${DAYS.length} days`)
return { adjudication: adj, days }
