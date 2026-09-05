---
name: tangle-blockchain-blueprint
description: Build or review on-chain Tangle Blueprint services, operator behavior, and product integration.
---

# Tangle Blockchain Blueprint

Use this for on-chain Blueprint protocol and service behavior.
Agent apps and general sandbox infrastructure have different ownership and are outside this skill.

## Resolve protocol and product evidence

Start with the maintained [Blueprint documentation](https://github.com/tangle-network/docs/tree/main/pages/developers/blueprints) and [Blueprint SDK](https://github.com/tangle-network/blueprint).
Read the current introduction, service lifecycle, and relevant operator or application guide.
Follow their contract links to the protocol implementation used by the product.
Check the selected chain and deployed contracts before claiming behavior is live.

Inspect the product repository before claiming it supplies an indexer, operator API, TEE, settlement process, or hosted application.
A roadmap or shared protocol component does not establish that the product implements it.

## Preserve the domain boundaries

- A blueprint defines the template, metadata, jobs, artifacts, and application policy.
- Operator registration advertises ability to serve the blueprint.
- A service creation flow selects operators and parameters under the protocol's current request or quote contract.
- The service instance is the live configured unit the user interacts with.
- Jobs change service state; ordinary reads use contracts, protocol indexing, or an operator API as appropriate.

Distinguish on-chain enforcement from hosted behavior and protocol state from runtime health.
Document which repository owns each claimed artifact.
For stateful or custodial services, inspect expiry, operator changes, renewal, and exit behavior before assuming execution continues indefinitely.

## Validate the changed behavior

For protocol or runtime changes, use the repository's current checks and a production-like deploy, register, create-service, and job flow.
Exercise the creation path actually used by the product, including request approval or quotes where relevant.
Test tenant authorization when the service spans users or accounts.
For UI changes, build and click through the actual contract or operator integration.
For documentation changes, verify each substantive claim against source and run the owning docs checks.

Report source and deployment evidence, exact checks, retained domain boundaries, and any behavior not exercised.

## Log the run

```bash
skill-run-log /tangle-blockchain-blueprint --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `converge` when the required checks fail.
- `harden` when a changed tenant, operator, custody, or contract boundary needs adversarial tests.
- `docs-slop-audit` when product documentation needs claim-by-claim review.
- `ui-test` when visible service flows need broader interaction coverage.
- `verify` when implementation is complete and release proof remains.
