export const meta = {
  name: 'voice-ledger-contrast',
  description: 'Contrast best vs worst days, distill Drew\'s operator profile from his own words, and red-team every finding with the data',
  whenToUse: 'voice-ledger step 8, after stage.py contrast and validate.mjs on the day profiles. Args: {out, scripts, node, window, nDays, nTurns, nProfiles, calibration, models}.',
  phases: [
    { title: 'Contrast', detail: 'what separates top and bottom days, each claim tested in Python' },
    { title: 'Profile', detail: 'master + domain AgentProfiles from verbatim rules, validated' },
    { title: 'Red team', detail: 'three lenses try to refute each finding', model: 'sonnet' },
  ],
}

// Args:
//   out          absolute run directory (corpus/, profiles/ and analysis/ live under it)
//   scripts      absolute path of this skill's scripts/ (for validate.mjs)
//   node         absolute node binary (the zsh node shim prints an error and exits 0)
//   window       "YYYY-MM-DD..YYYY-MM-DD", groups.json's window; nDays: lines in corpus/days-condensed.jsonl
//   nTurns       lines in corpus/turns-final.jsonl; nProfiles: day profiles in profiles/day-profiles.json
//   calibration  post.py's calibration in words, e.g. "sonnet agreed 90.7% / kappa 0.79 and over-calls ~18%"
//   models       {"claude-code": {...}, "codex": {...}, "pi": {...}}: the AgentProfile model block per harness
//   profileBrief optional path of the AgentProfile brief (default <out>/corpus/profile-brief.md)
const A = args || {}
const missingArgs = ['out', 'scripts', 'node', 'window', 'nDays', 'nTurns', 'nProfiles', 'calibration', 'models'].filter((k) => !A[k])
if (missingArgs.length) return { error: `missing args: ${missingArgs.join(', ')}` }
const S = A.out
const NODE = A.node
const BRIEF = A.profileBrief || `${S}/corpus/profile-brief.md`
const model = (h) => JSON.stringify(A.models[h])
const DATA = `Data (all local, read-only; write only under ${S}/analysis/ and ${S}/profiles/):
- ${S}/corpus/days-condensed.jsonl — ${A.nDays} days (${A.window}), one JSON per line: outcomes (drewTurns, correctionRate, themes, praise, mergedPRs, prBaseline = trailing 14-day median, prRatio, zShip, zAlign, score2 = zShip + zAlign + 0.5*zPraise, harness mix, projects, judged = a model's 0-100 judgment, NOT a measurement), headline, domains, tasks, signatures, rules, corrections, praise, worked, failed, essence (verbatim Drew lines), concepts.
- ${S}/corpus/groups.json — top/bottom quartile day lists by composite (score2), alignment (correction rate) and shipping (zShip).
- ${S}/corpus/turns-final.jsonl — ${A.nTurns} turns Drew sent (who: "drew" typed/dictated, "relay" pasted agent output). Fields: id, host, harness, session, project, ts (UTC), day (America/Los_Angeles, 04:00 cutoff), text (verbatim), words, corr (correction label: trace-mine Opus labels or sonnet labels with the same prompt; ${A.calibration}), theme, praise, f (lexical features: short_cmd, go, status, question, long_form, number_target, why, criteria, ownership, simplicity, vision, link, shout, relay), next2 (his next reaction in the session: correction, praise, go, other, end), previousAgent (start of the agent reply he answered), reply, src (label source).
- ${S}/corpus/lifts-final.json — turn-level lifts already computed (agent-reply features vs correction; Drew features vs next-turn correction; harness rates; themes).
- ${S}/corpus/day-outcomes.json — per-day measured table for all ${A.nProfiles} profiled days.
Use python3 -I for analysis. Every number you report must come from code you ran; say "measured", "computed" or "judged" next to each claim.`

