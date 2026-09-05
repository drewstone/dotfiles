---
name: agent-integrations-adoption
description: Build connector execution, grants, approvals, and webhooks with agent-integrations.
---

# Agent Integrations Adoption

Use `@tangle-network/agent-integrations` to implement connector contracts or provider execution.
Consuming hosted Hub connections and tools alone needs the Hub SDK instead.

## Choose the required layer

Read the current [adoption and architecture guide](https://github.com/tangle-network/agent-integrations/blob/main/README.md) and [package exports](https://github.com/tangle-network/agent-integrations/blob/main/package.json).
Locate the relevant implementation and test for the chosen capability: catalog, credentials, direct execution, runtime, policy, delegation, or webhook intake.
Confirm imports against the target project's dependency before coding.

The package owns portable connector and execution contracts.
The product owns users, tenant policy, durable storage, secret infrastructure, UI, and authority for external actions.
Search those existing stores before creating another.
Implement only the layer the product flow requires.

## Integrate safely

- Keep provider credentials in the product's secret store; public connection records contain references.
- Scope delegated capabilities to the subject, connection, actions, and expiry.
- Enforce the user's authorization or stored product policy at execution, including approval and destructive-action rules.
- Deduplicate state-changing requests and provider events using the existing idempotency contract.
- Verify webhook signatures before trusting payload fields.
- Preserve denied, unavailable, and failed outcomes and record their audit evidence.
- Advertise execution support only when the action's backend is configured and tested.

## Prove the product path

Exercise the primary flow through a provider test account and the product's actual stores.
For each changed boundary, test its relevant failure: denied action, expired or revoked credentials, duplicate delivery, malformed output, or secret disclosure.
If the flow includes writes, prove one authorized write occurs once and one unauthorized write is denied.
When adopting the catalog runtime, run its maintained execution audit.

Report selected exports, retained product policy and stores, real provider results, and failure checks.
Remove replaced local code only after its callers use the checked package path.

## Log the run

```bash
skill-run-log /agent-integrations-adoption --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `hub-sdk-adoption` when the product must consume the hosted Hub.
- `harden` when new credential, webhook, or approval boundaries need adversarial checks.
- `simplify` when local code still duplicates an adopted package capability.
- `verify` when integration checks pass and delivery remains.
