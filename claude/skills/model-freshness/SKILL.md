---
name: model-freshness
description: Check current model availability and actual served identity before choosing or changing models.
---

# Model Freshness

A catalog entry proves discoverability; a successful response does not prove which model served it.
Check both current availability and the identity that actually answered on the product's route.

## Inspect current declarations and routing

Read the maintained [model-freshness tool](../../tools/model-freshness) before running it, including its product registry and supported options.
Use its JSON output when comparing declaration sites and live outcomes:

```bash
model-freshness --json
```

The tool sends real requests and can incur usage.
Use its configured sources only when they cover the requested product; inspect missing or unreadable source reports before treating coverage as complete.
For model families or providers outside that registry, consult current official releases and probe the product's actual route.

## Interpret the result

Compare the requested identity with the returned model and routing metadata.
Distinguish a substituted response, unavailable route, missing catalog entry, unreadable source, and a newer available option.
A newer catalog entry is a candidate to check, not proof that its route works or that it meets the product's needs.

When choosing a model, use current supported options that satisfy the required quality, capability, cost, and latency.
Keep an intentional product choice when its evidence still supports it.
Do not change model families merely to make a freshness report quiet.

## Correct the cause

For quota or credential failures, inspect the route's actual error and the credential owner's runbook.
For a retired or unavailable model, select and probe a supported replacement.
Inspect the router's current configuration before assuming a route is absent or adding a mapping.
Preserve fallback behavior required by product policy; make substitutions visible and test the intended failure behavior.

Update every affected declaration and test through the product's existing constants.
Re-run the live request and affected product checks after a change.
Report requested and served identities, source coverage, remaining substitutions, and the tested product outcome.

## Log the run

```bash
skill-run-log /model-freshness --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `refresh-reasoning-capabilities` when the chosen model or backend changes supported reasoning controls.
- `eval-engineering` when a replacement needs a representative quality comparison.
- `deploy-proof` when the updated model configuration has shipped and live adoption remains to prove.