const FIND = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          claim: { type: 'string' },
          contrast: { type: 'string' },
          effect: { type: 'string' },
          n: { type: 'string' },
          test: { type: 'string' },
          goodDayQuote: { type: 'string' },
          badDayQuote: { type: 'string' },
          mechanism: { type: 'string' },
          evidenceKind: { type: 'string', enum: ['measured', 'computed', 'judged'] },
          proposal: { type: 'string' },
          numberToBeat: { type: 'string' },
        },
        required: ['id', 'claim', 'contrast', 'effect', 'n', 'test', 'goodDayQuote', 'badDayQuote', 'mechanism', 'evidenceKind', 'proposal', 'numberToBeat'],
      },
    },
    domainsOverTime: { type: 'string' },
    tradeoff: { type: 'string' },
    unaskedQuestion: { type: 'string' },
    tenX: { type: 'string' },
  },
  required: ['findings', 'domainsOverTime', 'tradeoff', 'unaskedQuestion', 'tenX'],
}

phase('Contrast')
const contrastP = agent(`You are finding what separates Drew's best working days from his worst, so we can make his agents more productive starting from his own success. Drew is the founder/CTO of Tangle and directs many coding agents.

${DATA}

Do this:
1. Read groups.json and the condensed days for the top and bottom quartiles of each ranking (composite, alignment, shipping).
2. Generate at least 15 candidate differences across: his voice (signatures, rules, length, dictation vs short commands, shouting, ownership grants, evidence demands), the domains and task types, how many projects/sessions ran in parallel, harness mix, time of day, session length, what the agents did before corrections (blocked/excuses, claims of done, long reports), correction themes, and relayed agent output.
3. TEST each candidate in Python on turns-final.jsonl / day-outcomes.json: compare the groups (per-day rates, not pooled turns, where the unit is the day), report effect size, n, and a permutation or bootstrap p-value where feasible. Drop candidates that do not hold.
4. Return the 8-12 strongest surviving findings, each with: a verbatim good-day quote and bad-day quote from Drew (copied exactly from turns-final text), the mechanism you think explains it, a concrete proposal (a rule for the agent profile, a phrasing change for Drew, a tool/check), and the number to beat (today's value and the target) with the test that would decide it.
Also: domainsOverTime (how his domains and concepts shifted across the ${A.nDays} days, with numbers), tradeoff (shipping vs alignment: compute r(zShip, zAlign) across days; explain with data), unaskedQuestion (the most important question nobody asked, answered from data if possible), tenX (what would make the next 30 days ten times better).
Write your working code and outputs under ${S}/analysis/contrast/.`, { label: 'contrast', phase: 'Contrast', schema: FIND })

