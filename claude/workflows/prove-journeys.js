export const meta = {
  name: 'prove-journeys',
  description: 'Prove an agent app\'s product flows by real usage: record each flow as a test identity, review the evidence skeptically, and write INDEX.md with a ranked fix list',
  whenToUse: 'An agent app must show that the flows that matter work for a real user (a launch check, a release, or proof of a fix). Args: {app, url, repo, host, checkout, identities, flows | flowsSource, outRoot, stamp}.',
  phases: [
    { title: 'Plan', detail: 'turn the app\'s own flow definition into journeys, when no flow list is given' },
    { title: 'Prepare', detail: 'one agent signs in every identity and checks the chat contract on the host' },
    { title: 'Journeys', detail: 'one agent per flow records it, two at a time' },
    { title: 'Critic', detail: 'a skeptic verifies every failure from frames and traces and ranks the fixes' },
    { title: 'Index', detail: 'INDEX.md from the critic result and the recorded turns' },
  ],
}

// Args (all strings unless noted):
//   app        short name in the app's journeys.config.mjs, e.g. "gtm"
//   url        production origin, e.g. "https://gtm.tangle.tools"
//   repo       the app's repository (local path or GitHub URL) and default branch, for reading code after a failure
//   host       Beelink ssh alias that records, e.g. "beelink2-wsl"
//   checkout   app checkout on that host with dependencies installed and journeys.config.mjs at its root
//   identities [{name, role, workspaces}] test identities by config name; never credentials
//   flows      [{id, title, brief}]; or flowsSource: the file and section that define what must work
//   outRoot    folder on this machine the journey folders are copied into
//   stamp      date stamp for folder names, e.g. "20261011"
//   maxTurns   chat turns per journey (number, default 6); budgetUsd per journey (number, default 3)
//   bar        optional: the quality bar in the owner's words, added to the defaults below

const A = args || {}
const OUT = `${A.outRoot}/journeys-${A.app}-${A.stamp}`
// This run's own output folder on the host, so the index covers this run only.
const HOST_OUT = `$HOME/.local/state/agent-app-journeys/${A.app}/runs/${A.stamp}`
const ENV = `JOURNEYS_OUT=${HOST_OUT}`
const MAX_TURNS = A.maxTurns || 6
const BUDGET = A.budgetUsd || 3
const IDENTITIES = (A.identities || []).map((i) => `- ${i.name}: ${i.role}${i.workspaces ? ` (workspaces: ${i.workspaces})` : ''}`).join('\n')

