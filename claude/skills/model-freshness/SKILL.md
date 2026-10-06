---
name: model-freshness
description: Check current model availability, actual served identity, and the reasoning controls the deployed model and CLI accept before choosing or changing models.
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

## Measure reasoning controls

When a model or execution backend change can alter supported reasoning controls, measure what the deployed model and CLI accept.
A local CLI, another model, or a successful exit with a warning does not establish deployed support.
In agent-dev-container, use the maintained [probe](https://github.com/tangle-network/agent-dev-container/blob/develop/scripts/probe-reasoning-capabilities.mjs) and [consistency check](https://github.com/tangle-network/agent-dev-container/blob/develop/scripts/check-reasoning-capabilities.mjs); they own binary resolution, supported arguments, and the generated capability record.

Run the probe for the affected backend against the binary the project ships, not an unrelated executable on PATH.
Capture stdout, stderr, exit status, and observed model identity; confirm a disputed setting with a real turn when enumeration is incomplete or a CLI may silently substitute a default.
A missing binary or credential is an unmeasured case with its reason; no per-invocation control is a valid measured outcome, not an invitation to invent levels.
Use existing authorization and a bounded smoke before paid probes.

Regenerate the owning capability record from the probe result, keeping the measured execution identity so a backend change invalidates old evidence.
Update the [shared reasoning mapping](https://github.com/tangle-network/agent-dev-container/blob/develop/packages/sdk-provider-cli-base/src/reasoning-effort.ts) only when a measured change requires it, then run the consistency check and affected mapper contract tests.
Report changed support, silent substitutions, unmeasured cases, and the checks run.

## Log the run

```bash
skill-run-log /model-freshness --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `eval-engineering` when a replacement needs a representative quality comparison.
- `ship` when the updated model configuration has shipped and live adoption remains to prove.
