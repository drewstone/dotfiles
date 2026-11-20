---
name: build-agent-app
description: Build or migrate agent products with maintained app modules and integration connectors, proven through a full user flow.
---

# Build Agent App

An excellent agent product does the user's whole job end to end, measurably better than the best tool they could use instead, and every write, charge and message it makes is one the user authorized.

## Set the bar

Before building, [set the bar](../be-ambitious/SKILL.md#set-the-bar): the best product or published system that does this job today with its source, the user's current number (time per task, share solved, quality on a test set), the target that beats it, and the customer-like journey that will show it.
When the target needs a capability the platform lacks (a connector, memory, better retrieval or planning), build it in its owning package as part of the work.

## Find the right implementation

For an existing product, confirm installed imports and types before adopting upstream guidance.
The product owns domain rules, permissions, persistence, billing and UI at typed boundaries, reusing package behavior.

- For a new product, use the current scaffolder when it supports the runtime and deployment target, installing only modules the flow needs.
- For infrastructure replacement, read [migration](references/migration.md) before choosing what to retain or delete.
- For connectors, grants, approvals or webhooks, read [tool integrations](references/integrations.md) first.
- For embedded apps, read [embedded app continuity](references/embedded-apps.md) before changing previews, storage or model switching.

## Build the complete flow

Map the path from input to useful result (authentication, tools, persistence, side effects, permissions, failures), with approval, cancellation, resume and usage recording where the product needs them; prove one real request end to end, then build out the rest.

Preserve these invariants:

- Structured actions use validated tools; prose does not authorize writes.
- Side effects require user authorization or stored product policy.
- Credentials stay server-side and are redacted before export.
- Retries do not duplicate product writes or charges.
- Browser events do not establish completion or billable usage.
- Tenant, user, execution, and billing identities remain distinct.

## Verify the product

Run a customer-like journey on the real backend and storage, checking the result, the authorized side effect, the usage record and the interruption outcome, denied permissions included.
Open changed routes at desktop and mobile widths: saved profiles and sessions reopen, published apps open through workspace routes, and loading, failure, retry and permission-denied states render.
Prove saved settings, published profiles and delivered messages each through its consumer, and on the served artifact before claiming it works live.
When the user corrects the agent, apply it to workspace context or the implementation, exercise it in a fresh session against a comparable control, and persist the lesson with evidence; a saved lesson does not update the active agent.
Stop when the acceptance gate and delivery are proved against the bar, with missing proof named with its owner.

## Log the run

```bash
skill-run-log /build-agent-app --target "<target>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The primary flow lacks a meaningful evaluation | `/eval-engineering` | the journey and its bar |
| Changed auth, billing or tenant boundaries need adversarial proof | `/harden` | the boundaries and invariants |
| The changed UI needs broader interaction or responsive coverage | `/product-design` | the flows and states |
| Every product flow must be proven by recorded real use | `/prove-journeys` | the flow list and test identities |