const RULES = `
CONTEXT
You are part of a run that proves ${A.app} (${A.url}, repository ${A.repo}) works for real users, recorded on video so the founder can watch what a user sees.
The recorder is agent-app's journeys kit: read its guide (agent-app docs/journeys.md, or node_modules/@tangle-network/agent-app/docs on the host) and \`agent-app-journeys --help\` before writing a script.
Recording host: ${A.host}, app checkout ${A.checkout} (journeys.config.mjs at its root). This run writes to ${HOST_OUT} on the host. Run every journey and kit command from that checkout with that folder set:
  ssh ${A.host} 'cd ${A.checkout} && ${ENV} nice -n 10 journeys-env -- pnpm exec agent-app-journeys run journeys/<flow-id>/run.ts'
  ssh ${A.host} 'cd ${A.checkout} && ${ENV} pnpm exec agent-app-journeys frames <flow-id> <label>'
Test identities (names in the config):
${IDENTITIES}

HARD RULES (breaking one fails your task)
- Use only these test identities and their test workspaces. Never touch a real customer's workspace. Never delete or reset anything.
- Never send, post, schedule, publish, approve, invite a real address or pay for anything outside the app. Drafts and approval cards are fine.
- Credentials stay on the host and never appear in a prompt, file, caption or frame. The kit signs in over HTTP; never type a password in a recorded page and never press Sign out in a shared session.
- At most ${MAX_TURNS} chat turns and about $${BUDGET} of agent spend per journey. No Anthropic API spend. Publish nothing.
- Browsers, installs, builds and tests run only on the Beelinks, never on this machine. Kill only processes you started, by exact PID.
- Measure, do not estimate; every number carries its source and denominator.
- The bar: founders are time-poor and allergic to slop. Output must be specific, sourced, correct and saved where they find it. UI: no tiny fonts, no field-path helper text, consistent selectors and dropzones, live validation, honest failures in plain words, never raw JSON or a bare code.${A.bar ? `\n- The owner's bar: ${A.bar}` : ''}
`

const FLOWS_SCHEMA = {
  type: 'object',
  properties: {
    flows: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, title: { type: 'string' }, brief: { type: 'string' } },
        required: ['id', 'title', 'brief'],
      },
    },
    source: { type: 'string', description: 'the file, section and revision the flows came from' },
  },
  required: ['flows', 'source'],
}

const PREP_SCHEMA = {
  type: 'object',
  properties: {
    ready: { type: 'boolean' },
    signedIn: { type: 'array', items: { type: 'string' }, description: 'identity: user id, verified' },
    chatContract: { type: 'string', description: 'checkChatContract result and the page it ran on' },
    outDir: { type: 'string', description: 'journey output folder on the host' },
    agentAppVersion: { type: 'string' },
    blockers: { type: 'array', items: { type: 'string' } },
  },
  required: ['ready', 'signedIn', 'chatContract', 'outDir', 'blockers'],
}

const JOURNEY_SCHEMA = {
  type: 'object',
  properties: {
    journey: { type: 'string' },
    verdict: { type: 'string', enum: ['pass', 'partial', 'fail', 'blocked'] },
    oneLine: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step: { type: 'string' },
          result: { type: 'string', enum: ['ok', 'slow', 'confusing', 'broken', 'blocked', 'skipped'] },
          seconds: { type: 'number' },
          videoAt: { type: 'string', description: 'mm:ss in the full video' },
          evidence: { type: 'string' },
        },
        required: ['step', 'result', 'evidence'],
      },
    },
    turns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ask: { type: 'string' },
          threadId: { type: 'string' },
          outcome: { type: 'string', description: 'the scorer\'s outcome from timings.json' },
          videoAgrees: { type: 'boolean', description: 'the frames show the same outcome the scorer recorded' },
          firstTextS: { type: 'number' },
          completeS: { type: 'number' },
        },
        required: ['ask', 'outcome', 'videoAgrees'],
      },
    },
    outputQuality: {
      type: 'object',
      properties: {
        grade: { type: 'string', enum: ['A', 'B', 'C', 'D', 'F', 'n/a'] },
        why: { type: 'string' },
        inventedClaims: { type: 'array', items: { type: 'string' } },
      },
      required: ['grade', 'why'],
    },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          what: { type: 'string' },
          evidence: { type: 'string', description: 'frame path, video path + mm:ss, thread id or trace entry' },
          reproSteps: { type: 'string' },
          likelyCause: { type: 'string', description: 'cite file:line on the default branch, found with git grep, only after observing the failure' },
          numberToBeat: { type: 'string' },
        },
        required: ['severity', 'what', 'evidence', 'reproSteps'],
      },
    },
    folder: { type: 'string', description: 'the copied journey folder on this machine' },
    script: { type: 'string', description: 'journey script path on the host' },
    notCovered: { type: 'array', items: { type: 'string' } },
  },
  required: ['journey', 'verdict', 'oneLine', 'steps', 'turns', 'outputQuality', 'failures', 'folder', 'notCovered'],
}

// The same shape agent-app's `agent-app-journeys index --critic` renders (CriticResult).
const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'how many flows truly work end to end for a real user, with the number and its denominator' },
    scorecard: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          journey: { type: 'string' },
          verifiedVerdict: { type: 'string', enum: ['pass', 'partial', 'fail', 'blocked'] },
          keyTiming: { type: 'string' },
          qualityGrade: { type: 'string' },
          topIssue: { type: 'string' },
          video: { type: 'string', description: 'highlights mp4 path' },
        },
        required: ['journey', 'verifiedVerdict', 'topIssue'],
      },
    },
    verifiedFailures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rank: { type: 'number' },
          severity: { type: 'string' },
          what: { type: 'string' },
          journeys: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'string' },
          likelyCause: { type: 'string' },
          fix: { type: 'string' },
          numberToBeat: { type: 'string', description: 'the measured number now with its denominator, and the target' },
          test: { type: 'string', description: 'the journey that proves the fix' },
        },
        required: ['rank', 'severity', 'what', 'evidence', 'fix', 'numberToBeat', 'test'],
      },
    },
    uiCritique: {
      type: 'array',
      items: {
        type: 'object',
        properties: { screen: { type: 'string' }, problem: { type: 'string' }, screenshot: { type: 'string' }, fix: { type: 'string' } },
        required: ['screen', 'problem', 'screenshot', 'fix'],
      },
    },
    scorerDisagreements: { type: 'array', items: { type: 'string' }, description: 'turns whose recorded outcome the frames contradict' },
    refutedOrUnproven: { type: 'array', items: { type: 'string' } },
    coverageGaps: { type: 'array', items: { type: 'string' } },
    criticFile: { type: 'string', description: 'path of critic-result.json written in the run folder' },
  },
  required: ['headline', 'scorecard', 'verifiedFailures', 'uiCritique', 'scorerDisagreements', 'refutedOrUnproven', 'coverageGaps', 'criticFile'],
}

let flows = A.flows
if (!flows || !flows.length) {
  phase('Plan')
  const plan = await agent(`${RULES}
