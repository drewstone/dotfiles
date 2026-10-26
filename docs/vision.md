# Vision: one owner per concept

Drew, 2026-10-26: "its important to know EXACTLY where things SHOULD BE so we can remove it and ensure its reused from the lower level shared primitives and contracts or added to those lower level primitive libraries and IMPROVED".

Tangle is a small set of primitive libraries with products built on them.
Each shared concept is implemented once, in its owner. Everything else imports it.

## The rule

- The owner is the lowest library that every consumer of the concept can depend on.
- To use a concept, import its owner.
- If the owner lacks what you need, add it to the owner and improve it there. Then publish, adopt it in the consumer, and delete the local copy, in that order.
- Consolidation removes copies, never capabilities. Every feature, backend, runtime (Docker and Firecracker), page, alarm and developer tool keeps working through the one implementation.
- Dependencies point down the layers below and never up.
- Exception: a helper of a few lines can stay local when importing its owner would pull a heavy dependency into a leaf. For example, tangle-router keeps its own percentile instead of importing agent-eval.

## Layers

```
products        Sandbox, Platform, Intelligence, agent apps (gtm, legal, tax, creative), Braid, Discovery
                  │ build on
app kit         agent-app ─────────────── UI: brand ─► components ─► charts
                  │
SDKs/services   sandbox SDK · agent-integrations · agent-gateway · sign-in-with-tangle · agent-provider-*
                  │
engine          agent-runtime  (run loops, graphs, flows, durable sessions, supervisors)
                  │
core            agent-core · harness-sessions · agent-eval · agent-knowledge · traces
                  │
contracts       agent-interface · agent-trace-contract · runtime-contracts
```

## Owners

The copies column lists known copies still to fold into the owner. Remove an entry in the same PR that deletes that copy.

### Contracts

| Concept | Owner | Copies to fold in |
|---|---|---|
| Agent configuration, harness IDs, model-to-harness support, reasoning-effort values | `@tangle-network/agent-interface` (agent-sdk `packages/agent-interface`; effort table `nativeReasoningControl` in `src/harness-capabilities.ts`) | agent-container `packages/sdk-provider-cli-base/src/reasoning-effort.ts`; agent-runtime effort maps. Version: one pnpm `catalog:` entry per repo, not one range per package |
| Trace span shape, gen_ai attributes, OTLP encode and decode | `@tangle-network/agent-trace-contract` (agent-sdk), OTLP in an `./otlp` subpath | agent-runtime `src/otel-export.ts`; agent-container `products/sandbox/sdk/src/trace-exporter.ts` and `products/intelligence/api/src/lib/otlp-codec.ts`; tangle-router's OTLP encoder |
| Sandbox API and orchestrator wire schemas | agent-container `packages/runtime-contracts` | `products/sandbox/api/src/routes/sandbox-*-schema.ts`, which restate `apps/orchestrator/src/routes/projects/*` schemas |

### Core

