---
name: agent-eval
description: Trace-first evaluation framework for code-generator + LLM-in-the-loop systems. AgentProfile + scorecard substrate, runEvalCampaign with capture-integrity by construction, assertRealBackend (Phase A guard), HeldOutGate, runProductionLoop, AnalystRegistry, sandbox-harness + multi-layer verifier, propose-review loop, RL bridge. Directives below encode shipped-bug lessons — read before writing integration code.
---

# agent-eval — usage directives

You are writing code that **extends** `@tangle-network/agent-eval` or builds on its primitives — a new analyst, a campaign wrapper, a custom verifier layer, a downstream RL bridge, an eval-driven release gate. This file is the operational substrate manual. Every rule below was paid for in a shipped bug; skip one and the bug class reappears.

If you are only **adopting** agent-eval in a product (chat handler + an eval harness + a release gate), use `/agent-eval-adoption` instead. That skill covers the product-side integration shape. This skill is for code that imports the framework's internals.

---

## Vocabulary

| Term | Plain English |
|---|---|
| **AgentProfile** | The eval harness's unit of variation. Pins model + skills + promptVersion + tools. `agentProfileHash` is its behaviour identity. |
| **Scorecard cell** | `(scenarioId, profileHash)`. The thing you compare across commits. |
| **RunRecord** | The typed schema every campaign emits. Snapshot-pinned model, costed, hashed prompt/config, captured tokens. |
| **Sink** | `RawProviderSink` — first-class HTTP-level capture alongside `LlmSpan`. NDJSON, auto-redacted. |
| **TraceStore** | Append-only span log. `FileSystemTraceStore` for runs; `OtlpFileTraceStore` for consuming production OTLP exports. |
| **Layer** | One stage of `MultiLayerVerifier` (install / typecheck / build / semantic / …). |
| **Cell join** | `buildSandboxAgentProfileCell` cross-products manifests × harnesses × scenarios with a canonical identity. |
| **L0 / L1 / L2** | Builder session / app-build / app-runtime trace layers. |
| **Backend integrity** | `assertRealBackend` — distinguishes "agent failed" from "eval ran blind against a stub." |
| **Capture integrity** | The four directives that turn a run into a launch-grade artifact. `runEvalCampaign` wires them by construction. |

---

## Substrate primitives — reference card

Categorised index of the public exports an integrator reaches for. File paths are `src/`-relative inside `@tangle-network/agent-eval`.

### Identity + scoring substrate (the 0.34 spine)

| Primitive | Module | Purpose |
|---|---|---|
| `AgentProfile`, `agentProfileHash` | `agent-profile.ts` | The unit of variation. `id` is human-facing and **not** part of the hash; `skills`/`tools` are order-insensitive; throws if `model` is empty. Two profiles with the same model but different skills hash differently. |
| `recordRuns`, `recordRunsToScorecard`, `appendScorecard`, `loadScorecard` | `scorecard.ts` | Append-only JSONL keyed `(scenarioId, profileHash)`. One line per cell per commit. Concurrent-append-safe (no read-modify-write). Malformed lines are skipped on read. |
| `diffScorecard`, `formatScorecardDiff` | `scorecard.ts` | Latest-vs-prior cell comparison. Verdicts: `improved` / `regressed` / `flat` / `new`. Cohen's d + Welch's t-test gate when ≥ 2 scores per side; raw-delta fallback otherwise. Returns NaN p-value when variance is zero — guard your consumer. |
| `AGENT_PROFILE_KINDS`, `toAgentProfileJson`, `buildSandboxAgentProfileCell`, `requireAgentProfileCell`, `assertRunAgentProfileCell`, `verifyAgentProfileCell`, `groupRunsByAgentProfileCell`, `AgentProfileCellValidationError` | `agent-profile-cell.ts` | Cross-product cell-join canonicalisation. Stamps a profile-cell onto a run; `RunRecord` carries the canonical cell identity. Distinct from the scorecard log — the scorecard records timelines, cells stamp identity onto runs. They coexist. |
| `RunRecord`, `validateRunRecord` | `run-record.ts` | Typed run schema. Throws on missing fields **and** on bare model aliases — record the dated snapshot (`claude-sonnet-4-6@2025-04-15`). |
| `summarizeBackendIntegrity`, `assertRealBackend`, `BackendIntegrityError`, `BackendIntegrityReport` | `integrity/backend-integrity.ts` | The Phase A guard. Stub-mode = `tokenUsage.input === 0 && .output === 0` across **all** records → throws. Verdict `'mixed'` (partial backend failure) passes by default; reject with `{ allowMixed: false }` for CI gates. |

