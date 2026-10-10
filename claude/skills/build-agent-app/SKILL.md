---
name: build-agent-app
description: Build or migrate agent products with maintained app modules, Sandbox SDK execution, and integration or Hub connectors, proven through a full user flow.
---

# Build Agent App

Build the product around an agent: its users, work, tools, approvals, integrations, and persistence.
Start with the requested outcome and the product's current behavior.

## Find the right implementation

Read the current [agent-app architecture map](https://github.com/tangle-network/agent-app/blob/main/ARCHITECTURE.md) and [package exports](https://github.com/tangle-network/agent-app/blob/main/package.json) to locate the maintained module and runnable example.
For existing products, confirm installed imports and types before adopting upstream guidance.
Use maintained APIs for new work; upgrade dependencies only when required.

The product owns domain rules, permissions, persistence, billing, and UI.
Agent-interface owns portable profiles; Runtime owns execution; Eval owns measurement; Knowledge owns retrieval; Sandbox owns isolated sessions and transport.
Keep product policy at typed boundaries while reusing package behavior.

## Compose the product UI

- For ordinary and coding-profile chats, use `ChatComposer` and `ChatMessages` from `@tangle-network/agent-app/web-react`.
  Keep histories, draft models, and persisted session modes distinct; build coding conversations inside this product.
- Use `AgentWorkspaceLayout` from `@tangle-network/agent-app/workspace-react` for the workspace rail.
  Supply product routes, authorized session/app rows, a switcher in `railHeaderContent`, and current user/sign-out sidebar props.
  Omit the session rail on operational pages without chat.
- Use `PageHeader` from `@tangle-network/sandbox-ui/primitives` for pages and `WorkspacePaneHeader` from `@tangle-network/sandbox-ui/workspace` for panes.
  Align header edges, use one primary title per page, and keep spacing consistent.
- For profile editing, use controlled `AgentProfileEditor` from `@tangle-network/agent-app/web-react`.
  It covers prompts, model preferences, tools, permissions, resources, MCP servers, and advanced fields.
Product code still validates and authorizes saves; show saved edits separately from the profile already used by an active session.
- For user-built workspace apps, register trusted preview links with `@tangle-network/agent-app/workspace-apps` and render them with `EmbeddedAppView` from `@tangle-network/sandbox-ui/workbench/embedded-app`.
  The product owns creator access, stable IDs, persistence, server launch, and HTML readiness.
Show authorized app rows in the shared rail; keep preview URLs out of navigation and treat app content as public.
- Import the `@tangle-network/sandbox-ui/styles` foundation and keep product colors in one semantic theme source.
  Apply tokens to the workspace and portal root so menus, inputs, and focus rings stay consistent.

## Choose the path

- For a new product, inspect the current scaffolder and use it when it supports the chosen runtime and deployment target.
  Install only modules required by the user flow.
- For infrastructure replacement, read [migration](references/migration.md) before choosing what to retain or delete.
- For turns that survive callers, retry safely, or support live viewers, read [sandbox execution and viewing](references/sandbox.md) before adding transport or replay state.
- For connectors, grants, approvals, webhooks, or hosted Hub connections, read [tool integrations](references/integrations.md) before adding a client or connector.
- For embedded apps, read [embedded app continuity](references/embedded-apps.md) before changing previews, storage, or model switching.

## Build the complete flow

Map the user's path from input to useful result, including authentication, tools, persistence, side effects, permissions, and failures.
Implement approval, cancellation, resume, and usage recording when the product requires them.
Prove one real request end-to-end before multiplying workflows.

Preserve these invariants:

- Structured actions use validated tools; prose does not authorize writes.
- Side effects require user authorization or stored product policy.
- Credentials stay server-side and are redacted before export.
- Retries do not duplicate product writes or charges.
- Browser events do not establish completion or billable usage.
- Tenant, user, execution, and billing identities remain distinct.

## Verify the product

Exercise a customer-like journey against the actual backend and storage.
Check the result, authorized side effect, usage record, and interruption outcome, including denied permissions.
Open changed chat, profile, and app-preview routes in a browser at desktop and mobile widths.
Verify saved profiles/sessions reopen, published apps open through workspace routes, and loading, failure, retry, and permission-denied states render correctly.
Give each visible control and sentence a user purpose; include useful empty/error states and compare the flow with its brief and actual users.
Track which product owns each live profile, channel, and secret.
Keep saved settings, published profiles, and delivered messages distinct; prove each through its consumer.
For deployed work, repeat the changed flow on the served artifact before claiming it works live.

Discover applicable skills and existing product capabilities for the user's goal.
Use the app as the intended user through maintained routes and tools.
Retain actual invocation, tool, artifact, and stored-readback identities; reopen the saved result.
Apply user corrections to workspace context or scoped implementation while preserving the goal and authorization.
Exercise the correction in a fresh eligible session, reusing persisted context and preserving pending execution identities.
Compare audience utility, cost, and owner intervention against a comparable control; retain failures and unknowns.
Persist the supported lesson immediately in the product's adopted workspace memory, with evidence links.
Promote shared profile or skill changes through owning review, versioning, and measured evaluation, retaining rollback.
Use maintained APIs for promotion; a saved lesson does not establish an update to the active agent.
Stop when the user's acceptance gate and requested delivery are proved; retain missing proof and its owner.

Report the user-visible result, run and artifact identities, checks, unresolved limits, and retained or removed adapters when relevant.

## Log the run

```bash
skill-run-log /build-agent-app --target "<target>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

- `build-with-agent-runtime` when the change exposes reusable execution or supervision work.
- `eval-engineering` when the primary flow lacks a meaningful evaluation.
- `harden` when changed auth, billing, or tenant boundaries need adversarial proof.
- `product-design` when the changed UI needs broader interaction or responsive coverage.
- `verify` when implementation is complete and release checks remain.
