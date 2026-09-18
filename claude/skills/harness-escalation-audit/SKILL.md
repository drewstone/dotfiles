---
name: harness-escalation-audit
description: Audit how coding backends surface permissions, questions, plans, hooks, and MCP.
---

# Harness escalation audit

Check how coding backends surface permission requests, questions, and plans to a user.
Keep documented capability distinct from behavior wired into the current product.

Use this after a relevant CLI or adapter change, or when an integration decision depends on the current capability map.

## Check the real paths

1. Locate the repository's escalation record and adapter sources.
   In agent-dev-container, start with `docs/processes/harness-user-escalation.md`, `packages/sdk-provider-*`, and the interactive session implementation.
   Resolve current paths from the repository before assuming that an older layout still applies.
2. Enumerate the supported backends from their registered adapters and interactive launch configuration.
3. For each relevant backend, record its installed version and actual invocation in both modes:
   headless execution with remote responses, and interactive terminal execution with human responses.
4. Inspect the adapter, installed CLI help, and current official documentation for permission, question, and plan handling.
   Verify whether hooks, MCP tools, or extensions are called and whether their answers reach the running task.
5. Run an authorized minimal interaction when documentation or wiring alone cannot establish support.
   Check the request, user-visible delivery, response, continuation, cancellation, and timeout behavior that the product needs.
6. Update the existing record with sources, audited versions, dates, results, and missing evidence.
   Reconcile declared interaction kinds with the product's coverage record and run its current documentation checks.

Independent backend research can run in parallel when delegation is available and authorized.
Choose the work split from the backends under review; no particular orchestration API is required.

## Report

For each backend, interaction kind, and execution mode, record:

- the native hook, MCP tool, extension, or other supported mechanism;
- whether the adapter wires that mechanism into the product;
- the source or live check supporting the claim;
- unsupported or unknown behavior and the check that would resolve it.

Do not infer headless support from an interactive terminal demonstration.
Recommend a shared integration mechanism only after the current evidence shows which backends it can reach.

## Log the run

```bash
skill-run-log /harness-escalation-audit --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A required capability is supported but unwired | `/pursue` | the adapter, mechanism, and demonstrated gap |
| A documented capability still needs a live interaction check | `/verify` | the invocation and expected request-response behavior |
| Multiple failures appear to share one integration cause | `/diagnose` | the affected paths and per-backend evidence |