YOUR TASK: read ${A.flowsSource || 'the app\'s launch checklist (its minimum customer path), PRODUCT_FLOWS and delivery plan'} in ${A.repo} on its default branch (git fetch first) and turn what the product promises into one journey per flow a real customer depends on, minimum customer path first, at most 8.
Each brief says who the person is, the outcome-level ask they would make, which identity and workspace to use, what must be true at the end, and what to look at (saved result after a reload, failure and recovery, phone width). Return the flows and their source.`, { label: 'plan', phase: 'Plan', schema: FLOWS_SCHEMA })
  flows = plan ? plan.flows : []
  log(`planned ${flows.length} flows from ${plan ? plan.source : 'nothing'}`)
}
if (!flows.length) return { error: 'no flows to record' }

phase('Prepare')
const prep = await agent(`${RULES}
YOUR TASK: make the host ready for ${flows.length} journeys.
1. On ${A.host} in ${A.checkout}: check it is on the app's default branch, that journeys.config.mjs exists and resolves, and that the installed agent-app exports ./journeys (report its version). If the config is missing, write one from the guide's example with the identities above, and say so.
2. Run \`journeys-env -- pnpm exec agent-app-journeys signin <identity>\` for every identity.
3. Write and run journeys/prepare/run.ts: open a chat page as one identity, call j.checkChatContract(page), take one shot, finish. Look at the screenshot.
Return what is ready, the output folder (${HOST_OUT}, expanded), and any blocker.`, { label: 'prepare', phase: 'Prepare', schema: PREP_SCHEMA })
if (!prep || !prep.ready) return { error: 'host not ready', prep }
log(`host ready: ${prep.signedIn.join('; ')}`)

phase('Journeys')
const reports = []
// Two at a time across the hosts: each journey holds 1-2 browser contexts and ffmpeg work.
for (let i = 0; i < flows.length; i += 2) {
  const pair = flows.slice(i, i + 2)
  const done = await parallel(pair.map((f, k) => () => agent(`${RULES}
HOST: ready; identities signed in (${prep.signedIn.join('; ')}); chat contract ${prep.chatContract}; output folder ${prep.outDir}.
${k === 1 ? 'Your pair partner starts at the same time: begin your script with await j.pause(30_000) before opening a context, so the two ffmpeg passes do not overlap.\n' : ''}
YOUR JOURNEY: ${f.id} — ${f.title}
${f.brief}

Write journeys/${f.id}/run.ts in ${A.checkout} with startJourney('${f.id}'), run it, then extract frames (agent-app-journeys frames ${f.id} <label>), copy ${prep.outDir}/${f.id}/ to ${OUT}/${f.id}/ with the rsync line finish() prints, and look at the screenshots and 6 to 10 frames with the Read tool before judging.
For each turn, compare the scorer's outcome in timings.json with what the frames show and set videoAgrees.
Return the structured report.`, { label: f.id, phase: 'Journeys', schema: JOURNEY_SCHEMA })))
  reports.push(...done.filter(Boolean))
  const missing = pair.filter((f, k) => !done[k]).map((f) => f.id)
  if (missing.length) log(`no report from ${missing.join(', ')}`)
}
log(`journeys reported: ${reports.length}/${flows.length}`)

phase('Critic')
const critic = await agent(`${RULES}
YOUR TASK: you are the skeptical reviewer of ${reports.length} journey reports (flows: ${flows.map((f) => f.id).join(', ')}). You did not write any of them.

REPORTS (JSON):
${JSON.stringify(reports, null, 1)}

1. Adversarially verify every P0 and P1: open its screenshots, extract frames at the cited mm:ss on ${A.host} and Read them, check thread ids and trace entries, and re-run the shortest repro with the kit where evidence is thin (at most 4 chat turns in total). Mark each verified, refuted or unproven. Let no plausible but unproven failure through, and no pass without evidence.
2. Check every turn: list in scorerDisagreements each turn whose recorded outcome the frames contradict.
3. Grade UI from screenshots and frames at both widths against the bar; each item names the screen, problem, image path and fix.
4. Rank verified failures by impact on a customer getting useful work done, minimum customer path first, each with a fix, the number now with its denominator, the target, and the journey that proves the fix.
5. Write the result as JSON to ${OUT}/critic-result.json and return it.`, { label: 'critic', phase: 'Critic', schema: CRITIC_SCHEMA })

phase('Index')
const index = await agent(`${RULES}
YOUR TASK: write the index. Copy ${OUT}/critic-result.json to ${prep.outDir}/critic-result.json on ${A.host}, then run there:
  cd ${A.checkout} && ${ENV} pnpm exec agent-app-journeys index ${prep.outDir} --critic ${prep.outDir}/critic-result.json --title "${A.app} journeys ${A.stamp}" --out ${prep.outDir}/INDEX.md
Copy INDEX.md to ${OUT}/INDEX.md, open it, and check its ranked fixes match the critic result and its turn table matches the timings. Return the INDEX.md path and its first 40 lines.`, { label: 'index', phase: 'Index' })

return { flows: flows.map((f) => f.id), prep, reports, critic, index, out: OUT }
