---
name: agent-eval-adoption
description: "Adopt @tangle-network/agent-eval (0.36.x) + @tangle-network/agent-runtime (0.21.x) in a real agent product. Use for eval harnesses, driven loops (refine / fanout-vote), MCP delegation tools, production trace capture, scorecard + ship-gate CI, held-out promotion, cross-profile matrix benchmarks, and release confidence."
---

# Agent Eval Adoption

Use this skill when wiring `@tangle-network/agent-eval` into a product repo, or
when reviewing such a wiring. It encodes the canonical shape shipped in four
vertical agents (`creative-agent`, `tax-agent`, `legal-agent`, `gtm-agent`) and
the substrate (`@tangle-network/agent-runtime`, `@tangle-network/agent-eval`,
`@tangle-network/agent-knowledge`).

A fresh adoption is correct iff every block in the **Acceptance checklist** at
the bottom holds against the repo. Less than that ships blind evals or
unmeasured regressions.

## Principle

Wrap the real product workflow. Do not build a parallel toy path.

```txt
production chat
  -> ProductionTraceSink (OTLP + RunRecord)
  -> persisted records.jsonl + traces.jsonl + agent-profile cells
  -> assertRealBackend  ← refuses blind runs before the ship-gate
  -> scorecard append   ← (scenario × profileHash) timeline
  -> ship-gate          ← composite + per-persona threshold
  -> analyst-loop       ← findings → knowledge / improvement adapters
  -> production-loop    ← held-out gate → auto-PR
```

Everything below is a slot in this pipeline. The numbering is the order a
fresh product should adopt them.

## Autoresearch / GEPA campaign contract

When the user asks for autoresearch, GEPA, recursive improvement, or any system
that improves an agent over time, do NOT stop at "GEPA-shaped data." Build or
verify the whole campaign loop — the 9 patterns below are that loop:

1. Ingest live + eval runs into one typed corpus (run id, commit, model,
   prompt/config hashes, tool calls, artifacts, cost, user feedback) — patterns
   3 (trace sink) + 5 (scorecard).
2. Convert runs to optimizer examples + feedback trajectories; failed
   infra/auth/tool setup is a typed failed run, not a score — pattern 2
   (analyst loop).
3. Define mutable surfaces explicitly (prompt components, tool docs, workflow
   policy, retrieval corpus, generated code, product adapters) — pattern 1
   (`defineAgent`).
4. Search over those surfaces (GEPA-style reflection or
   `runMultiShotOptimization`); every candidate gets a stable id + rationale —
   pattern 8 (`runEvalCampaign`).
5. Apply each candidate in an isolated git worktree or branch, never in-place
   against unrelated user work — `createSurfaceImprovementAdapter`.
6. Rerun train/dev/holdout through the same product adapter. The holdout gate
   decides promotion; LLM judges cannot override deterministic failures, build
   failures, runtime failures, or missing credentials — pattern 7
   (`HeldOutGate` + `runProductionLoop`).
7. Promote via reviewable PR or a clearly-named local candidate only when the
   gate passes. Persist the report, traces, candidate diff, release-confidence
   summary — pattern 9 (CI workflow integration).
8. Schedule recurring runs only after the one-shot campaign works locally and
   produces auditable artifacts.

Minimum surface area in a product repo:
- `pnpm eval` / equivalent — produces run artifacts + traces.
- `pnpm eval:improve` / equivalent — turns artifacts into findings + candidate
  prompt/code/knowledge changes.
- `pnpm eval:optimize` / equivalent — runs the search campaign + holdout gate.
- `.evolve/` (or equivalent) — stores findings, reports, candidate ids, traces,
  promotion decisions.

If any of the above is missing, the loop is not closed — see
`feedback_loop_closure_is_empirical` in operator memory.

## Driven loops — `runLoop` + topology drivers + profile presets

The substrate ships a topology-agnostic loop kernel in
`@tangle-network/agent-runtime/loops` (0.19+). The kernel orchestrates around
the sandbox SDK: each iteration is `sandboxClient.create({ backend: { profile } })`
+ `box.streamPrompt`. The kernel owns iteration accounting, concurrency,
abort propagation, cost aggregation, and trace emission. The driver owns
topology, the validator owns scoring, the output adapter owns event-stream
decode.

```ts
import { runLoop, createRefineDriver, createFanoutVoteDriver } from '@tangle-network/agent-runtime/loops'
import { coderProfile, createCoderValidator } from '@tangle-network/agent-runtime/profiles'

const { spec, output } = coderProfile({ harness: 'claude-code', task })
const validator = createCoderValidator(task)
const result = await runLoop({
  task,
  agentRuns: [spec],                         // round-robin across N specs for ensemble
  output,
  validator,
  driver: createRefineDriver({ maxIterations: 3 }),
  ctx: { sandboxClient, traceEmitter, signal },
})
```

### Foundational primitives — two profiles

`@tangle-network/agent-runtime/profiles` ships ONE profile preset today:

- **`coderProfile`** — task-completion (`src/profiles/coder.ts`). Bundles an
  `AgentProfile` (default harness selectable: `claude-code`, `codex`,
  `opencode`), `formatCoderPrompt`, `parseCoderEvents` (output adapter), and
  `createCoderValidator` (diff size, forbidden paths, test+typecheck verdicts).
  Use for any "produce a validated patch" task.

The **researcher** primitive is NOT a shipped profile preset. It's a
`ResearcherDelegate` interface (`src/mcp/delegates.ts`) consumers wire against
their own retrieval / corpus loop. The MCP server's `delegate_research`
forwards to whatever `ResearcherDelegate` you inject at `createMcpServer`
construction. The optional `@tangle-network/agent-knowledge` peer ships a
`multiHarnessResearcherFanout` consumers can adapt; the bin (`agent-runtime-mcp`)
auto-wires it when the peer is installed.

### Topologies — Refine + FanoutVote shipped; others deferred

`@tangle-network/agent-runtime/loops/drivers/`:

- **`createRefineDriver({ maxIterations })`** — single-task-per-iteration,
  feed the prior output back into the prompt, stop on validator success or
  iteration cap. Use for: incremental patches, document revision, anything
  monotonic.
- **`createFanoutVoteDriver({ variants, scoreFn })`** — N tasks per
  iteration in parallel, then `scoreFanoutVoteIterations` picks the winner.
  Use for: multi-harness coder fanout (`multiHarnessCoderFanout` is the
  shipped composition), redundant research with disagreement detection.

Deferred (NOT shipped — do not pretend they exist in adoption code):
**Council** (judge-of-judges over fanout outputs), **Decompose** (planner
splits task → subtasks → re-aggregate), **Pipeline** (typed handoff
between specialist agents). When a product reaches for one, build a custom
`Driver` against the kernel's interface (`src/loops/types.ts:Driver`); do
NOT vendor a forked kernel.

