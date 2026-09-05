---
name: sandbox-sdk-integration
description: Use the Sandbox SDK for durable execution, browser viewing, reconnect, and retry-safe turns.
---

# Sandbox SDK Integration

Use the maintained Sandbox SDK for sessions, dispatch, replay, and browser state instead of rebuilding platform behavior.

## Choose the path from its lifetime

Read the current [SDK integration guide](https://github.com/tangle-network/agent-dev-container/blob/develop/products/sandbox/sdk/INTEGRATION.md) and [exports](https://github.com/tangle-network/agent-dev-container/blob/develop/products/sandbox/sdk/package.json).
Confirm required methods against the consuming project's actual package.

| Required behavior | Path to inspect |
|---|---|
| Server consumes one attached execution | Attached prompt stream and execution replay |
| Execution survives caller loss | Durable dispatch or the SDK turn driver |
| Browser watches an interactive session | Session message API and session gateway |
| Same logical turn may be retried | Stable turn identity plus conversation identity |

Before implementing reconnect or retry recovery, read [durability and identities](references/durability.md).
Before attaching a browser, read [browser viewing](references/browser-viewing.md).
Load only the path the product needs.

## Integrate and prove

Persist recovery identities before dispatch if the caller may die.
Read the dispatch receipt to distinguish new work from existing work.
Use SDK outcome handling to distinguish completed work, failure, and waiting for human input.
Transport closure or an accepted request cannot establish task completion.

Interrupt the actual caller or connection and prove recovery against the intended deployment.
Check that retries produce one logical result and do not repeat side effects or charges.
Remove duplicate state only after the SDK path proves it owns that responsibility.
Preserve required product authorization, durable history, and billing state.

Report the tested caller failure, execution identities, terminal outcome, retained product state, and unresolved limits.

## Log the run

```bash
skill-run-log /sandbox-sdk-integration --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `harden` when changed authorization, tenant isolation, or scoped tokens need adversarial proof.
- `ui-test` when browser-visible streaming needs interaction checks.
- `simplify` when duplicate buffering or dispatch remains after the SDK path is proven.
- `verify` when interruption recovery works and delivery checks remain.
