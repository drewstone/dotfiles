---
name: refresh-reasoning-capabilities
description: Re-measure what reasoning efforts each agent CLI and model actually accepts, and update the committed capability table when the tools have moved. Use when a harness or model is added, a CLI is upgraded, a reasoning level silently fails or gets ignored, or the capability drift gate reds.
---

# Refresh the reasoning-capability table

Reasoning effort is a property of a **(harness, model, CLI version)** triple, not
of a harness. Hand-written tables drift against that silently, and the failures
are quiet ones: a level the tool would accept gets refused by our mapper, or a
level the tool ignores gets sent and nothing notices.

Measured examples of both, all found by asking the tool instead of reading our
own code:

- codex accepted `none` while our mapper threw on it, so "turn thinking off"
  failed the turn.
- pi shipped `max` while our mapper threw on `ultracode`, capping the ceiling.
- claude does not reject an unknown `--effort` — it warns on stderr, exits 0,
  and runs the turn at the default. Every level outside its vocabulary is a
  silent substitution.

## Three rules, each learned by getting it wrong

**Never edit the table from memory, a changelog, or a model card.** Every row
is a measurement.

**Probe the binary this repo ships, not the one on PATH.** They disagree
constantly: a workstation ran codex 0.146.0 / claude 2.1.221 / pi 0.83.0
against an image pinning 0.145.0 / 2.1.218 / 0.81.1, and `kimi` on that PATH
was **Kimi Code** — a different product from the **MoonshotAI kimi-cli** the
flake pins, with a three-tier `k3` ladder instead of kimi-cli's boolean
`--thinking/--no-thinking`. A table measured off PATH described software no
customer runs. The prober resolves the pinned Nix store realization; the gate
reds if a committed row's version ≠ the repo's pin.

**An enumeration can under-report.** codex rejects `ultra2` with a list that
stops at `max`, yet accepts `ultra` end-to-end and echoes `reasoning effort:
ultra` in its session header. Values the canonical ladder needs are confirmed
with a real turn rather than deleted on the enumeration's say-so.

## Refresh

From the agent-dev-container repo root:

```bash
node scripts/probe-reasoning-capabilities.mjs                  # human table
node scripts/probe-reasoning-capabilities.mjs --harness codex  # one harness
node scripts/probe-reasoning-capabilities.mjs --out docs/reference/reasoning-capabilities.json
```

Each prober makes the tool name its own set — an invalid value so the error
enumerates the valid ones, or the CLI's own `--help`. Never a config file: the
config that made the kimi row wrong belonged to a product we do not ship. A CLI
that is absent, unauthenticated, or unrunnable is reported `unprobed` with the
reason; that is not a failure, and it must never be recorded as "supports
nothing".

Probing costs real API turns where a value has to be confirmed end-to-end
(codex `ultra`, one turn per model), so refresh on a version bump, not on a
whim.

## Verify

```bash
node scripts/check-reasoning-capabilities.mjs           # structure (no CLIs needed)
node scripts/check-reasoning-capabilities.mjs --probe   # re-measure and diff
```

The structural check runs in `check:invariants`. The `--probe` pass is for
machines that actually have the CLIs: it fails when a harness this machine can
measure disagrees with the committed answer, and deliberately ignores rows it
cannot measure so a partial toolchain can never delete a good row.

## When a value changed

1. Re-run the probe and commit the regenerated document.
2. Update the mapper's vocabulary in
   `packages/sdk-provider-cli-base/src/reasoning-effort.ts` so no mapper can
   emit a value outside the measured set, and keep the provenance comment in
   step with the new measurement.
3. Run the contract suite in `packages/sdk-provider-cli-base` — it walks every
   harness × every canonical level (× model rules) and fails on an
   out-of-vocabulary emission, a non-monotonic mapping, or an undocumented
   throw.

## Adding a harness

Add one probe function keyed by harness id in
`scripts/probe-reasoning-capabilities.mjs`, resolving its binary through
`resolveHarnessBinary({pname, bin})` so it measures the shipped version. Rows
carry `status`, the resolved `binary`, `version`, `pinnedVersion`,
`resolvedFrom`, and either `native` values or an `unprobed` reason. If the pin
lives somewhere `shippedVersions()` does not read yet, teach it that source —
a row with no resolvable pin fails the gate on purpose.

Capture both streams. A harness that warns-and-continues prints its vocabulary
on stderr while exiting 0; reading only stdout-on-success loses exactly the
harnesses whose behaviour is most dangerous.

If a harness has no per-invocation control at all, record that as the finding —
a binary shape (`shape: "binary"`) is a real answer, and marking it explicitly
is what stops a mapper inventing tiers that do not exist.
