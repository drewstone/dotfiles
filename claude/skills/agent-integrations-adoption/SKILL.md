---
name: agent-integrations-adoption
description: Build connector contracts and runtimes with agent-integrations, including auth and approvals.
---

# Agent Integrations Adoption

Use this when building connector definitions, provider adapters, local or hosted execution, webhook intake, grants, or approval policy with `@tangle-network/agent-integrations`.
Use `hub-sdk` when a product only needs to consume the hosted Tangle Hub.

## Read Current Truth

Inspect the installed package version, exports, types, README, connector registry, and relevant runtime implementation.
Search the product for existing connection, grant, approval, secret, audit, webhook, and idempotency stores before adding any.

The package owns vendor-neutral connector and execution contracts.
The product owns users, tenant policy, durable storage, secret infrastructure, UI, and external-action authority.

## Implement The Required Layer

Choose only the layer the product needs:

| Need | Package surface |
|---|---|
| Connector metadata and action schemas | Catalog, specs, or registry |
| OAuth or API-key lifecycle | Connect and credential contracts |
| Direct provider execution | Connector adapter |
| Long-tail package execution | Catalog runtime |
| Product request enforcement | Guard or middleware |
| Generated app access | Consumer bridge with scoped capability |
| Provider events | Webhook normalization and deduplication |

Confirm current subpaths and symbols from installed types.
Do not copy an old registry recipe or package-wide checklist into product code.

## Security Rules

- Store provider credentials in a vault or KMS and expose only references.
- Give generated apps and agents short-lived capabilities bound to subject, connection, scopes, and actions.
- Require approval for writes by default and explicit policy for destructive actions.
- Use idempotency keys for every state-changing action and provider event.
- Verify webhook signatures before parsing trusted fields.
- Record connect, grant, invoke, approve, revoke, rotate, and webhook outcomes.
- Keep denied, unavailable, and failed execution distinct.
- Do not advertise a connector action until an audited execution backend is configured.

## Prove The Integration

Test one read, one approved write, one denied action, expired or revoked credentials, duplicate delivery, malformed provider output, and secret redaction.
Run the package's execution audit when adopting its catalog runtime.
Use a real provider test account for the primary product path; mocks cover adapters only.

## Completion

Report the installed version and subpaths, connector and backend selected, product-owned stores, capability and approval policy, audit records, real provider result, and failure tests.

## Then consider

- `hub-sdk-adoption` when exposing these connectors through the hosted Hub.
- `harden` for credential, webhook, approval, or destructive-action changes.
- `verify` before release.
