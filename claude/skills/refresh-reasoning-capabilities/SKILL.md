---
name: refresh-reasoning-capabilities
description: Measure the reasoning controls accepted by the deployed model and CLI, then update their maintained mapping.
---

# Refresh Reasoning Capabilities

Measure the controls accepted by the actual model and execution backend.
A local CLI, another model, or successful exit with a warning does not establish deployed support.

## Use the maintained probe

In agent-dev-container, read the current [probe](https://github.com/tangle-network/agent-dev-container/blob/develop/scripts/probe-reasoning-capabilities.mjs) and [consistency check](https://github.com/tangle-network/agent-dev-container/blob/develop/scripts/check-reasoning-capabilities.mjs).
These own binary resolution, supported arguments, and the generated capability record.
Use them instead of writing a second table or carrying CLI release numbers in instructions.

Run the probe for the backend affected by the model or image change.
Resolve the binary shipped by the project, not an unrelated executable on PATH.
Capture stdout, stderr, exit status, and observed model identity.
When enumeration is incomplete or a CLI may silently substitute a default, confirm the disputed setting with a real turn.

A missing binary or credential is an unmeasured case; preserve its reason and existing evidence.
No per-invocation control is a valid measured outcome, not an invitation to invent levels.
Use existing authorization and a bounded smoke before paid probes.

## Update and verify

Regenerate the owning capability record from the probe result.
Keep the measured execution identity in that record so a backend change invalidates old evidence automatically.
Update the [shared reasoning mapping](https://github.com/tangle-network/agent-dev-container/blob/develop/packages/sdk-provider-cli-base/src/reasoning-effort.ts) only when a measured change requires it.

Run the current consistency check and affected mapper contract tests.
On a machine with the required executables, re-probe and compare the record.
Report changed support, silent substitutions, unmeasured cases, and the checks run.
Existing machine-readable provenance is required for correctness; a separate manual version worksheet is not.

## Log the run

```bash
skill-run-log /refresh-reasoning-capabilities --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `model-freshness` when a probe reveals a substituted or unavailable model route.
- `verify` when the mapping and capability record agree and release checks remain.
