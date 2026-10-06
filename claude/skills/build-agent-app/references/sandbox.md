# Sandbox execution and live viewing

Use the maintained Sandbox SDK for sessions, dispatch, replay, and browser state instead of rebuilding platform behavior.
Read the current [SDK integration guide](https://github.com/tangle-network/agent-dev-container/blob/develop/products/sandbox/sdk/INTEGRATION.md), [exports](https://github.com/tangle-network/agent-dev-container/blob/develop/products/sandbox/sdk/package.json), and [app execution guidance](https://github.com/tangle-network/agent-app/blob/main/AGENTS.md) before selecting the driver and transport.
Confirm required methods against the consuming project's actual package.

## Choose the path from its lifetime

| Required behavior | Path to inspect |
|---|---|
| Server consumes one attached execution | Attached prompt stream and execution replay |
| Execution survives caller loss | Durable dispatch or the SDK turn driver |
| Browser watches an interactive session | Session message API and session gateway |
| Same logical turn may be retried | Stable turn identity plus conversation identity |

Before implementing reconnect or retry recovery, read [durability and identities](sandbox-durability.md).
Before attaching a browser, read [browser viewing](sandbox-browser-viewing.md).
Load only the path the product needs.

## Keep product responsibilities distinct

| Responsibility | Product integration |
|---|---|
| Live sandbox viewing | Attach the SDK gateway to the supported session event path |
| History after transient replay expires | Persist incremental and final assistant content in product storage |
| One driver per logical turn | Use durable turn ownership and SDK retry identity |
| Work spanning multiple agent turns | Advance it through the product's durable scheduling and business policy |
| A runtime without a sandbox session | Use product stream storage; no sandbox gateway exists to supply events |

Session-message events and server execution streams are different paths.
Prove that the selected path delivers the required events before removing its current buffer.
Keep adapters that add product authorization, durable history, or billing; delete pure rebroadcast only when the SDK replaces it.

## Integrate and prove

Persist recovery identities before dispatch if the caller may die.
Read the dispatch receipt to distinguish new work from existing work.
Use SDK outcome handling to distinguish completed work, failure, and waiting for human input.
Transport closure or an accepted request cannot establish task completion.

Interrupt the actual caller or connection and prove recovery against the intended deployment.
Check that retries produce one logical result and do not repeat side effects or charges.
Check the final artifact and usage record as well as the reconnect or recovery outcome.
Report the tested caller failure, execution identities, terminal outcome, retained product state, and unresolved limits.
