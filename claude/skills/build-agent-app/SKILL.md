---
name: build-agent-app
description: "Adopt @tangle-network/agent-app — the shared application-shell framework for agent products — either greenfield (new product) or by migrating an existing app (from ANY stack). Starts with a discovery interview (product surface, agent surface, eval surface, features, sandbox-or-not, billing, integrations), then routes to the right module set + path. Covers the engine/shell/domain layering rule, per-module seams, sandbox AND non-sandbox (browser/edge copilot) wiring, the migration lift-loop, and anti-patterns. Use when standing up a new agent product, deciding what belongs in the app vs the framework, or porting an existing app onto agent-app."
---

# Adopt agent-app — build new or migrate, on the shared app shell

`@tangle-network/agent-app` is the application-**shell** framework for agent products. The substrate packages (`@tangle-network/{agent-eval, agent-runtime, agent-integrations, tcloud, sandbox}`) are the *engine*; agent-app is the opinionated assembly every product otherwise rebuilds: a structured agent→app tool side channel (human-in-the-loop approvals, dated follow-ups, generated UI, grounded citations), the bounded chat tool-loop, capability auth, model config, per-workspace billing, integration-hub wiring, field crypto, SSE normalization, an eval bridge, and self-service login. Products supply **domain** through typed seams.

## Step 0 — DISCOVER (always start here; do not write code until these are answered)

Interview the stakeholder (or read the existing app) for:

1. **Product surface** — what is it? back-office automation, a customer-facing chat product, an in-app copilot, a batch/workflow runner?
2. **Agent surface** — pick per surface (an app can have both):
   - **Sandboxed agent** — long-running, owns a container, file/tool access, delegated work. Uses the sandbox profile + per-turn MCP servers.
   - **Browser / edge copilot** — lightweight inference, no container. Wires `streamTurn` to the model directly (Tangle Router / tcloud SDK / Vercel AI SDK). **agent-app fully supports this — the runtime loop + tool side channel are sandbox-free.**
3. **Eval surface** — full campaign (personas, traces, judges, scorecards via agent-eval) / an inline completion gate / none yet?
4. **Product features** (each maps to a module): human-in-the-loop approvals? dated cadence/reminders? generated UI? grounded citations? which integrations (providers)? per-user/workspace billing? PII at rest? delegated long-running research/build?
5. **Path** — greenfield, or migrating an existing app? If migrating, **from what stack** (anything — a forked agent app, Next/Remix/Express, a notebook)? What's already hand-rolled vs missing?

Discovery output = the **module set** (below) + the **path** (greenfield §A / migration §B).

**Greenfield default flow:** `npx create-agent-app` → interview the user → fill `agent.config.ts` + seed `knowledge/` → `pnpm knowledge:ingest` → verify. The scaffolder emits a typechecking skeleton plus the agent-followable breadcrumb docs (`AGENTS.md` / `CUSTOMIZE.md` / `KNOWLEDGE.md`) that ARE the schema floor you drive — read them, then walk `CUSTOMIZE.md` in order. See §A.

## The layering rule (governs every decision)