### Gotchas

- `runLoop` validates `ctx.sandboxClient.create` exists or throws
  `ValidationError`. A `null` sandbox client never reaches the LLM — fail
  loud at the boundary, do not stub.
- The kernel emits `loop.started`, `loop.iteration.dispatch`,
  `loop.iteration.ended`, `loop.decision`, `loop.ended` via
  `ctx.traceEmitter`. Wire this into the same OTLP sink as the chat path
  (section 3) so loop telemetry is queryable alongside chat turns.
- `runLoop` ROUND-ROBINS across `agentRuns[]`. To compare two harnesses on
  the same task, pass two specs and read winner index from `result.winner`.
- The output adapter MUST return a typed value or throw. A `null` /
  `undefined` adapter return silently drops the iteration from scoring.

## MCP delegation tools — `@tangle-network/agent-runtime/mcp`

The substrate ships an in-process or stdio MCP server (0.20+) that exposes
the five delegation tools to any agent harness that can mount MCP servers
(Claude Code, Codex, etc.). The server is profile-agnostic: it takes a
`CoderDelegate` and (optionally) a `ResearcherDelegate` you compose against
your sandbox client + loop topology.

### The five tools

Names, descriptions, and input schemas are exported verbatim from the
substrate. Use them in product system prompts unedited so the model receives
the same surface in prod and eval.

- **`delegate_code`** — "Delegate a coding task to specialist coder agents
  that produce a validated patch. ... Returns immediately with a taskId.
  Poll delegation_status to retrieve the patch + validator verdict
  (typically minutes-to-hours...). Identical inputs return the same taskId —
  safe to retry. When variants > 1, multiple coder harnesses (claude-code,
  codex, opencode) attempt the task in parallel and the highest-scoring
  patch wins (smallest passing diff)."
- **`delegate_research`** — "Delegate a research question to specialist
  researcher agents that produce source-grounded, evidence-bearing
  knowledge items. ... Returns immediately with a taskId. ... When variants
  > 1, multiple researcher harnesses run in parallel and the highest-scoring
  valid output wins (citation density × source diversity × recency match ×
  gap coverage). ... Multi-tenant isolation: every item carries `namespace`.
  The validator hard-fails when any item is scoped outside `namespace`.
  Never pass another tenant's namespace."
- **`delegation_status`** — "Poll the status of an async delegation. ...
  Throws NotFoundError when taskId is unknown — never silently returns
  `pending` for a typo."
