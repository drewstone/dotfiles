---
name: hub-sdk-adoption
description: Adopt the Hub SDK for hosted connections, tool calls, approvals, and delegated access.
---

# Hub SDK Adoption

Use `@tangle-network/hub-sdk` when the product consumes the hosted Tangle Hub.
The product retains users, permissions, stored connection references, and business policy.
The SDK owns Hub transport, wire types, typed errors, and redaction helpers.

## Read the current contract

Start with the maintained [SDK guide](https://github.com/tangle-network/agent-dev-container/blob/develop/packages/hub-sdk/README.md) and [public exports](https://github.com/tangle-network/agent-dev-container/blob/develop/packages/hub-sdk/src/index.ts).
Find the current client method and test for the required connection, tool, approval, subscription, or workflow action.
Confirm imports against the target project's installed package.

## Replace the competing path

1. Locate existing direct Hub requests, duplicate wire types, transport wrappers, and auth handling.
2. Configure the SDK at the authorized server boundary, with explicit endpoint and request identity.
3. Route callers through the corresponding typed method.
4. Retain adapters that add product policy, persistence, or identity mapping; delete adapters that only rename SDK behavior.
5. Confirm old callers are gone before removing their code or dependencies.

Generated apps, browsers, and sandboxes receive only the credentials permitted by their delegated role.
Keep account keys, provider refresh tokens, and signing secrets server-side.
Bind delegated capabilities to permitted actions and expiry; enforce user authorization or stored product policy for writes.
Preserve error codes and retry meaning, and deduplicate state-changing calls through the supported contract.
Missing auth or transport failure must not become empty data.

## Prove adoption

Run typecheck and focused integration tests against the actual package.
Exercise one real primary request through the product's auth and persistence path.
Test changed failure boundaries, including denied auth, required approval, malformed responses, and duplicate writes when relevant.
Search for old transports, duplicate types, and importers of removed wrappers.

Report the adopted imports, retained adapters, deleted paths, real result, and checks.
A migration is complete only when the former transport no longer receives product traffic.

## Log the run

```bash
skill-run-log /hub-sdk-adoption --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `agent-integrations-adoption` when a connector implementation is needed behind the Hub.
- `harden` when changed credential, webhook, or approval boundaries need adversarial checks.
- `simplify` when local code still duplicates an adopted SDK capability.
- `verify` when adoption works and delivery checks remain.
