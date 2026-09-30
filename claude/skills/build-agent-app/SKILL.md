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

## Compose the product UI

For conversational flows, use `ChatComposer` and `ChatMessages` from `agent-app/web-react` for both ordinary chat and coding-profile chat.
Keep their histories, draft models, and persisted session modes distinct in product state.
Build coding conversations inside the product workspace rather than sending users to another product's builder.

Use `AgentWorkspaceLayout` from `agent-app/workspace-react` for the workspace rail.
Supply product-owned routes, authorized session and app rows, a workspace switcher in `railHeaderContent`, and the current user and sign-out action through its sidebar props.
Omit the session rail on operational pages that do not use it.
Use `PageHeader` from `sandbox-ui/primitives` for page titles.

Use the controlled `AgentProfileEditor` from `agent-app/web-react` when a user edits an agent profile.
It covers the canonical profile, including prompts, model preferences, tools, permissions, resources, MCP servers, and advanced fields.
The product still validates its policy, authorizes saves, and distinguishes saved settings from the profile used by a running session.

For user-built workspace apps, use `agent-app/workspace-apps` to register and refresh trusted Sandbox preview links.
The product owns creator authorization, stable app IDs, persistence, server launch, and an HTML readiness check before marking an app ready.
Show authorized app rows in the shared workspace rail and render an app with `EmbeddedAppView` from `sandbox-ui/workbench/embedded-app`.
Keep preview URLs separate from product navigation routes and treat their content as public.

Import the shared `sandbox-ui/styles` foundation and keep product colors in one semantic theme source.
Apply tokens to the workspace and portal root so menus, inputs, and focus rings use the same theme.

## Choose the path

- For a new product, inspect the current official scaffolder and use it when it supports the chosen runtime and deployment target.
  Install only modules needed by the user flow.
- When replacing existing infrastructure, read [migration](references/migration.md) before choosing what to delete or retain.
- When a sandbox turn must survive a caller or support live viewers, read [sandbox execution and viewing](references/sandbox-viewing.md) before adding transport or replay state.
- When agents build embedded apps, read [embedded app continuity](references/embedded-apps.md) before adding previews, storage, or model switching.

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
For workspace UI changes, compare the primary flow with the product brief and its actual users.
Inspect installed exports before composing the shell.
Open the actual chat, profile, and app-preview routes in a browser at desktop and mobile widths.
Save and reopen edited profiles and sessions, and open a published app through its workspace route.
Check loading, failure, retry, and permission-denied states in the rendered UI.
Require aligned header boundaries, consistent page spacing, one primary title, and useful empty states.
Trace which product owns each live profile, channel, and secret.
Distinguish saved settings, published profiles, and delivered messages through actual consumer proof.
For deployed work, repeat the relevant flow on the served artifact before claiming it works live.

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
