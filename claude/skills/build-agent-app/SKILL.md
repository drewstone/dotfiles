---
name: build-agent-app
description: Build or migrate an agent product with agent-app modules, billing, integrations, and evals.
---

# Build Agent App

Use this when building the product shell around an agent: chat, tools, approvals, persistence, billing, integrations, and visible workflows.
Read the installed package, current scaffolder, and nearest maintained product before choosing modules.
Do not copy API names from this skill.

## Resolve Current Sources

Run these checks before writing product infrastructure:

1. Use `pnpm why @tangle-network/agent-app @tangle-network/sandbox` to find the installed versions.
2. Read each installed `package.json` export map and the exact `.d.ts` files for the subpaths you will import.
3. Search the package sources and maintained products for the capability before adding a wrapper.
4. Read the current scaffold output when the product started from that scaffold.

Use these source maps when the local repositories are available:

- [agent-app architecture](/home/drew/code/agent-app/ARCHITECTURE.md)
- [agent-app live viewing and history](/home/drew/code/agent-app/AGENTS.md#live-viewing-vs-history-the-measured-model)
- [resumable turn example](/home/drew/code/agent-app/examples/resumable-turns.md)
- [Sandbox session gateway exports](/home/drew/webb/agent-dev-container/products/sandbox/sdk/src/session-gateway/index.ts)
- [Sandbox scoped-token contract](/home/drew/webb/agent-dev-container/products/sandbox/sdk/src/scoped-token-types.ts)

Source and installed types are authoritative.
Correct a stale document in the same change.

## Confirm The Boundary

| Concern | Owner |
|---|---|
| Product routes, UI, auth, persistence, billing, and approvals | Product and `agent-app` |
| Portable agent behavior | `agent-interface` |
| Agent execution, streaming, workers, and candidate activation | `agent-runtime` |
| Cases, scoring, comparison, and release evidence | `agent-eval` |
| Sources, retrieval, memory, and knowledge candidates | `agent-knowledge` |
| Connector contracts and provider execution | `agent-integrations` |
| Isolated compute, sandbox sessions, and live session transport | `sandbox` |

Keep product nouns, permissions, schemas, prompts, and policy in the product.
Move reusable behavior to its owning package instead of copying it between products.

## Start From One User Flow

Record:

- the user and job;
- input and final artifact;
- agent backend and session lifetime;
- tools, knowledge, integrations, and side effects;
- approval and tenant boundaries;
- persistence, billing, cancellation, and resume behavior;
- objective and semantic success checks.

Build the actual working flow first.
Do not start from a module inventory or a marketing page.

## Greenfield

1. Use the current official scaffolder when it supports the selected runtime and deployment target.
2. Install only the package subpaths and peer packages the flow uses.
3. Define one product-owned profile, taxonomy, handlers, storage boundary, and approval policy.
4. Wire the production agent entrypoint through the app's tool and event path.
5. Persist final output, run identity, errors, usage, cost, and latency.
6. Add the smallest real knowledge, integration, billing, and UI pieces required by the flow.
7. Prove one real request before adding another workflow.

Generated starter docs are guidance for that starter version, not a permanent API reference.
Confirm every symbol from installed types.

## Migration

Inventory the existing product and classify each concern:

| Class | Action |
|---|---|
| Shared package behavior | Import the current package and delete the local copy |
| Product behavior | Keep it and adapt at a typed boundary |
| Compatibility contract | Preserve deliberately and test the exact wire behavior |
| Dead or foreign product code | Prove it is unreachable, then delete it |

Migrate one coherent concern at a time.
Keep the product runnable after each change.
Do not leave both old and new implementations reachable.
Do not preserve a wrapper that only renames the package API.

For each migrated concern, prove the installed dependency resolves, production code imports it, the replaced path has no callers, and the user-visible flow still works.
Changing test count or line count is not success by itself.

## Runtime Choices

Use the backend the product actually needs:

- direct or edge execution for bounded in-process turns;
- runtime-managed execution for resumable tasks, workers, or richer control;
- sandbox execution for isolated files, tools, or long-lived compute.

These paths may share product tools and records.
They must not silently change identity, approval, billing, replay, or error behavior.

## Choose Live Viewing Before Adding Transport

Live viewing, durable history, and single-flight execution are different jobs.

| Job | Current owner | Required composition |
|---|---|---|
| Watch an interactive sandbox turn | `sandbox` | Send through the session message lane, mint a short-lived session-scoped read token, and connect the browser with `SessionGatewayClient`. |
| Read the turn later | Product storage through `agent-app/chat-routes` | Persist the assistant row incrementally while the turn streams. |
| Stop two drivers from running one turn | `agent-app/turn-stream` | Use the durable turn lock. |
| Stream a sandbox-free runtime | `agent-app/stream` | Use the product turn buffer because no sandbox session exists. |

For an interactive sandbox product:

1. Resolve an existing sandbox and runtime session after product authorization.
2. Send the turn with the Sandbox session message API.
3. Mint `scope: 'session'` with both the public session id and runtime session id.
4. Return the token only from an authorized server route.
5. Connect the browser through `@tangle-network/sandbox/session-gateway`.
6. Let the SDK own WebSocket reconnect, sequence replay, and duplicate suppression.
7. Let durable message storage own history after the short gateway buffer expires.

The token route must not provision, wake, or replace a sandbox.
Never persist or log the read token.
Never put an account API key in browser code.
Use `replaySinceSeq`; timestamp replay is deprecated.

Do not relay an ordinary sandbox session through a product Worker, SSE route, or new Durable Object.
`box.streamPrompt()` is the server-worker lane, not a browser API.
Before relying on detached-run gateway fanout, prove that lane against the deployed platform.
Keep the existing detached fallback until that production check passes.

## Safety

- Structured side effects use validated tool calls, not prose parsing.
- Writes require explicit approval unless stored product policy authorizes them.
- Browser events are not authoritative for billing or completion.
- Credentials remain server-side and are redacted before export.
- State-changing requests and callbacks are idempotent.
- Tenant, user, runtime, and billing identities remain distinct.
- Mocks cover adapters; one real backend and storage path proves the product flow.

## Completion

One customer-like path must prove:

```text
authenticate -> submit work -> agent executes -> tools and knowledge run
-> final artifact persists -> approval commits once -> usage records once
-> interruption resumes or fails clearly -> result is evaluated
```

Report installed versions, exact subpaths, retained product adapters, deleted competing paths, run IDs, artifact paths, checks, cost, latency, and deployed result when deployment is in scope.

For sandbox live viewing, the proof must include one real mid-turn observer:

```text
first browser sends -> second browser opens the same deep link mid-turn
-> ordered partial output arrives -> reload resumes after the saved sequence
-> final output is present in durable history -> browser console has zero errors
```

Record the public deep link, runtime session id, first and last sequence, event count, reconnect result, and token expiry.
Do not use Storybook or a mocked stream as product proof.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Work needs execution, workers, resume, or candidate activation | `build-with-agent-runtime` | the flow that needs it + the current wiring |
| The product has 0 evals over its main flow | `/eval-engineering` | one real production trace to convert into a pinned case |
| Diff touches auth, billing, tenant isolation, or secret storage | `/harden` | the changed file:line list + the tenant boundary it crosses |
| Shell lands and ≥1 flow runs end-to-end against real infra | `/verify` | the flow name + the non-mocked run output |
| App-shell diff > 200 lines before review | `/critical-audit` | the diff scope (`--diff-only`) + the contracts it changes |

## Log the run

On completion, append one line so `/reflect` and `/governor` can grade this skill later:

```bash
skill-run-log /build-agent-app --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```
