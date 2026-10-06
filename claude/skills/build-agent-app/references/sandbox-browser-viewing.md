# Browser viewing

Read [interactive session types](https://github.com/tangle-network/agent-dev-container/blob/develop/products/sandbox/sdk/src/interactive-types.ts), [scoped token types](https://github.com/tangle-network/agent-dev-container/blob/develop/products/sandbox/sdk/src/scoped-token-types.ts), and [gateway exports](https://github.com/tangle-network/agent-dev-container/blob/develop/products/sandbox/sdk/src/session-gateway/index.ts).
Use the current browser example for the SDK installed by the product.

The browser gateway observes the supported session event path.
An attached server execution stream may use a different path; prove event delivery before replacing its replay mechanism.
Authorize the viewer and resolve the existing sandbox and runtime session before minting a short-lived read token.
The viewing route must not provision, wake, or replace the sandbox.
Keep account keys server-side and read tokens out of logs and durable storage.

Use the SDK's reconnect, replay persistence, and duplicate suppression.
Store final and incremental conversation history in product storage for access after transient replay expires.
Retain durable turn ownership to prevent competing drivers; viewing transport does not provide that lock.

Prove a second browser can open the session mid-turn, receive ordered partial output, reload, and resume without duplicates.
Confirm the final artifact remains in durable history and the browser reports no unhandled errors.