| Concept | Owner | Copies to fold in |
|---|---|---|
| SSE parsing and encoding, transports, auth, resilience | `@tangle-network/agent-core` (`./sse`) | agent-container `packages/sse-core` |
| Token usage and cost normalization | `@tangle-network/agent-core` (`./telemetry`, `readTokenUsage`) | agent-core's own `StreamUsageExtractor` in `./sse`; tangle-router usage readers; agent-container `packages/sdk-telemetry` metering |
| Native harness session files | `@tangle-network/harness-sessions` (agent-sdk) | agent-runtime `src/runtime/codex-rollout-store.ts`, `src/mcp/codex-token-usage.ts`, `src/runtime/harness-usage.ts`; agent-eval per-harness projections |
| Launching a harness CLI and parsing its live stream | see [open decisions](#open-decisions) | agent-container `packages/sdk-provider-*`, `sdk-provider-cli-base`, `sdk-cli-runner`; drewstone/cli-bridge `src/backends`; agent-runtime's local harness launcher; the duplicate claude-code and amp stream-json mappers |
| Environment providers | agent-sdk `agent-provider-*`, checked by `agent-provider-testkit` | |
| Evals, judges, baselines, optimizers, statistics | `@tangle-network/agent-eval` (statistics in `src/statistics`) | agent-container `packages/shared/src/distribution-stats.ts` and `products/sandbox/evals/src/benchmark-summary-stats.ts`; private `mean()` copies inside agent-eval |
| Secret and PII redaction | `@tangle-network/agent-eval` (`src/trace/redact.ts`, `src/trace/redaction/detectors.ts`), published as a leaf `./redaction` subpath | agent-container `packages/shared/src/privacy.ts`; agent-eval's second list in `scrub.ts` |
| Trace analysis for users | `@tangle-network/traces` | |
| Memory, knowledge bases, retrieval | `@tangle-network/agent-knowledge` | |

### Engine

| Concept | Owner | Copies to fold in |
|---|---|---|
| Running agents: loops, graphs and flows, durable sessions, supervisors, task queue, placement | `@tangle-network/agent-runtime` | `@tangle-network/tcloud-agent`'s run loop; the platform workflow product's flow cursor `products/platform/api/src/lib/workflow-graph.ts`, which becomes a pure `./flow` cursor in agent-runtime that both runGraph and the workflow product drive. The workflow product keeps its YAML, non-agent actions and durable parks |

### SDKs, services and the app kit

| Concept | Owner | Copies to fold in |
|---|---|---|
| Sandbox client | `@tangle-network/sandbox` (agent-container `products/sandbox/sdk`) | |
| Integrations, connectors, OAuth, webhooks, triggers, idempotency | `@tangle-network/agent-integrations` | |
| Paid API middleware (x402, MPP, API keys) | `@tangle-network/agent-gateway` | |
| Sign in with Tangle | agent-container `packages/sign-in-with-tangle` | |
| Agent app server modules: auth, operator, chat turns, billing, catalog, email, OAuth, eval campaigns, signoff | `@tangle-network/agent-app` | the app server families inside gtm, legal, tax and creative |

### Sandbox platform internals (agent-container)

| Concept | Owner | Copies to fold in |
|---|---|---|
| Container runtimes, Docker and Firecracker | `apps/host-agent`, reached through the orchestrator's host-agent driver. Local development, on-prem Docker and single-box Firecracker run host-agent; the Tangle chain driver stays separate | `apps/orchestrator/src/driver/docker*.ts`, `apps/orchestrator/src/driver/firecracker/` |
| Sandbox API state | the D1/Worker engine; on-prem runs the same Worker bundle under workerd | the Redis/Node engine: `products/sandbox/api/src/lib/redis.ts`, `services/redis-*`, and the Redis classes inside mixed service files |
| Plan entitlements | Platform `products/platform/api/src/lib/plan-tiers.ts` and the PlanDefinition catalog in `routes/plans.ts`; Sandbox reads them through its one `SubscriptionService` | the second plan cache in `products/sandbox/api/src/middleware/auth-platform-state.ts`; Sandbox's own plan-limit table |
| Sandbox create transaction | one staged create in `products/sandbox/api` | the separate commit paths in `routes/sandbox-create-flow.ts` and `routes/sandbox-create-instant.ts` |
| Settled native-session archive format | the sidecar's `apps/sidecar/src/agents/native-session-copy.ts`, extracted into one package | `apps/orchestrator/src/services/parked-native-session-export.ts` and its directory |
| Delegated keys (Hub key, managed model key) | one delegated-key module in the orchestrator | `apps/orchestrator/src/orchestrator/managed-model-key-refresh.ts` and `hub-credential-refresh.ts` |
| Deploy, fleet rollout, alarms, break-glass ops jobs | `services/devtools` (`tangle-dev ship`, `tangle-dev ops`). Workflows only trigger it, the `infra-alert` action owns the alarm lifecycle, and `scripts/lib/production-release-github-api.mjs` is the one GitHub client | bash in `.github/actions/update-host-agents/action.yml`; page and clear logic in each alarm workflow; the client in `scripts/dispatch-and-wait-workflow.mjs`; inline bash in `platform-ops-diagnose.yml`, `warm-surge.yml` and `autoscale-ghost-purge.yml`; the ops alarms in `products/sandbox/evals/src/*-alarm.ts` |
| Sandbox benchmarks | `products/sandbox/evals`: records, then one run scorecard, then renderers. Cells live in `src/benchmark-cell.ts` and lanes in `presets.ts`; runtimes come from each orchestrator's live host inventory | Docker pins in `src/create-matrix-composition.ts`; the lane list in `src/dashboard/full-scorecard.ts`; the Slack summary's separate model; the Slack post in `src/bench-progress.ts` |

### UI

| Concept | Owner | Copies to fold in |
|---|---|---|
| Design tokens, fonts, logo, Tailwind theme | `@tangle-network/brand` | |
| React components | see [open decisions](#open-decisions) | `@tangle-network/ui` (brand `packages/ui`) and `@tangle-network/sandbox-ui` |
| Charts | `@tangle-network/charts` (charts repo) | brand `packages/charts`, which carries the same package name but is not what npm publishes |
| Blueprint dapp UI: wallet, iframe | `@tangle-network/blueprint-ui` | |

## Open decisions

1. **Harness launch.** Every harness gets one descriptor, held as data: command, argv slots, env and output format. Those descriptors join agent-interface's harness capabilities. One process driver, built from `sdk-provider-cli-base`, moves into agent-sdk so the sidecar, cli-bridge and agent-runtime can all depend on it. Drew names the package.
2. **React components.** `@tangle-network/ui` and `@tangle-network/sandbox-ui` are both published and both cover primitives, chat, run, files and editor. Measure their overlap, pick one owner, and fold the other into it.
3. **To verify.** Check tcloud's Sandbox and Router clients against `@tangle-network/sandbox`, `microvm-runtime` against agent-container `packages/firecracker-runtime`, and tangle-engine against the TypeScript platform.

## Keeping this current

- This file is the only list of owners. Docs, skills, memories and lane briefs link here and don't restate it.
- Change a row in the same PR that moves a concept, adds an owner or deletes a copy.
- Before a sweep or a consolidation proposal, read this file and the newest sweep (`qmd search -c reviews 'consolidation sweep'`). Measure only what neither covers.
- Line counts, versions and dates live in census, npm and git, never here.
