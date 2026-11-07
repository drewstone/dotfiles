# Tool integrations

Use this when the product needs connectors, grants, approvals, or webhooks.

Locate the relevant implementation, client method, and test for the chosen capability: catalog, credentials, direct execution, runtime, policy, delegation, or webhook intake.
Confirm imports against the target project's installed package before coding.
Implement only the layer the product flow requires.

The product owns users, tenant policy, permissions, stored connection references, durable storage, secret infrastructure, UI, and authority for external actions.
Search those existing stores before creating another.

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

Exercise the primary flow through a provider test account, using the product's actual auth and stores.
For each changed boundary, test its relevant failure: denied action, required approval, expired or revoked credentials, duplicate delivery, malformed output, or secret disclosure.
If the flow includes writes, prove one authorized write occurs once and one unauthorized write is denied.
Search for old transports, duplicate types, and importers of removed wrappers.
Report the adopted imports, retained product policy, adapters, and stores, deleted paths, real provider results, and failure checks.
