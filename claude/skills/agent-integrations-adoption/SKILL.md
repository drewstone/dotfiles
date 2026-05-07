---
name: agent-integrations-adoption
description: "Adopt @tangle-network/agent-integrations in products, generated apps, sandboxes, and agent workflows. Use for OAuth connections, manifests, grants, capabilities, invocation, approvals, webhooks, and connector runtime strategy."
---

# Agent Integrations Adoption

Use this skill when wiring `@tangle-network/agent-integrations` into a product
or generated app platform.

## Principle

Products own users, persistence, UI, policy, and secrets. The package owns the
stable integration contract.

```txt
user connection
  -> IntegrationConnection + secret refs
  -> IntegrationManifest
  -> IntegrationGrant
  -> short-lived capability bundle
  -> /v1/integrations/invoke
  -> policy + approval + idempotency + audit
  -> provider/runtime action
```

Generated apps and sandboxes must never receive provider refresh tokens, API
keys, or raw OAuth credentials.

## Adoption Checklist

1. Build the registry with `buildDefaultIntegrationRegistry()`.
2. Choose enabled connectors and backend strategy: native adapter, hosted
   gateway, Tangle catalog runtime, or product-specific provider.
3. Implement stores for connections, grants, approvals, audit, healthchecks,
   workflows, events, capabilities, and idempotency.
4. Back `IntegrationSecretStore` with production vault/KMS.
5. Render OAuth/API-key setup UI from `IntegrationSpec`.
6. Resolve generated app or agent requirements through `IntegrationManifest`.
7. Create user-approved `IntegrationGrant` records.
8. Inject sandbox capability bundles with `buildIntegrationBridgeEnvironment()`.
9. Route app/sandbox actions through a product `/v1/integrations/invoke`
   endpoint.
10. Install `createDefaultIntegrationActionGuard()` for approval, audit,
    idempotency, dry-run handling, and rate limits.
11. Run healthchecks after connect/rotate and on a schedule.
12. Ingest webhooks through `receiveIntegrationWebhook()`.

## Runtime Rules

- Reads can run after explicit grant.
- Writes should require approval by default.
- Destructive actions should be denied unless product policy explicitly enables
  them.
- Capability tokens must be short-lived and scoped to subject, connection,
  connector, scopes, and actions.
- Use idempotency keys for state-changing actions.
- Store audit events for connect, grant, invoke, approve, revoke, rotate, and
  webhook flows.

## Connector Coverage

The registry separates contract coverage from backend execution state:

- contract: normalized connector/action/trigger/auth shape exists
- setup-ready: product can render setup/admin metadata
- native adapter: direct reviewed adapter ships
- gateway executable: hosted provider can execute
- catalog runtime executable: deployed runtime can execute long-tail packages

Do not expose long-tail tools as executable until the product has configured and
audited the backend.

## Review Red Flags

- Generated app code receives provider credentials.
- Product code imports a vendor SDK directly instead of routing through an
  `IntegrationProvider` or `ConnectorAdapter`.
- OAuth setup steps are hand-written instead of rendered from `IntegrationSpec`.
- Writes skip approval or idempotency.
- Webhooks are accepted without signature verification and provider-event dedupe.
- The UI says a connector works when no execution backend is configured.

## Key Docs

- `@tangle-network/agent-integrations` README
- `docs/external-product-integration.md`
- `docs/architecture.md`
- `docs/catalog-registry.md`
- `docs/provider-decision-matrix.md`
- `docs/integration-execution-audit.md`
- `docs/production-completion-checklist.md`