### Campaign + release substrate

| Primitive | Module | Purpose |
|---|---|---|
| `runEvalCampaign` | `eval-campaign.ts` | Opinionated matrix runner: variants × scenarios × seeds → `RunRecord[]` + integrity reports + (optional) `researchReport`. Wires `assertLlmRoute` at preflight, builds `TraceStore` + `RawProviderSink` per cell, asserts `assertRunCaptured` after every `endRun`, optionally fires `onRunComplete` hooks. This is the entry point for new evals. |
| `HeldOutGate` | `held-out-gate.ts` | Paired-delta + overfit-gap promotion gate. Three rejection codes: `few_runs` / `negative_delta` / `overfit_gap`. Pairs by `(experimentId, seed)`; reads `splitTag === 'holdout'` for the paired delta and the search-split for the overfit gap. |
| `bootstrapCi`, `judgeReplayGate` | `promotion-gate.ts` | Lower-level "is this real" gate — bootstrap CI for paired deltas. Use alongside `HeldOutGate`, not instead. |
| `runProductionLoop` | `production-loop.ts` | The auto-PR cycle: cluster production failures → evolve on the cluster → gate the candidate → render PR body. Decision types: ship / hold / equivalent / reject / needs_more_data. |
| `proposeAutomatedPullRequest`, `httpGithubClient`, `ghCliClient` | `auto-pr.ts` | The GitHub client contract for the production loop. `httpGithubClient` for the in-process call; `ghCliClient` when shelling out is preferred. |
| `pairedEvalueSequence`, `evaluateInterimReleaseConfidence` | `sequential.ts` | Anytime-valid sequential evaluation (Waudby-Smith & Ramdas 2024 + Howard et al. 2021). Decide at every interim look without inflating type-I error. |
| `researchReport`, `summaryTable`, `paretoChart`, `gainHistogram` | `summary-report.ts` | Launch-grade artifacts. `researchReport` is async (Web Crypto for the fingerprint). `minPairs` hard floor is `RESEARCH_REPORT_HARD_PAIR_FLOOR = 6`. |

### Capture-integrity substrate

| Primitive | Module | Purpose |
|---|---|---|
| `RawProviderSink`, `FileSystemRawProviderSink`, `InMemoryRawProviderSink`, `NoopRawProviderSink` | `trace/raw-provider-sink.ts` | First-class HTTP capture. Default redactor strips `Authorization` / `X-Api-Key` / `Cookie` / credential-shaped body fields. `FileSystemRawProviderSink` rolls at 32 MiB. **Every eval run wires this.** |
| `assertLlmRoute`, `LlmRouteAssertionError` | `llm-client.ts` | Preflight route guard. Throws on missing baseUrl, blocked URL, missing auth, wrong provider. Pure function — call from constructors / CI gates. Codes: `no_explicit_base_url` / `base_url_blocked` / `base_url_not_allowed` / `no_auth` / `wrong_provider`. |
| `assertRunCaptured`, `throwIfRunIncomplete` | `trace/integrity.ts` | End-of-run completion check. `requireRawCoverageOfLlmSpans: true` catches the highest-stakes silent failure — `LlmSpan` emitted but raw HTTP went to a different sink. Issue codes: `no_run` / `missing_llm_spans` / `missing_judge_spans` / `missing_raw_events` / `no_raw_sink` / `orphan_llm_span` / `missing_outcome`. |
| `TraceEmitter`, `onRunComplete` hooks, `traceAnalystOnRunComplete` | `trace/emitter.ts`, `trace-analyst/hook.ts` | Declarative auto-orchestration after `endRun` / `abortRun`. Hook errors swallowed and logged by default — set `hookErrors: 'throw'` for tests or for load-bearing hooks. |
| `ReplayCache`, `createReplayFetch`, `iterateRawCalls` | `replay.ts` | Turn a populated `RawProviderSink` into a `(canonical request → cached response)` cache. `onMiss: 'fail-closed'` for determinism audits. Zero LLM cost for re-judging. |
| `LlmClient`, `callLlm`, `callLlmJson`, `withJudgeRetry` | `llm-client.ts`, `judge-retry.ts` | Retry + backoff + JSON degrade + fence-strip. Unified retry classifier across client + judge after PR #74. |