phase('Profile')
const PROF = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    validation: { type: 'string' },
    voiceCard: { type: 'array', items: { type: 'object', properties: { quote: { type: 'string' }, day: { type: 'string' }, why: { type: 'string' } }, required: ['quote', 'day', 'why'] } },
    rewrites: { type: 'array', items: { type: 'object', properties: { said: { type: 'string' }, day: { type: 'string' }, whatHappened: { type: 'string' }, betterPhrasing: { type: 'string' }, why: { type: 'string' } }, required: ['said', 'day', 'whatHappened', 'betterPhrasing', 'why'] } },
    domains: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, days: { type: 'integer' }, file: { type: 'string' }, oneLine: { type: 'string' } }, required: ['name', 'days', 'file', 'oneLine'] } },
    notes: { type: 'string' },
  },
  required: ['files', 'validation', 'voiceCard', 'rewrites', 'domains', 'notes'],
}
const profileP = agent(`You are reverse-engineering "the greatest agent for Drew" from the days he was most aligned with his agents. Drew is the founder/CTO of Tangle and directs many coding agents.

${DATA}
Also read ${BRIEF} (the AgentProfile interface and materialization, verified against code) and ${S}/profiles/day-profiles.json (${A.nProfiles} validated day profiles).

Build:
1. ${S}/profiles/drew-operator.json — ONE master AgentProfile distilled from the best alignment and best composite days (groups.json). harness "claude-code"; model ${model('claude-code')}; prompt.instructions = [role in one sentence in Drew's terms, then 10-20 operating rules]. Each rule must be grounded in Drew's own words: quote him verbatim (copied exactly from turns-final text) where a quote carries it, and cite the day in metadata. Do NOT use prompt.systemPrompt. Instructions under 4,000 characters total. resources {"failOnError": true}. metadata.source = {"kind":"voice-profile","days":[...],"drewTurns":N}.
2. One profile per major domain of his work (find the 3-4 domains with the most days from the condensed file, e.g. sandbox platform/infra, Discovery research, company/GTM ops), each ${S}/profiles/drew-<domain-slug>.json, built the same way from the days in that domain, with the harness he succeeded with most in that domain (codex -> ${model('codex')}; pi/opencode -> ${model('pi')}).
3. Validate every file: ${NODE} ${A.scripts}/validate.mjs <file>. Fix until every file prints OK (PRIVATE means a personal detail or credential survived: remove it). Put the validator output in validation.
4. voiceCard: the 12 verbatim lines that best encode how Drew wants agents to work (with day and why).
5. rewrites: Drew asked "can we improve what I'm saying just a little bit, but keep the human nature of it". Find 6-8 recurring moments where his message led to a correction-or-friction loop (look at sequences in turns-final where next2 == "correction" repeats). For each: what he said (verbatim), what happened next, and a minimally edited version that keeps his voice but adds the one missing piece (a target number, a done-check, the scope boundary, the owner) — never a corporate rewrite.
Return the structured summary.`, { label: 'master-profile', phase: 'Profile', schema: PROF })

const VERDICT = {
  type: 'object',
  properties: {
    verdicts: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, verdict: { type: 'string', enum: ['survives', 'weakened', 'refuted'] }, numbers: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'verdict', 'numbers', 'reason'] } },
    biggestRisk: { type: 'string' },
  },
  required: ['verdicts', 'biggestRisk'],
}
const LENSES = [
  { key: 'confounds', text: 'CONFOUNDS: fleet volume growth over time, era (August vs October), project mix, harness mix, day length / number of Drew turns, label source (trace-mine Opus vs sonnet labels; sonnet over-calls ~18%), parallel sessions. Re-run each finding controlling for the strongest confound (stratify or regress) and see if it holds.' },
  { key: 'causation', text: 'REVERSE CAUSATION AND SELECTION: frustration begets corrections (a bad streak makes his tone harsher, not the other way round); infrastructure outages or broken products cause bad days independent of voice; good days may be easy-task days. Use within-session ordering, first-turn-of-session analysis, and days with the same domain to test direction.' },
  { key: 'measurement', text: 'MEASUREMENT VALIDITY: does each finding survive (a) alignment-only ranking, (b) shipping-only ranking, (c) excluding sonnet-labelled turns (trace-mine labels only), (d) dropping the 3 most extreme days? Is the effect larger than day-to-day noise (bootstrap the day-level difference)?' },
]
const redP = contrastP.then((c) => parallel(LENSES.map((l) => () =>
  agent(`You are a skeptic. Try to REFUTE each finding below with the data. Default to "weakened" when the evidence is thin.

${DATA}

Lens — ${l.text}

Findings (JSON): ${JSON.stringify((c?.findings ?? []).map(({ id, claim, contrast, effect, n, test }) => ({ id, claim, contrast, effect, n, test })))}

For every finding return a verdict (survives / weakened / refuted) with the numbers from code you ran. Write code under ${S}/analysis/redteam-${l.key}/.`,
    { label: `redteam:${l.key}`, phase: 'Red team', schema: VERDICT, model: 'sonnet' }).then((v) => ({ lens: l.key, ...(v ?? {}) })))))

const [contrast, profile, redteam] = await Promise.all([contrastP, profileP, redP])
return { contrast, profile, redteam }
