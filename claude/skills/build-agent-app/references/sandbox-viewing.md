# Sandbox execution and live viewing

Read the current [app execution guidance](https://github.com/tangle-network/agent-app/blob/main/AGENTS.md) before selecting the driver and transport.
Use [Sandbox durability](../../sandbox-sdk-integration/references/durability.md) when work must survive its caller.
Use [browser viewing](../../sandbox-sdk-integration/references/browser-viewing.md) when a viewer must attach or reconnect.
Those guides own the SDK identities, token rules, and interruption checks.

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

In the product proof, check the final artifact and usage record as well as the shared guide's reconnect or recovery outcome.
