---
name: build-agent-app
description: Build or migrate an agent product with agent-app modules, billing, integrations, and evals.
---

# Build Agent App

Use this when building the product shell around an agent: chat, tools, approvals, persistence, billing, integrations, and visible workflows.
Read the installed `@tangle-network/agent-app` README, exports, types, current scaffolder, and nearest maintained product before choosing modules.
Do not copy API names from this skill.

## Confirm The Boundary

| Concern | Owner |
|---|---|
| Product routes, UI, auth, persistence, billing, and approvals | Product and `agent-app` |
| Portable agent behavior | `agent-interface` |
| Agent execution, streaming, workers, and candidate activation | `agent-runtime` |
| Cases, scoring, comparison, and release evidence | `agent-eval` |
| Sources, retrieval, memory, and knowledge candidates | `agent-knowledge` |
| Connector contracts and provider execution | `agent-integrations` |
| Isolated compute and durable sandbox sessions | `sandbox` |

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

## Then consider

- `build-with-agent-runtime` for execution, workers, resume, or candidate activation.
- `agent-stack-adoption` for a complete package-boundary audit.
- `agent-eval-adoption` for product evaluation and comparison.
- `build-with-agent-knowledge` for retrieval, memory, or knowledge improvement.