> **Does the capability make sense without THIS app's tool side-channel / approval queue / chat route?**
> **Yes → ENGINE** → it's in (or belongs in) `agent-eval`/`agent-runtime`/`agent-integrations`/`tcloud`/`sandbox`; consume it (peer-dep), and if it's missing there, **contribute it down** — never fork it.
> **No → agent-app shell.** **Domain** (the product's nouns, prompts, schema, taxonomy) → **your app.**

Corollary — **extend, never duplicate.** Before writing anything that completes, scores, loops, parses a tool name, encrypts, or talks to a hub, check the engine's exports. Reimplementing an engine primitive (e.g. completion/scoring that agent-eval already exports) is the cardinal sin — the weaker copy drifts.

## Module set (map discovery answers to these)

| Need | Module | Seam you supply |
|---|---|---|
| Human-in-the-loop approvals + structured actions | `/tools` | `AppToolHandlers` (persist to your store) + `AppToolTaxonomy` (your action types) + `verifyToken` |
| Dated cadence / generated UI / grounded citations | `/tools` (`schedule_followup` / `render_ui` / `add_citation`) | same handlers |
| Chat turn loop (sandbox OR browser) | `/runtime` `streamAppToolLoop` / `runAppToolLoop` | `streamTurn` (wrap any backend) + `executeToolCall` |
| Model config (Tangle Router / BYOK) | `/runtime` `resolveTangleModelConfig` | env |
| Eval | `/eval` | `producedFromToolEvents` bridge + re-exports agent-eval's `verifyCompletion`/`weightedComposite` (peer-dep) |
| Integration-hub actions | `/integrations` | peer-dep `agent-integrations` + `apiKeyResolver` |
| Per-workspace budget-capped billing | `/billing` | key store + crypto + tcloud provisioner seams |
| Field PII crypto | `/crypto` | the encryption key |
| Web boundary (body/context/rate-limit/headers) | `/web` | KV (rate-limit) |
| PII redaction / SSE normalization | `/redact` / `/stream` | — |
| Self-service login → broker token | `/tangle` | the apps client |
| Delegated long-running work (**sandbox only**) | `/delegation` | platform key |
| Sandbox MCP server entries (**sandbox only**) | `/tools` `buildAppToolMcpServer` / `buildHttpMcpServer` | token + ctx |

## Agent surface — sandbox vs browser/edge copilot

Both consume the SAME `/tools`, `/runtime`, `/eval`, `/billing`, `/crypto`. They differ only in how the agent reaches the tools:

- **Sandboxed**: the in-container agent calls per-turn **MCP servers** (`buildAppToolMcpServer`) over HTTP; the app's routes (`handleAppToolRequest`) execute them. Delegated work via `/delegation`.
- **Browser / edge copilot (no sandbox)**: the app runs the loop in-process — `streamAppToolLoop({ streamTurn, executeToolCall, … })` where `streamTurn` wraps the **Tangle Router** (`resolveTangleModelConfig`) / **tcloud SDK** / **AI SDK** call directly, and `executeToolCall` routes to `createAppToolRuntimeExecutor(handlers)`. No container, no MCP. The structured side channel, billing, crypto, and eval bridge all still apply. (`/delegation` + the MCP-server builder are simply not used.)

## §A — Greenfield (drive the scaffolder; don't hand-wire)

Do NOT copy another agent app and do NOT hand-assemble the module wiring from scratch. The scaffolder generates a typechecking skeleton (filled `agent.config.ts` via `defineAgentApp`, a wired chat route over `@tangle-network/agent-app/preset-cloudflare`, an empty `knowledge/` dir, and the breadcrumb docs). Your job is to interview the user and fill the DATA.

1. **Scaffold.** `npx create-agent-app <dir> --name <product>` (run from the agent-app repo's `create-agent-app/` if not yet published). Then `cd <dir> && pnpm install && pnpm typecheck && pnpm test` — confirm the empty skeleton is green BEFORE editing.
2. **Read the breadcrumbs the scaffold emitted** — they are the schema floor you drive:
   - `AGENTS.md` (+`CLAUDE.md`) — the behavior contract: the layering rule, DATA (`agent.config.ts` + `knowledge/`) vs CODE (composer/route overrides), the fail-closed invariants (human-in-the-loop, grounding, trusted context).
   - `CUSTOMIZE.md` — the ordered fill-checklist (① identity ② taxonomy+regulated ③ knowledge-requirement `satisfiedBy` specs ④ drop docs in `knowledge/` + list sources ⑤ integrations ⑥ ingest ⑦ verify), each step paired with its discovery question.
   - `KNOWLEDGE.md` — build-loop (acquire) vs act-gate (block), multimodal sources, tuning the confidence/judge/freshness gate.
3. **Interview the user and FILL `agent.config.ts`**, walking `CUSTOMIZE.md` in order. Ask the discovery question at each step, then write the answer as DATA: identity (persona/disclaimers), taxonomy (`proposalTypes` + the regulated subset — keep `regulatedTypes ⊆ proposalTypes`), `knowledge.requirements` (declarative `satisfiedBy` rules), `knowledge.sources`, `integrations.enabled`. The type `AgentAppConfig` (+ its `agentAppConfigJsonSchema` floor) from `@tangle-network/agent-app/config` validates the shape.
4. **Seed `knowledge/`** — drop the user's real domain docs in, then `pnpm knowledge:ingest` (DRY) to confirm the inputs, and `--run` with a model-backed driver to drive the acquisition loop (KNOWLEDGE.md).
5. **Override CODE only when forced.** Default to the preset handlers in `src/agent-app.ts`. Drop to a custom `AppToolHandlers`/store only when the house D1+KV stack genuinely can't express your persistence — that's the one CODE seam. Add `/billing`,`/integrations`,`/tangle`,`/eval` as features dictate.
6. **Verify** — `pnpm typecheck && pnpm test && pnpm knowledge:ingest` green; the human-in-the-loop invariant test stays green (regulated proposals never auto-execute).

## §B — Migration (from ANY existing app)

The trace-proven loop — keep the app's tests **green at every step**:

1. **Audit + classify** every server module: **ENGINE** (→ peer-dep the substrate) · **SHELL** (→ lift to / consume from agent-app) · **DOMAIN** (→ keep) · **DEAD** (→ delete — fork-inherited cruft is often the single biggest win; verify zero importers first).
2. **Delete the dead** first (free compression, zero behavior change, prove it green).
3. **Lift shell concerns in dependency order.** Per concern: import the agent-app module → supply the seam (handlers/taxonomy/verifyToken/store/resolver) → **delete the local implementation, leaving a thin shim that preserves the public names callers use** → run the suite → green or revert. Preserve exact wire details (header names, error codes, token prefixes) in the shim.
4. **One class identity for shared errors** — import the framework's error type, don't keep a local copy (a second `instanceof` class silently misroutes).
5. **De-dupe against engines** — if a lifted thing duplicates an engine export, compose/re-export the engine instead.
6. **What NOT to lift** (it's not shell): domain logic; auth/RBAC bound to your own schema + auth library; substrate *adoption* (trace ingestion is agent-eval, not agent-app); thin domain-content wrappers.

### Surface mapping — your hand-rolled code → the shell-v2 primitive

Grounded in a real consumer migration. The split that matters: **dedup primitives are clean swaps on a running agent; the preset's *backend* is greenfield-first** (an existing agent keeps its working schema and supplies only the accessor seam).

| What the agent hand-rolls | → primitive | Migration type |
|---|---|---|
| `buildXKnowledgeRequirements` + `deriveXRuntimeKnowledge` (the act-gate) | `agent-app/knowledge` `buildKnowledgeRequirements` + `deriveSignals`; the specs move into **`config.knowledge.requirements`** as declarative `satisfiedBy` rules | **clean swap / dedup** — the count/config checks *become* rules; delete the bespoke scoring |
| Scattered domain data — persona, proposal-type constants + the regulated subset, disclaimers (typically spread across prompt/profile files) | `config.identity` / `config.taxonomy` / `config.identity.disclaimers` | **consolidation** into one `agent.config.ts` |
| DB schema (proposals/threads/deadlines) + `AppToolHandlers` | `agent-app/preset-cloudflare` default schema + handlers | **greenfield-first** — a running agent **keeps** its schema; new agents get the preset |
| The row-count seam to resolve `satisfiedBy` over the agent's own tables | `createD1KnowledgeStateAccessor` (preset) when your status column is literally `status`; otherwise supply a thin custom `KnowledgeStateAccessor` (~20 lines) mapping each table to its status column | **adopt** (works over your existing tables, no preset schema) |
| Bespoke knowledge ingestion wiring | `agent-app/knowledge-loop` `createKnowledgeLoop` | **swap** |
| `buildDelegationMcpServer` sandbox wiring | **`config.delegation.enabled`** + `delegationMcpForConfig` | **clean swap** (one boolean) |
| tools/runtime/integrations/crypto/web/redact/stream/billing | the matching `agent-app/*` modules (Module set above) | per the lift-loop |

Rule of thumb: on an **existing** agent do the clean swaps (gate → `/knowledge`+`config`, domain data → `config`, ingestion → `/knowledge-loop`, delegation → one boolean) and adopt the generic accessor — each *deletes* code. Reserve the preset's **schema/handlers** and `create-agent-app` for **greenfield**.

## Anti-patterns

- **Don't fork another agent app.** You inherit its domain leftovers (e.g. one app shipped a *different* domain's filing scripts because it was copy-forked). Start empty, add agent-app.
- **Don't hand-roll the side channel / loop / hub client / token.** They're in agent-app or the engine — compose them; a reimplementation is the weaker copy that drifts.
- **Never scrape structured output from prose** (fenced blocks, regex on the reply). Side effects are validated **tool calls** that return a result the model reads.
- **Keep domain out of the framework** — an action type, a price, a disclaimer, a rubric is a *parameter*, never baked in.
- **Don't bundle the engines** — peerDependency, so the product pins the version (no BOM lock, no forced fleet bump).

## Related skills
- **agent-stack-adoption / agent-eval-adoption** — wiring the substrate *engines* (loops, eval campaigns, ingestion). This skill is the SHELL layer above them.
- **substrate-release** — when you wrote something engine-general here, lift it INTO the engine + publish.
