---
name: tangle-blockchain-blueprint
description: Build or review on-chain Tangle Blueprint protocol systems. Do not use for agent apps, sandbox containers, gateways, or general runtime work.
---

# Tangle Blockchain Blueprint

Use this skill for on-chain Blueprint architecture, protocol docs, operator requirements, service lifecycle, job/query boundaries, product dapp integration, and production-like validation.

Do not use this skill for agent apps, sandbox containers, agent gateways, or general runtime work.

## Required Reading

Resolve the maintained Tangle documentation repository from the current project or its upstream links.
Use `rg --files` to locate the current Blueprint overview, protocol model, operator requirements, service lifecycle, and application integration pages.
Read the relevant product documentation and compare its revision with the product source.
If a page has moved or is absent, use the current documentation index and source instead of assuming an old path still exists.

Before making a product-specific claim, inspect the actual blueprint repo. Do not claim a blueprint ships an indexer, verifier, router, sidecar, TEE path, settlement service, hosted app, or operator API unless the repo contains that artifact and the docs can name the source file.

## Architecture Contract

Never collapse these layers:

1. Blueprint: the abstract template, metadata, jobs, contracts, artifacts, and app policy.
2. Operator registration: an operator says on-chain that it can serve that blueprint.
3. Service request: a user asks selected registered operators to instantiate the blueprint.
4. Service instance: the live unit created from the request.
5. Job: a state-changing command against one service instance.
6. Query: a read from contracts, shared protocol indexing when available, or an operator API.

Product apps may read protocol state through contracts or shared indexing infrastructure. A product blueprint does not ship a dedicated indexer unless its repo proves it.

## Documentation Rules

- Name which behavior comes from onchain contracts and which behavior comes from hosted services.
- Separate hosted app UX from the blueprint.
- Separate operator API/live product state from chain/protocol state.
- State whether an artifact is live, future work, or only an integration expectation.
- Use "service instance" when talking about the live thing a user interacts with.
- Use "operator API" for live sandboxes, bots, venues, terminals, books, logs, and health.
- Use "shared protocol indexer" only for protocol event indexing outside the product blueprint repo.

## Validation Minimum

For code or runtime changes:

1. `cargo check`
2. relevant tests or smoke checks
3. deploy/register/request/approve/job proof with `cargo tangle` when protocol/runtime behavior changed
4. UI build/typecheck and one non-mocked happy path when UI changed
5. explicit tenancy/auth proof when the service handles more than one user boundary

For docs-only work:

1. read the source repo files behind every product-specific claim
2. run the docs slop scanner on touched pages
3. run repository format/build checks
4. report exact commands and outcomes

## Anti-Patterns

- Treating a blueprint as a generic backend service.
- Calling the template "live" when the service instance is live.
- Modeling normal reads as jobs.
- Claiming a repo has infrastructure it does not ship.
- Claiming hosted service behavior is enforced by onchain contracts.
- Describing protocol state as proof of runtime health, trade safety, credit redemption, model quality, or endpoint honesty.

## Log the run

On completion, append one line so later analysis can grade this skill:

```bash
skill-run-log /tangle-blockchain-blueprint --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| `cargo check` or tests come back red | `/converge` | the failing crate/test + the last green SHA |
| Protocol or runtime behavior changed | `/verify` | the deploy/register/request/approve/job proof commands + their output |
| The service spans more than one user or tenant boundary | `/harden` | the boundary + the auth path that enforces it |
| Docs-only work with ≥1 product-specific claim | `/docs-slop-audit` | the pages + the source files behind each claim |
| UI changed | `/ui-test` | the routes + one non-mocked happy path |