- **`delegation_history`** — "Read past delegations newest-first. ...
  Filters: `namespace` (multi-tenant scope), `profile` (\"coder\" |
  \"researcher\"), `since` (ISO date). `limit` defaults to 50, capped at 500."
- **`delegate_feedback`** — "Record feedback on a delegation, artifact, or
  outcome. Synchronous — the event is durably stored when this call returns.
  ... `refersTo.kind`: \"delegation\" | \"artifact\" | \"outcome\". `by`:
  \"agent\" | \"user\" | \"downstream-judge\"."

### Mounting pattern — production AgentProfile.mcp

Compose at runtime, never declare statically in the SDK profile (the
sandbox-SDK's `AgentProfileMcpServer.env` doesn't template the
sandbox-scoped key). Reference impl from `gtm-agent/src/lib/.server/sandbox/index.ts:104`:

```ts
import type { AgentProfileMcpServer } from '@tangle-network/sandbox'

const DELEGATION_MCP_SERVER_KEY = 'agent-runtime-delegation'

export function buildDelegationMcpServer(
  options: { sandboxApiKey?: string; sandboxBaseUrl?: string } = {},
): Record<string, AgentProfileMcpServer> | undefined {
  const sandboxApiKey = options.sandboxApiKey ?? process.env.TANGLE_API_KEY
  if (!sandboxApiKey) return undefined                           // fail closed
  return {
    [DELEGATION_MCP_SERVER_KEY]: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@tangle-network/agent-runtime', 'mcp'],     // bin: agent-runtime-mcp
      env: {
        TANGLE_API_KEY: sandboxApiKey,
        SANDBOX_BASE_URL: options.sandboxBaseUrl ?? sandboxBaseUrl(),
      },
      enabled: true,
      metadata: {
        surface: 'delegation:dispatch',
        tools: ['delegate_code', 'delegate_research', 'delegate_feedback',
                'delegation_status', 'delegation_history'],
      },
    },
  }
}
```

Then merge into the per-turn `streamPrompt` profile (see
`composeProductionAgentProfile`).

### `TANGLE_API_KEY` — scope matters

The MCP server requires a `TANGLE_API_KEY` that can drive `new Sandbox({ apiKey })`.

- **`sk_sb_*`** — sandbox-scoped key. Can spawn sibling sandboxes and run
  delegations against the sandbox executor. Default for free-tier sandbox
  consumers. Cannot drive the paid router.
- **`orch_prod_*`** — orchestrator/production key. Drives both sandbox AND
  the paid router. Use for production worker secrets.

Set `AGENT_RUNTIME_MCP_ALLOW_NO_KEY=1` ONLY for the queue-only diagnostic
subset (feedback / status / history). The bin exits 2 with a clear message
when neither the key nor the opt-in is set.

### Sibling vs fleet mode — `TANGLE_FLEET_ID`

- **Sibling mode (default)** — `createSiblingSandboxExecutor`. Each
  delegation spawns a new sandbox alongside the caller's. Worker patches
  land in the worker's filesystem; the caller copies them out via the
  delegation result's `patch` field.
- **Fleet mode** — set `TANGLE_FLEET_ID` before launching the MCP server.
  `createFleetWorkspaceExecutor` dispatches into the fleet's shared
  workspace. Worker diffs land directly on the caller's filesystem with
  no cross-sandbox boundary. The parent sandbox sets this when launching
  the MCP server inside a fleet-aware harness.
- `TANGLE_FLEET_EXCLUDE_MACHINES` — comma-separated machine ids to skip
  during fleet round-robin (typically the coordinator machine the MCP
  server is itself running on).

The bin auto-detects with `detectExecutor({ sandboxClient })`; the choice
is logged to stderr at startup. Refuse to silently degrade — if
`TANGLE_FLEET_ID` is set but the key can't resolve the handle, the bin
exits 2.

### Other bin env knobs

- `MCP_MAX_CONCURRENT_SANDBOXES` — default 4; the kernel's `maxConcurrency`.
- `MCP_CODER_FANOUT_HARNESSES` — comma-separated harness ids for variants > 1.
- `MCP_DISABLE_CODER` / `MCP_DISABLE_RESEARCHER` — omit a tool selectively.
- `SANDBOX_BASE_URL` — sandbox-SDK base URL override.

### When to use each tool

| Tool | Use when |
| --- | --- |
| `delegate_code` | The user needs code written / fixed / refactored in a real repo; ≥ 50 lines, multiple files, or test coverage matters. Skip for trivial inline scripts. |
| `delegate_research` | Recency-bound web evidence, competitor teardowns, audience research, corpus lookups — anything needing source-grounded `items[]` with provenance. |
| `delegation_status` | Poll every 30–60s while waiting on `delegate_code` / `delegate_research`. Never busy-poll. |
| `delegation_history` | Before delegating a question you might have asked before. Feed into routing + calibration. |
| `delegate_feedback` | After you've used a delegation output and formed a judgment. Append-only — every call is a new event. |

## Production-profile reuse — the trap evals fall into

The eval MUST drive the same `AgentProfile` composer as production. If the
eval builds a parallel "eval profile" that omits the MCP servers / file
mounts / permissions block, the eval is structurally incapable of testing
delegation, tool calls, or any capability the profile gates — and the
scorecard rubric measures the gap between the toy profile and the real one,
not the agent's behaviour.

### The pattern

Export a single composer from `src/lib/.server/sandbox/` and import it from
both the chat handler AND the eval canonical runner.

```ts
// src/lib/.server/sandbox/index.ts
export function composeProductionAgentProfile(
  options: ComposeProductionAgentProfileOptions = {},
): AgentProfile {
  const delegationMcp = buildDelegationMcpServer({
    sandboxApiKey: options.sandboxApiKey,
    sandboxBaseUrl: options.sandboxBaseUrl,
  })
  // ... merge MCP, files, permissions, prompt
  return { ...baseProfile, mcp: mergedMcp, /* ... */ }
}
```

```ts
// eval/canonical.ts — DO import the production composer
import { composeProductionAgentProfile } from '../src/lib/.server/sandbox'

const profile = composeProductionAgentProfile({ sandboxApiKey: process.env.TANGLE_API_KEY })
// Pass `profile` into the sandbox client used by `runLoop` or the
// equivalent `runChatThroughRuntime` backend, never into a vanilla
// `createOpenAICompatibleBackend` — that transport posts plain
// `chat/completions` with no `tools` field; MCP tools never surface.
```

### Guard test — assert profile shape parity

Catch drift the moment the eval and production composers diverge:

```ts
// eval/profile-parity.test.ts
import { describe, it, expect } from 'vitest'
import { composeProductionAgentProfile } from '../src/lib/.server/sandbox'

describe('eval AgentProfile mirrors production', () => {
  it('mounts the delegation MCP server', () => {
    const profile = composeProductionAgentProfile({ sandboxApiKey: 'sk_sb_test' })
    expect(profile.mcp).toHaveProperty('agent-runtime-delegation')
    expect(profile.mcp?.['agent-runtime-delegation']?.metadata?.tools).toContain('delegate_research')
  })
  it('keeps prompt + permissions blocks from production', () => {
    const prod = composeProductionAgentProfile({ sandboxApiKey: 'sk_sb_test' })
    const evalP = composeProductionAgentProfile({ sandboxApiKey: 'sk_sb_test', name: 'eval-shadow' })
    expect(evalP.prompt.systemPrompt).toBe(prod.prompt.systemPrompt)
    expect(Object.keys(evalP.permissions ?? {}).sort()).toEqual(Object.keys(prod.permissions ?? {}).sort())
  })
})
```

### Anti-patterns

- **Parallel "eval profile"** that hand-rolls a subset of MCP servers,
  permissions, or files. The eval scorecard will diff against itself over
  time, never against production.
- **Backend transport with no tools support.** `createOpenAICompatibleBackend`
  POSTs `{ model, stream, messages }` only — no `tools` field. MCP tools
  declared in the profile never reach the LLM through this transport. If
  the eval uses it AND scores on tool-call presence, every run scores 0
  with no error. Use a backend that goes through the sandbox client
  (which respects `profile.mcp`), or build an MCP-aware backend.
- **Silently swallowed transport errors.** A 402 / 401 / 5xx from the
  router becomes a `backend_error` event in the runtime stream, which
  the chat-style harness collects but doesn't propagate to
  `result.error`. The rubric then records "agent didn't call the tool"
  when reality is "agent never reached the model." Surface backend errors
  as harness-level failures, not as zero-score scenario results.

## Cross-profile matrix — `runAgentMatrix` (agent-eval 0.36+)

`@tangle-network/agent-eval/matrix` (types shipped in 0.36; runner lands
next minor) sweeps scenarios × profiles × replicates and aggregates by
axis. Use for: cross-provider benchmarking ("does claude-sonnet-4-7 beat
deepseek-chat on persona X?"), thinking-level ablations, harness selection
("which coder harness wins on this repo?").

```ts
import type {
  MatrixScenario, RunAgentMatrixOptions,
} from '@tangle-network/agent-eval/matrix'
import { axisExtractors } from '@tangle-network/agent-eval/matrix'

const result = await runAgentMatrix({
  scenarios,                               // MatrixScenario<Task>[]
  profiles: [claudeProfile, codexProfile], // AgentProfile[] from @tangle-network/sandbox
  runCell: async (cell, signal) => {
    // cell carries { scenario, profile, repIndex, axes }. You spawn the
    // sandbox, drive the loop, score, return { score, costUsd, output? }.
    const { spec, output } = coderProfile({ harness: cell.profile, task: cell.scenario.task })
    const loopResult = await runLoop({ task: cell.scenario.task, agentRuns: [spec], output, validator, driver, ctx: { sandboxClient, signal } })
    return { score: loopResult.winner?.verdict.score ?? 0, costUsd: loopResult.costUsd, output: loopResult.winner?.output }
  },
  axes: {
    harness: axisExtractors.harness,            // built-in
    model: axisExtractors.model,
    thinkingLevel: axisExtractors.thinkingLevel,
    persona: (profile) => profile.metadata?.persona as string | undefined,
  },
  reps: 3,
  maxConcurrency: 4,
  costCeiling: 5.0,                          // abort cleanly when cumulative cost crosses $5
})
```

### Aggregation

`result.byAxis` carries `AxisSummary[]` per axis (passRate, meanScore,
totalCostUsd, sampleSize). `result.summary` carries totals +
`costCeilingReached` + `aborted` + `skippedCells`. Use these for the
public benchmark dashboard; do NOT recompute by hand from `cells[]` —
the substrate's aggregator already handles `skipped` correctly.

### Gotchas

- `runCell` may throw; the matrix captures throws as `CellResult.error`
  WITHOUT aborting the rest of the run. Partial completion is observable
  via `summary.skippedCells`.
- `costCeiling` is a soft abort — in-flight cells finish; new ones don't
  start. Set it conservatively for paid-backend matrices.
- `signal` propagates a child `AbortSignal` into your `runCell`; honour
  it or the matrix can't abort cleanly.

## Live trace flow — the production-to-evolution pipeline

The same trace surface a chat turn emits is the substrate the analyst loop
and production loop consume. Wire once; every flow downstream is free.

```txt
runLoop / runChatThroughRuntime
  └─ SandboxEvent stream (text_delta / tool_call / tool_result / artifact)
       └─ output.parse(events)        — typed Output (CoderOutput, research items, chat finalText)
            └─ validator.validate     — DefaultVerdict { score, valid, error? }
                 └─ trace events       — LoopTraceEvent + RuntimeStreamEvent
                      └─ ingestion mount — createProductionTraceSink → OTLP + RunRecord
                           └─ .production-data/traces/events.ndjson
                                └─ analyst loop — runAnalystLoop → FindingsStore
                                     └─ production-loop — held-out gate + re-eval
                                          └─ ship — httpGithubClient auto-PR
```

Every arrow is a substrate seam, not a product hand-roll. Skipping any
link breaks the loop closure — see "Bug classes the substrate now
prevents" below.

## 1. `defineAgent` manifest

One declarative file names every mutable surface the self-improvement loop is
allowed to touch, plus the rubric vocabulary the analyst loop scores against.
The substrate validates every surface against disk at module load —
`AgentManifestError` lists the offenders, so a misconfigured manifest fails at
startup, not at the first finding.

`creative-agent/eval/agent.config.ts:32`:

```ts
import { DEFAULT_TRACE_ANALYST_KINDS } from '@tangle-network/agent-eval'
import { defineAgent } from '@tangle-network/agent-runtime/agent'

export const creativeAgent = defineAgent({
  id: 'creative-agent',
  repoRoot: REPO_ROOT,
  surfaces: {
    systemPrompt: 'src/lib/.server/agent-prompt/skills',
    tools: 'tools',
    rubric: 'eval/lib/creative-rubric.ts',
    knowledge: '.agent-knowledge',
    personas: 'eval/scenarios',
  },
  rubric: { dimensions: [/* {id, weight, score} per dimension */] },
  runtime: { act: async () => { throw new Error('use canonical-runner.ts') } },
  personas: async () => [],
  analystKinds: DEFAULT_TRACE_ANALYST_KINDS,
  analyst: {
    model: process.env.ANALYST_MODEL ?? 'claude-haiku-4-5',
    backend: { apiKey: process.env.TANGLE_API_KEY ?? '', baseUrl: process.env.TANGLE_ROUTER_URL ?? 'https://router.tangle.tools/v1' },
  },
  autoApply: {
    knowledge:   { enabled: true, confidenceThreshold: 0.85, mode: 'write' },
    improvement: { enabled: true, confidenceThreshold: 0.90, mode: 'open-pr' },
  },
})
```

Cross-vertical references (same shape, different surface paths):
`tax-agent/tests/eval/agent.config.ts:33`,
`legal-agent/tests/eval/agent.config.ts`,
`gtm-agent/eval/agent.config.ts`.

### Gotchas

- `repoRoot` must be ESM-safe (`dirname(fileURLToPath(import.meta.url))`) or
  CJS-safe (`resolve(__dirname, '..')`), whichever the package emits. A wrong
  base path fails surface validation on first load.
- `runtime.act` MUST throw with a message pointing to the canonical runner
  unless you actually wire the substrate's re-run path. A silent stub turns
  outcome-measurement into a no-op.
- Don't omit `analystKinds` to "default it later" — the loop probes
  `manifest.analystKinds`; an empty array means zero findings.

## 2. Analyst loop (`runAnalystLoop`)

Capture is half the system. The other half is consumption: every run must
produce *durable findings* (not prose), diff against the prior run, and
propose mutations to either the knowledge base or a mutable surface (system
prompt, tool docs, rubric, personas).

`creative-agent/eval/analyst-loop.ts:121`:

```ts
import {
  AnalystRegistry, DEFAULT_TRACE_ANALYST_KINDS,
  FindingsStore, createTraceAnalystKind,
} from '@tangle-network/agent-eval'
import { OtlpFileTraceStore } from '@tangle-network/agent-eval/traces'
import { runAnalystLoop } from '@tangle-network/agent-runtime/analyst-loop'
import {
  createSurfaceImprovementAdapter,
  createSurfaceKnowledgeAdapter,
} from '@tangle-network/agent-runtime/agent'
import { proposeFromFindings, applyKnowledgeWriteBlocks } from '@tangle-network/agent-knowledge'

const registry = new AnalystRegistry()
for (const spec of creativeAgent.analystKinds) {
  registry.register(createTraceAnalystKind(spec, { ai, model }))
}
const findingsStore = new FindingsStore('.evolve/findings/findings.jsonl')
const traceStore   = new OtlpFileTraceStore({ path: `${runDir}/otlp-spans.jsonl` })

const knowledgeAdapter   = createSurfaceKnowledgeAdapter({ knowledgeRoot }, { proposeFromFindings, applyKnowledgeWriteBlocks })
const improvementAdapter = createSurfaceImprovementAdapter({
  surfaces: creativeAgent.surfaces, repoRoot,
  mode: creativeAgent.autoApply.improvement.mode,    // 'open-pr' | 'write' | 'none'
  ghRepo: 'tangle-network/creative-agent',
  draftPatch: (input) => draftPatchWithLlm(input, ai, model),
})

const result = await runAnalystLoop({
  runId, registry, inputs: { traceStore }, findingsStore,
  knowledgeAdapter, improvementAdapter,
  autoApply: {
    knowledge: true,           knowledgeConfidenceThreshold: 0.85,
    improvement: true,         improvementConfidenceThreshold: 0.90,
  },
  onEvent: (ev) => { /* forward analyst-completed / knowledge-applied / improvement-applied */ },
})
```

### Subject grammar — load-bearing

Each finding carries a typed `FindingSubject` (Zod-enforced). The substrate's
adapters route on `subject.kind`. A finding whose subject doesn't match a
recognised kind lands in `skipped` and never produces a mutation.

| `subject.kind`                                    | Adapter             | Effect                                          |
| ------------------------------------------------- | ------------------- | ----------------------------------------------- |
| `knowledge.wiki` / `knowledge.claim` / `.raw` / `.stale` | KnowledgeAdapter    | write `.agent-knowledge/<slug>.md` etc.         |
| `system-prompt` (with `section`)                  | ImprovementAdapter  | draft patch against `surfaces.systemPrompt`     |
| `tool-doc` (with `tool`)                          | ImprovementAdapter  | draft patch against `surfaces.tools`            |
| `rubric` (with `dimension`)                       | ImprovementAdapter  | draft patch against `surfaces.rubric`           |
| `persona` (with personaId)                        | ImprovementAdapter  | draft patch against `surfaces.personas`         |
| `cluster`                                         | (evidence only)     | counted; no mutation                            |

### Gotchas

- **One ledger per product, in the repo**: `.evolve/findings/findings.jsonl`.
  Cross-run diffs (`appeared` / `disappeared` / `persisted` / `changed`)
  compute against the previous `run_id` automatically. Markdown notes break
  this — keep findings machine-queryable.
- **Auto-apply knowledge, withhold improvement** until the producer's
  precision is measured. Knowledge writes are `git revert`-able; prompt /
  rubric / tool edits change agent behaviour and want operator review via PR.
- **OTLP path is canonical**. The canonical runner emits
  `<runDir>/otlp-spans.jsonl` during its trace-analyst step. Reading anything
  else is a redundant projection. If the file is empty, exit cleanly — don't
  fabricate spans.
- The `draftPatch` callback returns an empty patch when no actionable edit
  is warranted. The substrate counts that as a soft skip — do not throw.

## 3. Production trace sink

Every production chat session emits OTLP spans + a canonical
`ProductionRunRecord` through a per-agent factory wrapping
`createProductionTraceSink`. Eval reads from the same shape that prod writes.

`creative-agent/src/lib/.server/agent-runtime/trace-capture.ts:51`:

```ts
import {
  createProductionTraceSink,
  type ProductionTraceSink,
  type ProductionTraceSinkOpts,
} from '@tangle-network/agent-runtime/agent'

export function createCreativeProductionSink(env: CreativeWorkerTraceEnv): ProductionTraceSink {
  const sinkOpts: ProductionTraceSinkOpts = { projectId: 'creative-agent' }
  if (env.LANGFUSE_OTEL_ENDPOINT) {
    sinkOpts.otlp = {
      endpoint:     env.LANGFUSE_OTEL_ENDPOINT,
      authHeader:   env.LANGFUSE_OTEL_AUTH,    // full 'Basic <base64>' value
    }
  }
  return createProductionTraceSink(sinkOpts)
}
```

Then in the chat handler:

```ts
const sink   = createCreativeProductionSink(env)
const result = runChatThroughRuntime({ ..., traceSink: sink })
ctx.waitUntil(result.traceFlush())
```

Same factory in: `tax-agent/packages/api-worker/src/services/agent-runtime/trace-capture.ts`,
`legal-agent/...`, `gtm-agent/...` — all named `create<Agent>ProductionSink`.

### Gotchas

- Span / OTLP / hook failures land in `console.warn` and NEVER surface to the
  user. The substrate enforces this; don't catch around it.
- Omit the `otlp` block when env is absent — the sink still composes
  `RunRecord` rows. Operators flip OTLP forwarding on by setting worker
  secrets, no redeploy.
- `LANGFUSE_OTEL_AUTH` is the full `Basic <base64>` header, not the raw key.
  The sink does not base64-encode for you.
- `traceFlush()` must be awaited in `ctx.waitUntil` — losing it drops the
  span batch at request end.

## 4. `assertRealBackend` + `enforceBackendIntegrity` guard — **the Phase A insight**

This is the headline bug class the substrate now prevents. Without it, your
eval can run completely blind — zero LLM calls, every persona returning a
stub — and the ship-gate happily reports 0/N as "agent regression." You then
deploy a "fix" against the imaginary regression and you've shipped real
damage.

Mechanism: every `RunRecord` carries `tokenUsage.input` / `.output`. When all
records are zero, no backend was ever called. `assertRealBackend(records)`
throws `BackendIntegrityError` on verdict `'stub'`. `'mixed'` is allowed
through — partial failure is informative but not blind.

Wire it AFTER `RunRecord[]` is built, BEFORE the ship-gate. Default ON.
Opt-out only for synthetic-record tests via `EVAL_SKIP_BACKEND_INTEGRITY=1`
or `skipFlag=true`.

`legal-agent/tests/eval/lib/backend-integrity.ts:45`:

```ts
import {
  assertRealBackend, BackendIntegrityError, summarizeBackendIntegrity,
  type BackendIntegrityReport, type RunRecord,
} from '@tangle-network/agent-eval'

export function enforceBackendIntegrity(
  records: ReadonlyArray<RunRecord>,
  skipFlag?: boolean,
  env: NodeJS.ProcessEnv = process.env,
): BackendIntegrityReport | null {
  if (skipFlag || env.EVAL_SKIP_BACKEND_INTEGRITY === '1') return null
  if (records.length === 0) return null
  const report = summarizeBackendIntegrity(records)
  assertRealBackend(records)   // throws on 'stub'
  return report
}
```

Call site (`creative-agent/eval/canonical-runner.ts:348`):

```ts
let integrityReport: BackendIntegrityReport | null = null
try {
  integrityReport = enforceBackendIntegrity(records, opts.skipBackendIntegrity)
} catch (err) {
  if (err instanceof BackendIntegrityError) {
    writeFileSync(resolvePath(artifactDir, 'backend-integrity.json'),
      JSON.stringify({ runId, scoredAt: new Date().toISOString(), report: err.report }, null, 2))
  }
  throw err   // skip the ship-gate — there is no agent signal to gate on
}
```

### Gotchas

- **Throw BEFORE the ship-gate runs.** A blind run has zero signal; running
  the gate on it pollutes the scorecard with a fake "everything regressed"
  baseline that later real runs will be diffed against.
- **Always persist `backend-integrity.json`** on both the success and the
  throw path. The post-mortem bundle needs the diagnosis when an operator
  asks "why did nightly fail at 02:14 UTC."
- Reference PRs that wired this: `creative-agent#147`, `tax-agent#91`,
  `gtm-agent#145`, `legal-agent#98`.

## 5. Scorecard wiring — `agentProfileHash` + `recordRunsToScorecard`

A single eval pass cannot tell you "did this commit regress persona X on this
profile" — only "did this run pass." The scorecard is an append-only JSONL
log keyed by `(scenarioId × profileHash)`; each line is one run on one cell.
`loadScorecard` + `diffScorecard` answer the regression question with a
Welch's t-test on the latest entries vs their predecessors.

`creative-agent/eval/scorecard-integration.ts:38`:

```ts
import {
  agentProfileHash, diffScorecard, formatScorecardDiff, loadScorecard,
  recordRunsToScorecard, type AgentProfile, type RunRecord, type ScorecardDiff,
} from '@tangle-network/agent-eval'

export function buildScorecardAgentProfile(model: string): AgentProfile {
  const skills = Object.keys(creativeAgentProfile.subagents ?? {}).sort()
  const tools  = Object.entries(creativeAgentProfile.tools ?? {})
                  .filter(([, on]) => on === true).map(([id]) => id).sort()
  return {
    id: `${creativeAgentProfile.name}@v${creativeAgentProfile.version}/${model}`,
    model, skills, tools,
    promptVersion: `production-loop-addendum/v${addendumVersion}`,
    metadata: { profileName: creativeAgentProfile.name, profileVersion: creativeAgentProfile.version },
  }
}

export function recordScorecardAndDiff(input: ScorecardWiringInput): ScorecardWiringResult {
  const lines     = recordRunsToScorecard(input.scorecardPath, input.runs, { profile: input.profile, commitSha: input.commitSha })
  const scorecard = loadScorecard(input.scorecardPath)
  const diff      = diffScorecard(scorecard)
  return {
    appendedCells: lines.length,
    profileHash:   agentProfileHash(input.profile),
    diff, formatted: formatScorecardDiff(diff),
    regressed:     diff.cells.some((c) => c.verdict === 'regressed'),
  }
}
```

CLI flag: `--fail-on-regression` (or `EVAL_FAIL_ON_REGRESSION=1`) flips the
diff from informational to a hard CI gate.

Same shape in `tax-agent/tests/eval/lib/scorecard-integration.ts`,
`legal-agent/tests/eval/lib/scorecard-integration.ts`,
`gtm-agent/eval/scorecard-integration.ts`.

### Gotchas

- **`id` is excluded from `agentProfileHash`.** Human-facing only. The hash
  covers `{ model, skills, tools, promptVersion, metadata }`.
- **Sort `skills` and `tools`** before constructing the profile. Re-ordering
  inside the source profile would otherwise move the hash and split the
  timeline.
- **Welch's t-test NaN trap** — `diffScorecard` calls a cell `regressed` only
  when `|Cohen's d| ≥ minEffect AND p ≤ maxP`. With identical seeds /
  identical scores variance is zero, `p = NaN`, and every move silently
  shows `flat`. Real eval scoring already has variance; tests must seed
  per-rep variance explicitly. See
  `tax-agent/tests/eval/scorecard-wiring.test.ts:117`.
- **The JSONL is checked into the repo** at `eval/.scorecard.jsonl` (or
  `tests/eval/.scorecard.jsonl`). Don't gitignore it — that's the
  multi-commit history the diff reads from.
- Reference PRs: `creative-agent#145`, `tax-agent#90`, `gtm-agent#144`,
  `legal-agent#97`.

## 6. Per-run `AgentProfileCell` — `buildAgentProfileCell` / `buildSandboxAgentProfileCell`

Coexists with the scorecard profile; do not conflate them. The scorecard's
`AgentProfile` is the behaviour-only key whose hash is stable across runs.
The `AgentProfileCell` is stamped per-`RunRecord` and carries the run-time
identity: harness id+version, model, prompt hash, backend label, persona
suite. Use it to filter scorecard cells by harness or backend after the
fact.

`creative-agent/eval/agent-profile-cell.ts:1`:

```ts
import { buildAgentProfileCell, type AgentProfileCell, type AgentProfileJson } from '@tangle-network/agent-eval'

export async function buildCreativeAgentProfileCell(args: {
  harnessVersion: string; model: string; promptHash: string;
  backend: string; personaSuite: string;
}): Promise<AgentProfileCell> {
  return buildAgentProfileCell({
    profileId:     `${creativeAgentProfile.name}@${creativeAgentProfile.version}`,
    sourceProfile: { kind: 'sandbox-agent-profile', profile: toAgentProfileJson(creativeAgentProfile) },
    harness:       { id: 'creative-agent-canonical-eval', version: args.harnessVersion },
    model: args.model, promptHash: args.promptHash,
    dimensions:    { backend: args.backend, personaSuite: args.personaSuite },
  })
}
```

For products consuming a sandbox-SDK `AgentProfile` directly, use the
short-circuit `buildSandboxAgentProfileCell(profile, { harness, model,
promptHash, dimensions })` (`agent-eval/src/agent-profile-cell.ts:434`) — it
hard-codes the `sandbox-agent-profile` kind and the JSON canonicalization.

### Gotchas

- Both helpers throw `AgentProfileCellValidationError` on a profile missing
  `name` / `version`. Do not swallow it; the cell IS the run's identity and
  a fabricated default corrupts every downstream join.
- Stamp the cell onto every `RunRecord.agentProfile` field before
  `recordRunsToScorecard` reads them. The scorecard composes — it does not
  fabricate cells from a missing field.

## 7. Held-out promotion gate + `runProductionLoop`

`runProductionLoop` ties trace ingestion → cluster ranking → mutation →
held-out scoring → release-confidence gate → auto-PR into one call.

`creative-agent/src/lib/.server/production-loop/index.ts:110`:

```ts
import {
  httpGithubClient, runProductionLoop,
  type ProductionLoopResult, type Scenario,
} from '@tangle-network/agent-eval'

const result = await runProductionLoop<CreativeProductionLoopVariant>({
  runId, target: 'creative-agent/production-loop-addendum',
  traceStore, feedbackStore,
  cluster: { minClusterSize: 5, minSeverityRatio: 0.05, maxClustersPerCycle: 1 },
  evolve: {
    baselinePrompt: { addendum: PRODUCTION_LOOP_ADDENDUM_BASELINE },
    baselineId:     `baseline-v${PRODUCTION_LOOP_ADDENDUM_VERSION}`,
    holdoutScenarios: CREATIVE_LOOP_HOLDOUT_SCENARIOS as Scenario[],
    runner: buildRunner(options), scorer: buildScorer(options), mutator: buildMutator(),
    gate:   { baselineKey: `baseline-v${PRODUCTION_LOOP_ADDENDUM_VERSION}`,
              minProductiveRuns: 2, pairedDeltaThreshold: 0.03,
              overfitGapThreshold: 0.2, seed: 1729 },
    reps: 2, generations: 2, populationSize: 3, scoreConcurrency: 2,
  },
  releaseThresholds: { minPassRate: 0.6, minMeanScore: 0.6, minSearchRuns: 1, minHoldoutRuns: 2 },
  ship: options.github ? {
    client: httpGithubClient({ token: options.github.token }),
    repo:   { owner: 'tangle-network', name: 'creative-agent' },
    branchPrefix: 'eval/auto-improve', baseBranch: 'main',
    promptFilePath: 'src/lib/.server/production-loop/prompt-addendum.ts',
    labels: ['production-loop', 'auto-improve'],
    renderPromptFile: (newAddendum) => renderAddendumFile(asAddendum(newAddendum)),
  } : undefined,
})
```

Same pattern in: `tax-agent/tests/eval/lib/production-loop.ts:40`,
`gtm-agent/src/lib/.server/production-loop/`,
`legal-agent/src/lib/.server/production-loop/`.

### Gotchas

- **The gate fails closed.** `pairedDeltaThreshold` + `overfitGapThreshold`
  + `minProductiveRuns` must all be satisfied. A "promote when better than
  baseline" without these is a regression vector.
- **Static skills are not loop-owned.** The loop rewrites a single
  `prompt-addendum.ts` only. Skills under `agent-prompt/skills/` are
  human-curated.
- **`renderPromptFile` must produce a syntactically valid TS module** —
  `httpGithubClient` commits its return verbatim. Round-trip the result
  through `tsc --noEmit` in tests.
- Validate `llm` transport carries an `apiKey` / `bearer` / `authHeader`
  before calling. Falling back to the free router for paid judge calls is
  a footgun; throw `ValidationError`.

## 8. `runEvalCampaign` — variant × scenario × seed sweeps

When you need to compare multiple candidate variants over the same scenarios
with paired statistics, use `runEvalCampaign`
(`agent-eval/src/eval-campaign.ts:298`). Single-variant nightly runs do not
need it — they emit single-variant `analyzeOptimizationResult` derivatives
straight from the canonical runner.

Validate: throws on empty variants, empty scenarios, duplicate variant ids,
duplicate scenarioIds. Treat those as authoring errors and fix the caller.

## 9. CI workflow integration

Two workflows live under `.github/workflows/`:

- `nightly-eval.yml` — daily at 02:00 UTC, runs the full persona corpus on
  the configured backend (`tcloud` on `self-hosted, staging-runner` is the
  shipped default; GitHub-hosted cannot reach `cli-bridge`). Uploads
  `eval/.runs/<runId>/` as an artifact. Optional Sunday 03:00 UTC
  `eval:evolve` cron when `package.json` defines that script. Reference:
  `creative-agent/.github/workflows/nightly-eval.yml`,
  `tax-agent/.github/workflows/nightly-eval.yml`,
  `legal-agent/.github/workflows/nightly-eval.yml`.
- `production-loop.yml` — weekly held-out promotion cycle. Mondays 06:00
  UTC. Needs `TANGLE_API_KEY` + `GH_AUTO_PR_TOKEN` (falls back to
  `GITHUB_TOKEN`). Calls `pnpm eval:production-loop` with optional
  `--dry-run`. Reference: `tax-agent/.github/workflows/production-loop.yml`.

### Gotchas

- `runs-on: [self-hosted, staging-runner]` is the canonical label. The
  `tcloud` backend requires this; do not silently switch to
  `ubuntu-latest`.
- `concurrency.cancel-in-progress: false` — the two crons can land on the
  same SHA; cancelling the earlier one corrupts the scorecard append order.
- `permissions: { contents: write, issues: write, pull-requests: write }` —
  the auto-PR + regression-issue flows need all three. A scoped-down token
  silently no-ops.

# Bug classes the substrate now prevents

These are the lessons the canonical patterns above encode. An adoption that
omits any one of them is shipping the bug class it prevents:

1. **Blind evals masquerading as agent collapse.** Without
   `assertRealBackend`, a router 401 / config typo / missing env returns
   zero-token responses for every persona. The ship-gate reads 0/N and
   reports "agent regressed" — and any "fix" you ship is against an
   imaginary regression. The Phase A insight: **the eval cannot trust its
   own conclusions without a backend integrity check**. Make this guard the
   first line that runs against `RunRecord[]`.
2. **Per-run pass/fail blind to multi-commit regressions.** Without the
   scorecard, you have no `(scenario × profileHash)` timeline. A commit that
   degrades persona X by 30pp passes its individual ship-gate if the
   composite is still above threshold. Welch's-t over the scorecard catches
   the persona-level regression.
3. **Hash drift from un-sorted skills / tools.** Re-ordering inside the
   source profile changes the hash. The timeline splits. The diff sees
   "new cell" everywhere and silently passes. Sort before hashing.
4. **NaN-p `flat` verdicts on identical-seed tests.** Test fixtures that
   reuse the same score across reps produce zero variance, `p = NaN`, and
   no cell ever shows `regressed`. The scorecard's CI gate appears to work
   in tests and fails in production. Seed per-rep variance.
5. **Stub `runtime.act` swallowed by outcome-measurement.** A manifest
   that returns `undefined` from `runtime.act` instead of throwing makes
   the substrate's outcome-measurement step return zero score deltas
   silently — every improvement looks neutral. Throw with a pointer to the
   real runner.
6. **Subject-grammar drift silencing analysts.** A finding whose `subject`
   doesn't match a registered `FindingSubject.kind` lands in `skipped`. If
   you bump an analyst's prompt version without rerunning the subject Zod
   tests, the loop runs, prints "0 findings", and shows green.
7. **Auto-applied improvement adapters without precision data.** Mutating
   the system prompt without operator review propagates analyst false
   positives directly into agent behaviour. Default
   `autoApply.improvement.mode = 'open-pr'` and flip to `'write'` only
   after measuring producer precision.
8. **Trace sinks throwing into the user path.** A misconfigured OTLP
   endpoint must NEVER surface to the chat user. The substrate's
   `createProductionTraceSink` catches; do not wrap with code that
   re-throws.
9. **`renderPromptFile` emitting invalid TS.** The production-loop commits
   the rendered file verbatim. A missing closing brace ships a broken
   main. Round-trip every renderer through `tsc --noEmit` in tests.
10. **Eval backend lacks MCP tool support.** `createOpenAICompatibleBackend`
    POSTs `{ model, stream, messages }` only — no `tools`. An eval that
    scores on `delegate_research` / `delegate_code` tool_call presence
    through this transport scores 0 with `error: null` on every run. The
    fix is "use the sandbox client that respects `profile.mcp`," not
    "tweak the rubric."
11. **Parallel eval AgentProfile drifting from production.** A
    hand-rolled `evalAgentProfile` that omits the MCP servers (or
    permissions, or file mounts, or system prompt) makes the eval
    structurally incapable of testing the capabilities production gates
    on. The scorecard timeline then tracks drift between the two
    profiles, not agent behaviour. Import the production composer; add a
    guard test on shape parity.
12. **Silent transport failure becomes "agent didn't delegate."** A 402 /
    401 / 5xx from the router lands in the stream as `backend_error`,
    not as a thrown exception. A harness that drains the stream and
    treats stream-end as success records `toolCalls: []` + `finalText:
    ''` + `error: null` and the rubric reports "agent regression." The
    operator has no signal pointing at "out of credits / wrong key /
    upstream 5xx." Inspect `backend_error` events and surface them on
    `result.error`.

# Review red flags

- The eval path does not exercise the production adapter (parallel toy harness).
- LLM judges override failed build / test / runtime gates.
- No held-out split exists; the optimization loop sees every scenario.
- Runs do not record commit, model, prompt hash, config hash, or cost.
- `assertRealBackend` is opted out by default, not opted out only for tests.
- Scorecard JSONL is gitignored.
- `findings.jsonl` lives outside the repo.
- Production trace sink throws into the chat path.
- Auto-apply improvement runs without operator review and without a measured
  precision floor.
- Reports claim wins without `runId` + `commitSha` + scorecard diff link.
- Eval uses `createOpenAICompatibleBackend` and the rubric scores on MCP
  tool calls. The transport posts plain `chat/completions` with no
  `tools` field — the rubric can never pass.
- Eval builds a parallel `AgentProfile` instead of importing the
  production composer (`composeProductionAgentProfile` or equivalent
  from `src/lib/.server/sandbox/`).
- `runLoop` / `runChatThroughRuntime` errors are swallowed — `backend_error`
  events in the stream don't propagate to harness-level failure.
- MCP delegation server mounted via static `AgentProfileMcpServer.env`
  rather than the runtime composer. The SDK doesn't template
  `mcp.env.TANGLE_API_KEY` so the static path ships an empty key.

# Acceptance checklist

A freshly-adopted product is correctly wired iff ALL hold:

- [ ] `<eval-root>/agent.config.ts` exports `defineAgent({...})` with every
      surface validated against disk at module load.
- [ ] `<eval-root>/analyst-loop.ts` runs `runAnalystLoop` with
      `createSurfaceImprovementAdapter` + `createSurfaceKnowledgeAdapter` +
      `OtlpFileTraceStore`, ledger at `.evolve/findings/findings.jsonl`.
- [ ] `src/lib/.server/agent-runtime/trace-capture.ts` (or
      package-equivalent) exports `create<Agent>ProductionSink(env)` wrapping
      `createProductionTraceSink({ projectId, otlp? })`.
- [ ] Chat handler wires `traceSink` + `ctx.waitUntil(result.traceFlush())`.
- [ ] `<eval-root>/lib/backend-integrity.ts` exports
      `enforceBackendIntegrity(records, skipFlag?)`; called after
      `RunRecord[]` is built, BEFORE the ship-gate; `backend-integrity.json`
      persisted on success and on throw.
- [ ] `<eval-root>/lib/scorecard-integration.ts` (or `scorecard-integration.ts`)
      exports `buildScorecardAgentProfile(model)` (id excluded from hash,
      skills/tools sorted) + `recordScorecardAndDiff` calling
      `recordRunsToScorecard` / `loadScorecard` / `diffScorecard`.
      `.scorecard.jsonl` is committed.
- [ ] `<eval-root>/agent-profile-cell.ts` exports
      `build<Agent>AgentProfileCell({ harnessVersion, model, promptHash, backend, personaSuite })`
      and stamps every `RunRecord.agentProfile` before scorecard append.
- [ ] `src/lib/.server/production-loop/` (or `<eval-root>/lib/production-loop.ts`)
      calls `runProductionLoop` with `holdoutScenarios` + `gate` +
      `httpGithubClient`-backed `ship`. Loop owns a single
      `prompt-addendum.ts`; static skills are out of scope.
- [ ] CLI flag `--fail-on-regression` (or `EVAL_FAIL_ON_REGRESSION=1`) wired
      through the canonical runner.
- [ ] `.github/workflows/nightly-eval.yml` daily at 02:00 UTC on
      `[self-hosted, staging-runner]`; uploads `<runDir>/` artifact;
      `concurrency.cancel-in-progress: false`; `permissions:` includes
      `contents: write`, `issues: write`, `pull-requests: write`.
- [ ] `.github/workflows/production-loop.yml` weekly; required secrets
      documented; supports `--dry-run` workflow_dispatch input.
- [ ] `package.json` script `eval:improve` runs the analyst loop;
      `eval:production-loop` runs the held-out promotion cycle.
- [ ] `src/lib/.server/sandbox/` exports `composeProductionAgentProfile`
      (or equivalent); eval canonical runner imports it instead of
      hand-rolling its own profile.
- [ ] `eval/profile-parity.test.ts` (or equivalent) asserts the eval
      profile mounts the delegation MCP server and matches production's
      prompt / permissions / file-mount shape.
- [ ] When mounting the MCP delegation tools: `buildDelegationMcpServer`
      composes at runtime with a non-empty `TANGLE_API_KEY` and is
      merged into `profile.mcp` per turn — never declared statically.
- [ ] The eval's backend understands `profile.mcp`. If using
      `createOpenAICompatibleBackend`, the rubric does NOT score on
      tool-call presence (that transport has no `tools` field). Score
      tool calls only when the backend rides the sandbox SDK.
- [ ] When `runLoop` is in use, `ctx.traceEmitter` forwards to the same
      OTLP sink as the chat path so loop telemetry is queryable
      alongside chat turns.
- [ ] Harness surfaces `backend_error` runtime events on `result.error`
      — a 402 / 401 / 5xx does NOT become a silent `toolCalls: []`
      scenario result.

Canonical scaffold delivery: `agent-builder#198`. Reference impls to mirror
file-for-file: `creative-agent`, `tax-agent`, `legal-agent`, `gtm-agent`.

# Key docs

- `@tangle-network/agent-eval@0.36.x` README
- `@tangle-network/agent-eval/docs/wire-protocol.md`
- `@tangle-network/agent-eval/matrix` — `runAgentMatrix` (runner lands
  next minor), `MatrixScenario`, `MatrixAxes`, axis extractors
- `@tangle-network/agent-runtime@0.21.x/loops` — `runLoop`,
  `createRefineDriver`, `createFanoutVoteDriver`, `Driver` /
  `OutputAdapter` / `Validator` interfaces
- `@tangle-network/agent-runtime/profiles` — `coderProfile`,
  `createCoderValidator`, `multiHarnessCoderFanout`
- `@tangle-network/agent-runtime/mcp` — `createMcpServer`,
  `createDefaultCoderDelegate`, `createSiblingSandboxExecutor`,
  `createFleetWorkspaceExecutor`; bin `agent-runtime-mcp`
- `@tangle-network/agent-runtime/agent` — `defineAgent`,
  `createSurface*Adapter`, `createProductionTraceSink`
- `@tangle-network/agent-knowledge@1.4.x` — `proposeFromFindings`,
  `applyKnowledgeWriteBlocks`, optional `multiHarnessResearcherFanout`
