---
name: model-freshness
description: Check current model availability, actual served identity, and the reasoning controls the deployed model and CLI accept before choosing or changing models.
---

# Model Freshness

Excellent model hygiene puts the strongest model that meets the product's quality, cost and latency needs on every route, and proves from the response which model actually answered.
A catalog entry proves discoverability; a successful response does not prove which model served it.

## Inspect current declarations and routing

Read the maintained [model-freshness tool](../../tools/model-freshness) and its product registry before running `model-freshness --json`; it sends real requests and can incur usage.
Inspect missing or unreadable source reports before treating coverage as complete; for families or providers outside the registry, read current official releases and probe the product's real route.

## Interpret the result

Compare the requested identity with the returned model and routing metadata, and distinguish a substituted response, unavailable route, missing catalog entry, unreadable source and a newer candidate, which is not yet proof its route works.
When choosing, name the best available model for the task with its published or measured results, measure the product's quality, cost and latency on it, and adopt it when it beats the current choice; keep an intentional choice while its evidence holds, and never switch families only to quiet a report.

## Correct the cause

For quota or credential failures, read the route's actual error and the credential owner's runbook; for a retired or unavailable model, select and probe a supported replacement.
Read the router's current configuration before assuming a route is absent, and keep the fallback behavior product policy requires, with substitutions visible and the intended failure behavior tested.
Update every affected declaration and test through the product's existing constants, rerun the live request and product checks, and report requested and served identities.

## Measure reasoning controls

When a model or backend change can alter supported reasoning controls, measure what the deployed model and CLI accept; a local CLI, another model, or an exit 0 with a warning does not establish deployed support.
Capture output, exit status and observed model identity, and confirm a disputed setting with a real turn.
A missing binary or credential is an unmeasured case with its reason; no per-invocation control is a valid measured outcome.
Run a bounded smoke before paid probes.

## Log the run

```bash
skill-run-log /model-freshness --target "<target>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A replacement needs a representative quality comparison | `/eval-engineering` | the models, route and decision |
| The updated configuration shipped and live adoption remains to prove | `/ship` | the served revision and route |