### Analyst substrate (model-agnostic trace analysis)

| Primitive | Module | Purpose |
|---|---|---|
| `AnalystRegistry`, `AnalystHooks`, `BudgetPolicy` | `analyst/registry.ts` | One envelope, N analysts, one run. Owns registration / routing / isolation. One analyst's exception cannot stop the others. Cross-cutting concerns (telemetry, error→finding, cost) live in `AnalystHooks`. `runStream` exposes the async event stream (PR #59). |
| `createTraceAnalystKind`, `renderPriorFindings` | `analyst/kind-factory.ts` | Kind factory: declarative analyst with structured `ax` output. Cross-run `priorFindings` rendering is built in (PR #58). |
| `FindingSubject`, `parseFindingSubject` | `analyst/finding-subject.ts` | Typed grammar for *where* a finding lands. Zod boundary + structured output (PR #61). Downstream consumers (agent-runtime) route subjects to file paths via the agent's `surfaces` map. |
| `AnalystFinding`, `computeFindingId`, `makeFinding` | `analyst/types.ts` | The finding envelope. `findingId` is content-addressed; same finding from two runs collapses to one row. |
| `FindingsStore`, `diffFindings`, `defaultIsMaterial` | `analyst/findings-store.ts` | Persistence + cross-run diff. Drives "what's new since last campaign." |
| `OtlpFileTraceStore`, `analyzeTraces` | `trace-analyst/store-otlp.ts`, `trace-analyst/analyst.ts` | The production-trace consumption path. Reads OTLP JSON files emitted by an agent's production handler; analysts query through the same `TraceAnalysisStore` interface as eval-side runs. |
| `MultiLayerVerifier`, `RunCritic`, `SemanticConceptJudge`, `JudgeFn` | `multi-layer-verifier.ts`, `run-critic.ts`, `semantic-concept-judge.ts` | The four analyst kinds the registry can host. Each implements `analyze(ctx) → AnalystFinding[]`. |

### Builder + verifier substrate

| Primitive | Module | Purpose |
|---|---|---|
| `BuilderSession`, `SubprocessSandboxDriver` | `driver.ts` + builder modules | Three-layer trace emitter: `builder` (L0) → `app-build` (L1, gated by `ship()`) → `app-runtime` (L2, only after L1 passes). `cwd` belongs in `HarnessConfig`, not the driver constructor — see Footgun 1. |
| `MultiLayerVerifier`, `multiToolchainLayer`, `mergeLayerResults` | `multi-layer-verifier.ts`, `multi-toolchain-layer.ts` | N-layer pipeline with dependency skip, per-layer severity findings, soft-fail, weighted `blendedScore`. `multiToolchainLayer` fans across N adapters in parallel and merges results. |
| `runSemanticConceptJudge`, `gradeSemanticStatus` | `semantic-concept-judge.ts` | LLM judge for "did the artifact implement the asked-for concepts?" Pair with a deterministic build gate — see Footgun 3. |
| `runKeywordCoverageJudge` | (in barrel) | Deterministic counterpart — zero cost, catches the dumb misses. |
| `runAssertions`, `fileExists`, `fileContains` | (in barrel) | Structural assertions over `WorkspaceSnapshot`. `fileExists` reads both `files` and `blobs`; `fileContains` only reads `files` — see Footgun 4. |
| `extractErrorCount`, `ERROR_COUNT_PATTERNS` | `error-count-extractor.ts` | Cross-toolchain error counter (tsc / pytest / rustc / go / eslint). |
| `localCommandRunner`, `CommandRunner` | `command-runner.ts` | Abstracted subprocess surface. Swap for a sandbox runner in tests or in-container prod — layer code doesn't change. |

### Statistics consolidation (PR #73)

`src/statistics.ts` is the single home for: `pairedBootstrap`, `pairedTTest`, `wilcoxonSignedRank`, `mannWhitneyU`, `cohensD`, `welchsTTest`, `requiredSampleSize`, `pairedMde`, `bonferroni`, `benjaminiHochberg`, `confidenceInterval`, `weightedMean`, `partialCredit`, `interRaterReliability`, `corpusInterRaterAgreement`. Do not re-import from `paired-stats.ts` or `power-analysis.ts` — they re-export through `statistics.ts` now.

`pairedBootstrap` defaults its RNG to `Math.random()` — **always pass `seed`** when the result feeds a CI / promotion decision.

### RL bridge — at `/rl` subpath BY DESIGN

`@tangle-network/agent-eval/rl`:

`trialsToRunRecords`, `extractVerifiableReward`, `filterDeterministicallyRewarded`, `extractPreferences`, `inverseProbabilityWeighting`, `selfNormalizedImportanceWeighting`, `doublyRobust`, `offPolicyEstimateAll`, `extractStepRewards`, `prmTrainingPairs`, `runContaminationProbe`, `fitBradleyTerry`, `applyEloUpdate`, `buildPairwiseFromCampaign`, `adversarialScenarioSearch`, `runComputeCurve`, `bestOfN`, `selfConsistency`, `paretoFrontier`.

**Do not move these to the root barrel.** The subpath is the contract — RL consumers depend on it for tree-shaking and to opt in to the larger surface explicitly. Reach for the campaign primitive at root first; the RL bridge consumes its `RunRecord[]` output.

### Reporting subpath

`@tangle-network/agent-eval/reporting`:

`researchReport`, `summaryTable`, `paretoChart`, `gainHistogram`, `evaluateInterimReleaseConfidence`, `rubricPredictiveValidity`.

### Traces subpath

`@tangle-network/agent-eval/traces`:

`ReplayCache`, `createReplayFetch`, `iterateRawCalls`, `traceAnalystOnRunComplete`, `FileSystemTraceStore`, `InMemoryTraceStore`, `OtlpFileTraceStore`, raw-sink types.

---

## Bug-class directives — read before writing integration code

Each one is paid for. The framework's job is to make these structural; consumers wire them.

### Directive A — backend integrity comes before every other assertion

```ts
import { assertRealBackend, runEvalCampaign } from '@tangle-network/agent-eval'

const { runs } = await runEvalCampaign({ /* ... */ })

// Before any score aggregation, paired stats, gate decision, or scorecard write:
assertRealBackend(runs, { allowMixed: false })  // CI gate — reject mixed verdict too
```

**Why**: a backend can return `RunRecord[]` with `passed === false` for every record and look exactly like "agent collapsed." The Phase A insight: `tokenUsage.input === 0 && .output === 0` across **all** records means the LLM was never called — sandbox bridge down, auth misconfigured, stub model returning hard-coded strings. Without `assertRealBackend` you cannot distinguish "we measured a real failure" from "we measured nothing." Every downstream signal — scorecard diff, paired bootstrap, held-out gate, research report — silently corrupts on stub data.

The default `assertRealBackend(runs)` passes `'mixed'` (some records real, some stub — typically a 429 cascade mid-run). For CI gates pass `{ allowMixed: false }` to also reject partial backend failure.

`runEvalCampaign` does **not** call `assertRealBackend` for you — it's a post-aggregation guard the caller owns. Wire it on the returned `runs` before doing anything else with them.

### Directive B — capture integrity is wired by construction, not by remembering

Every eval run needs four things: `RawProviderSink`, `assertLlmRoute` at preflight, `assertRunCaptured` at run-end, and (optional but advised) `traceAnalystOnRunComplete` as an emitter hook. **`runEvalCampaign` wires all four.** When you reach past it (a propose-review loop, a hand-rolled matrix runner, a `BuilderSession`-driven sweep), wire them yourself — same four:

```ts
const sink = new FileSystemRawProviderSink({ dir: `${workDir}/raw-events` })
assertLlmRoute(llmOpts, { requireExplicitBaseUrl: true, allowedBaseUrls, requireAuth: true })

const emitter = new TraceEmitter(store, {
  onRunComplete: [traceAnalystOnRunComplete({ analyze: analystOpts, save: writeAnalysis })],
})
await emitter.startRun({ scenarioId, layer: 'app-runtime' })
// LLM calls flow through callLlm with { rawSink: sink, traceContext: { runId, spanId } }
await emitter.endRun({ pass, score })

const integrity = await assertRunCaptured(store, emitter.runId, {
  llmSpansMin: 1, rawSink: sink, requireRawCoverageOfLlmSpans: true, requireOutcome: true,
})
throwIfRunIncomplete(integrity)
```

Structured `LlmSpan` records intent. The raw HTTP body is ground truth. A proxy can echo a different `model` than answered; token counts can lie. `requireRawCoverageOfLlmSpans` catches the case where the span was emitted but the raw HTTP capture went to a different sink — the most expensive silent failure in the eval pipeline.

### Directive C — pin model snapshots; never aliases

`validateRunRecord` rejects bare aliases like `claude-sonnet-4-6`. Record the dated snapshot (`claude-sonnet-4-6@2025-04-15`). Aliases re-map silently; a bare-alias row cannot be re-evaluated. `costUsd` is mandatory; if you don't have it, record `0` and set `outcome.raw.cost_unknown = 1`. Don't drop the field — the validator throws.

### Directive D — scorecard testing needs per-seed variance

`diffScorecard` uses `welchsTTest` which returns NaN when both sides have zero variance. A scorecard test that records `[0.5, 0.5, 0.5]` on both sides produces a NaN p-value and the verdict falls through to `'flat'` regardless of the raw delta. **Tests must seed the cell with realistic per-seed scores** (`[0.4, 0.5, 0.6]` vs `[0.5, 0.6, 0.7]`) or the assertion is meaningless. The `canStat` branch needs `length >= 2 && variance > 0` on both sides.

### Directive E — `--fail-on-regression` is opt-in by design

A flat baseline should not block CI. `diffScorecard`'s verdict can be `'new'` for cells with no prior — that's not a regression, it's a first observation. Consumers writing a CI gate over the scorecard diff filter to `verdict === 'regressed'` explicitly; don't fail on `delta < 0` alone (it could be flat-but-noisy) and don't fail on `'new'` (it has no baseline). Read `diff.summary.regressed > 0` as the gate condition.

### Directive F — profile-cell stamping ≠ scorecard log

`buildSandboxAgentProfileCell` + `assertRunAgentProfileCell` stamp the canonical cell identity **onto** a `RunRecord`. `recordRunsToScorecard` appends a **timeline entry** keyed by that identity. They coexist:

- Cell stamping enforces "every run knows which cell it belongs to" (no orphan rows).
- Scorecard logging is the cross-commit timeline that answers "did this commit move this cell?"

Both flows need the same `agentProfileHash`. If you stamp one cell on a run but log under a different profile, the cell is unrelatable. Use `agentProfileHash(profile)` as the single source of identity and pass the same `profile` to both surfaces.

### Directive G — scorecard appends are concurrent-safe; reads tolerate corruption

`appendScorecard` never reads-modifies-writes. Concurrent campaign runs can append without locking. `loadScorecard` skips malformed lines silently — a partially-written line during a crash does not break the read. **Do not** add a "read-then-rewrite-deduplicated" path; you reintroduce the corruption window the append-only design closed.

### Directive H — `HeldOutGate` reads `splitTag`; mistagging corrupts the verdict

`HeldOutGate` pairs by `(experimentId, seed)` and reads `outcome.splitTag === 'holdout'` for the paired delta, search-split for the overfit gap. A candidate run with no matching baseline seed is dropped. If productive-run counts look low at the gate, your seeds are misaligned, not the gate.

### Directive I — `Researcher` is an interface, not an implementation

`NoopResearcher` is the placeholder. Real brains live downstream (agent-runtime, blueprint-agent, …). Keeping this stub-only is what keeps the contract stable across consumers. Don't add a default LLM-backed researcher to `agent-eval`.

---

## Patterns to follow

### Pattern 1 — Campaign + scorecard + assertRealBackend (the canonical loop)

```ts
import {
  runEvalCampaign, recordRunsToScorecard, loadScorecard, diffScorecard,
  formatScorecardDiff, assertRealBackend,
} from '@tangle-network/agent-eval'

const profile = { id: 'sonnet-baseline', model: 'claude-sonnet-4-6@2025-04-15', skills: [...], promptVersion: 'v3' }

const { runs, integrityReports, report } = await runEvalCampaign({
  campaignId: 'gtm-2026-q2',
  commitSha: process.env.GIT_SHA!,
  variants: [{ id: 'baseline', payload: { profile } }],
  scenarios, seeds: [0, 1, 2, 3, 4],
  llmOpts, storeFactory: ({ runId }) => new FileSystemTraceStore({ root: `${WORK}/trace/${runId}` }),
  workDir: WORK,
  runner: async (ctx) => { /* ... emit run, return RunRecord shape ... */ },
})

assertRealBackend(runs, { allowMixed: false })       // Phase A guard — before anything else

recordRunsToScorecard(`${WORK}/scorecard.jsonl`, runs, { profile, commitSha: process.env.GIT_SHA! })

const diff = diffScorecard(loadScorecard(`${WORK}/scorecard.jsonl`))
console.log(formatScorecardDiff(diff))
if (diff.summary.regressed > 0) process.exit(1)
```

### Pattern 2 — Production loop with httpGithubClient

```ts
import { runProductionLoop, httpGithubClient } from '@tangle-network/agent-eval'

await runProductionLoop({
  productionRuns: await loadProductionRuns(),
  scenarios,
  failureCluster: { /* clustering knobs */ },
  evolve: { /* runPromptEvolution opts */ },
  ship: {
    gate: heldOutGateConfig,
    client: httpGithubClient({ owner: 'tangle-network', repo: 'gtm-agent', token: process.env.GH_TOKEN! }),
    render: (ctx) => ({ title: '...', body: '...', branch: '...', baseBranch: 'main' }),
  },
})
```

### Pattern 3 — Custom analyst kind

```ts
import { AnalystRegistry, createTraceAnalystKind, OtlpFileTraceStore } from '@tangle-network/agent-eval'

const myKind = createTraceAnalystKind({
  id: 'gtm-message-quality',
  inputKind: 'trace',
  description: 'Score outbound messages on hook strength + concrete-ask presence',
  schema: z.object({ /* findings shape */ }),
  prompt: ({ trace, priorFindings }) => buildPrompt(trace, renderPriorFindings(priorFindings)),
})

const registry = new AnalystRegistry({ chat, hooks: { onAfterAnalyze, onError } })
registry.register(myKind)

const result = await registry.run({
  inputs: { trace: traceStore.getRun(runId), priorFindings: await store.recent(runId, 7) },
  runId,
})
```

### Pattern 4 — Surface adapters from agent-runtime

The framework ships the **eval-side** analyst contract. The **product-side** adapter that takes findings and routes them to file paths lives in `@tangle-network/agent-runtime`:

- `createSurfaceImprovementAdapter` — routes a parsed `FindingSubject` to a real on-disk path via the agent's `AgentSurfaces` map. Modes: `none` / `edit` / `open-pr` (the last requires `ghRepo`, falls back loudly if missing).
- `createSurfaceKnowledgeAdapter` — writes knowledge-page blocks against the agent's `.agent-knowledge` root.
- `runAnalystLoop` (in agent-runtime) is what closes the eval → improvement → re-eval cycle; it consumes `AnalystRegistry.runStream`.

Do not re-implement these in agent-eval. The eval framework owns measurement; the runtime owns the apply-side.

---

## Anti-patterns — things-not-to-build

### Anti-pattern 1 — Don't recreate platform durability

The sandbox-SDK owns per-session event buffering, replay with `Last-Event-ID`, idempotent dispatch by `sessionId`, and the browser-safe `SessionGatewayClient`. **Do not add to agent-eval**: Durable Object wrappers, KV ring buffers, hand-rolled SSE reconnect, custom `runDurableTurn` flows, per-product `reconnect` callbacks. The earlier `SandboxReconnectAdapter` indirection was deleted (agent-runtime 0.16) precisely because the SDK already does this. The lesson: **trust the platform's durability**. If a stream drops mid-eval, the SDK reconnects and replays — you do nothing.

### Anti-pattern 2 — Don't move RL primitives to the root barrel

`@tangle-network/agent-eval/rl` is a deliberate subpath. Consumers opt in to the larger surface; root-barrel imports tree-shake cleanly. Moving `extractPreferences` / `offPolicyEstimateAll` / `runComputeCurve` to root breaks both contracts.

### Anti-pattern 3 — Don't re-implement the gate

`HeldOutGate` is the production primitive. Inline "honesty override" / "minimum runs" / "paired delta on holdout" blocks reintroduce the rejection-code drift that the gate's three codes (`few_runs` / `negative_delta` / `overfit_gap`) close. Use the primitive; if it lacks something, extend it upstream.

### Anti-pattern 4 — Don't add silent fallbacks

External-boundary calls (LLM, network, FS, subprocess) return typed outcomes (`{ succeeded, value, error }` or throw a typed error). Callers inspect the outcome before using the value. No `?? defaultModel` on required fields; no `try/catch { return null }` that erases the diagnostic. Named, opted-in fallback rotations (`policy.fallbackModels: [...]`) are fine. Deep `?? 'kimi'` helpers are not.

### Anti-pattern 5 — Don't add a default `ReviewFn` to propose-review

`propose-review` ships the loop (propose + verify + review + memory); it intentionally **does not** ship a prebuilt reviewer. VerticalBench's `shot-reviewer.ts` is the design reference; it will land upstream with its design review. A premature default would freeze the contract before the right shape settled.

### Anti-pattern 6 — Don't fork the dispatch table

Per-language harness dispatch (`taxonomy.language → {setupCommand, testCommand, timeoutMs}`) exports from ONE module. Three copies have shipped; two fixes, one missed, one regression. Single source of truth.

### Anti-pattern 7 — Don't write a parallel test/eval/benchmark harness

The repo's existing test runner, eval suite, and dashboard are the ground truth. New tests go in the existing runner; new evals go in `runEvalCampaign`; new benchmarks feed the existing scorecard log. Never add `tests-2/`, never write `my-benchmark.sh` outside the CI graph, never emit metrics to a sink the observability pipeline doesn't consume.

---

## Footguns inherited from earlier directives

1. **`cwd` belongs in `HarnessConfig`**, not `new SubprocessSandboxDriver({cwd})`. The driver is stateless-per-call; constructor `cwd` is a fallback only. Per-call config wins.
2. **Build gate must fail loud.** Never `pnpm run validate || pnpm run build || true`. Three bugs shipped through a `|| true` gate.
3. **Pair meta-judge with build outcome.** `invokeMetaJudge` short-circuits on `buildOutcome.passed === false` — LLM judges rate code they can't run.
4. **`WorkspaceSnapshot.files` is UTF-8 text; binaries live in `blobs`.** `fileExists` reads both; `fileContains` only reads `files`.
5. **`HeldOutGate` pairs by `(experimentId, seed)`** and reads `splitTag`. Mistagging corrupts the verdict.
6. **`pairedBootstrap` defaults to `Math.random()`.** Pass `seed` for any CI/promotion decision.
7. **`runCanaries` returns a report; does not fail tests.** Wire it to a notification.
8. **`researchReport.minPairs` defaults to 20; hard floor 6.** Promotion calls under-powered are rejected, not soft-warned.
9. **`RawProviderSink` redaction is allowlist-of-strip, not allowlist-of-keep.** Non-standard auth headers (`X-Org-Token`) need a custom `redactor` extending `defaultProviderRedactor`.
10. **Hook errors are swallowed by default.** Set `hookErrors: 'throw'` for load-bearing hooks.

---

## Common bug classes (muffled-gate pattern)

Seven shapes; audit every gate:

1. **Fallback-to-pass**: `command || true`.
2. **Default-missing-to-permissive**: `options.kind ?? 'starter'`.
3. **Skip-counts-as-pass**: `if (p.skipped) return true`.
4. **Auto-match no-expectation**: `if (!expected) return true` in a matcher.
5. **Duplicate drift**: same dispatch in N files; fix to N−1, the Nth regresses silently.
6. **Unknown-case silent default**: `default: return noop` on a value that should never be unknown.
7. **Construct-vs-call dropped arg**: `new Driver({cwd})` when `cwd` lives on per-call config.

Common shape: something that should fail loud returns silent success. Fail closed; annotate the rare exception with `// muffle-ok: <reason>`.

---

## Extend, don't duplicate

Before adding machinery, search the substrate primitives table. If what you need isn't there, the PR that adds it to agent-eval is more valuable than a local copy that will drift. Two primitives are intentionally absent (tracked in `CHANGELOG.md`): a default `ReviewFn` for `propose-review`, and a toolchain-flavoured `mergeLayerResults` extension. Both land upstream when their design settles.
