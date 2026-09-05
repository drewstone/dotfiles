---
name: build-agent-app
description: Build or migrate agent products using maintained app modules and a complete user flow.
---

# Build Agent App

Build the product shell around an agent: visible work, tools, approvals, persistence, billing, and integrations.
Start from the user's required outcome and existing product behavior.

## Resolve the current implementation

Read the current [agent-app architecture map](https://github.com/tangle-network/agent-app/blob/main/ARCHITECTURE.md) and [package exports](https://github.com/tangle-network/agent-app/blob/main/package.json).
Use the map to find the module, implementation, and runnable example for the capability you need.
For existing products, check their actual imports and installed types before adopting current upstream guidance.
Choose maintained APIs for new work; upgrade dependencies deliberately when the change requires it.

The product owns domain rules, permissions, persistence, billing, and UI.
Agent-interface owns portable profiles; Runtime owns execution; Eval owns measurement; Knowledge owns retrieval; Sandbox owns isolated sessions and transport.
Reuse each package's behavior while retaining product policy at typed boundaries.

## Choose the path

- For a new product, inspect the current official scaffolder and use it when it supports the chosen runtime and deployment target.
  Install only modules needed by the user flow.
- When replacing existing infrastructure, read [migration](references/migration.md) before choosing what to delete or retain.
- When a sandbox turn must survive a caller or support live viewers, read [sandbox execution and viewing](references/sandbox-viewing.md) before adding transport or replay state.

## Build the complete flow

Define the user, input, final artifact, backend, tools, side effects, tenant boundary, and expected failure behavior.
Implement authentication, execution, persistence, approval, cancellation, resume, and usage recording where the product requires them.
Prove one real request through this path before multiplying workflows.

Keep these constraints visible in every implementation:

- Structured actions use validated tools; output prose does not authorize a write.
- Execute side effects only under user authorization or stored product policy.
- Credentials remain server-side and are redacted before export.
- Retries cannot duplicate product writes or charges.
- Browser events do not establish completion or billable usage.
- Tenant, user, execution, and billing identities remain distinct.

## Completion

Run a customer-like flow against the actual backend and storage.
Check the final artifact, authorized side effect, usage record, and interruption outcome, including denial when permission is absent.
For visible flows, click through the product and inspect errors and retained state.
For deployed work, repeat the relevant flow on the deployed artifact.

Report the working flow, retained adapters, removed competing paths, checks, and unresolved limits.
Include run and artifact identities for real executions; do not substitute code size or test count for the product result.

## Log the run

```bash
skill-run-log /build-agent-app --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `build-with-agent-runtime` when the completed app change exposes work in reusable execution or supervision.
- `eval-engineering` when the primary flow lacks a meaningful evaluation.
- `harden` when changed auth, billing, or tenant boundaries need adversarial proof.
- `ui-test` when visible flows need broader interaction or responsive coverage.
- `verify` when implementation is complete and release checks remain.
