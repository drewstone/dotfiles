# Tool integrations

Use this when the product needs connectors, grants, approvals, webhooks, or hosted Hub connections.

## Choose the layer

| Need | Package | Read first |
|---|---|---|
| Implement connector contracts or provider execution | `@tangle-network/agent-integrations` | [adoption and architecture guide](https://github.com/tangle-network/agent-integrations/blob/main/README.md) and [exports](https://github.com/tangle-network/agent-integrations/blob/main/package.json) |
| Consume hosted Tangle Hub connections, tools, approvals, subscriptions, or workflows | `@tangle-network/hub-sdk` | [SDK guide](https://github.com/tangle-network/agent-dev-container/blob/develop/packages/hub-sdk/README.md) and [exports](https://github.com/tangle-network/agent-dev-container/blob/develop/packages/hub-sdk/src/index.ts) |

Locate the relevant implementation, client method, and test for the chosen capability: catalog, credentials, direct execution, runtime, policy, delegation, webhook intake, or Hub action.
Confirm imports against the target project's installed package before coding.
Implement only the layer the product flow requires.

agent-integrations owns portable connector and execution contracts; the Hub SDK owns Hub transport, wire types, typed errors, and redaction helpers.
The product owns users, tenant policy, permissions, stored connection references, durable storage, secret infrastructure, UI, and authority for external actions.
Search those existing stores before creating another.

## Replace a competing Hub path

1. Locate existing direct Hub requests, duplicate wire types, transport wrappers, and auth handling.
2. Configure the SDK at the authorized server boundary, with explicit endpoint and request identity.
3. Route callers through the corresponding typed method.
4. Retain adapters that add product policy, persistence, or identity mapping; delete adapters that only rename SDK behavior.
5. Confirm old callers are gone before removing their code or dependencies.

A migration is complete only when the former transport no longer receives product traffic.

## Integrate safely

- Keep provider credentials, account keys, refresh tokens, and signing secrets in the product's server-side secret store; public connection records contain references.
- Generated apps, browsers, and sandboxes receive only the credentials permitted by their delegated role.
- Scope delegated capabilities to the subject, connection, actions, and expiry.
- Enforce the user's authorization or stored product policy at execution, including approval and destructive-action rules.
- Deduplicate state-changing requests and provider events through the supported idempotency contract, and preserve error codes and retry meaning.
- Verify webhook signatures before trusting payload fields.
- Preserve denied, unavailable, and failed outcomes with audit evidence; missing auth or a transport failure must not become empty data.
- Advertise execution support only when the action's backend is configured and tested.

## Prove the product path

Exercise the primary flow through a provider test account or one real Hub request, using the product's actual auth and stores.
For each changed boundary, test its relevant failure: denied action, required approval, expired or revoked credentials, duplicate delivery, malformed output, or secret disclosure.
If the flow includes writes, prove one authorized write occurs once and one unauthorized write is denied.
When adopting the catalog runtime, run its maintained execution audit.
Search for old transports, duplicate types, and importers of removed wrappers.
Report the adopted imports, retained product policy, adapters, and stores, deleted paths, real provider results, and failure checks.
