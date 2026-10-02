---
name: tangle-ops
description: Diagnose Tangle production health, deployment failures, provisioning, credentials, and startup latency.
---

# Tangle Ops

Read live state for the requested product and environment before changing it.
Use the maintained [operator tool](https://github.com/drewstone/tangle-tools/tree/main/tangle-ops) and its current help.
Confirm its repository mapping and target; a healthy response from another product is irrelevant.

Start with `tangle-ops status` for the overview, then the command that addresses the observed symptom.
If the tool is unavailable, use the owning repository's runbook and current probes rather than inferring health.

## Diagnose the actual failure

| Symptom | Evidence needed |
|---|---|
| Failed deployment or blocked PR | Exact failed or cancelled step and its logs |
| Product stuck provisioning | Product request, admission state, and the corresponding sandbox create result |
| Slow startup | Measured production timing and warm-claim results across representative requests |
| Environment drift | Configured target plus live credential and service checks |
| Inaccessible host or admin endpoint | Current allowed access route and its read-only probe |

Keep unavailable, unreadable, and indeterminate checks distinct from healthy results.
An empty log is not evidence of success; try the owning tool's log retrieval path and retain the failure reason.
A cancelled run is incomplete evidence; inspect its cause before rerunning it.

## Trace a Sandbox execution

For a failed, slow, or unexpectedly long turn, run tangle-ops trace <execution-id>; use trace-stats for trends.
Trust totalMs only when its bounds show sandbox_execution_ledger or builder_timeline.
Treat replayed /events durations as observer evidence; they do not set execution end.
The host egress reader returns bounded rejection classifications and variable names; full logs and values stay on host.

## Check native CLI delivery and authentication

For native CLI version failures, read the [Nix CLI pins](https://github.com/tangle-network/agent-dev-container/blob/develop/infra/nix/agent-clis.nix), [signed profile publication](https://github.com/tangle-network/agent-dev-container/blob/develop/.github/workflows/nix-profile.yml), and [host activation](https://github.com/tangle-network/agent-dev-container/blob/develop/scripts/update-host-agent.sh).
The managed Docker path mounts host Nix tools into the sandbox.
An OCI image change or profile publication does not prove that a fresh sandbox runs the new CLI.
Bind the receipt to the signed closure, source identity, active host profile, and actual CLI version in a fresh sandbox.
Check [image and Sidecar capture proofs](https://github.com/tangle-network/agent-dev-container/blob/develop/apps/orchestrator/src/driver/host-capture-proof.ts) separately from the CLI profile.

For subscription authentication, read the [auth reference and materialization contract](https://github.com/tangle-network/agent-dev-container/blob/develop/packages/cli-agent-registry/src/cli-auth-bundle.ts).
Transport validation accepts supported secret references; the private executor resolves them into native authentication material.
A validated reference does not prove login or model execution.
Keep credential values outside profiles and traces.

## Preserve operational constraints

- Probe the same request path as the product, including idempotency headers and auth identity.
- Test credential validity without exporting credential values; presence alone does not establish validity.
- Use the secret owner's current runbook and strict decryption behavior.
- Keep host administration on the configured access path; public routes and host-local administration use different authority.
- Track test resources and confirm their deletion after the probe.

Read the repository's current deployment workflow before selecting the integration and production branches.
A deployment step passing does not override a failed product journey or recovery check.

## Prove recovery

Repeat the failing product flow on the deployed target and inspect its final artifact or state.
For latency changes, retain the measurement conditions and compare the same production path.
For provisioning changes, confirm the created resource works and cleanup completes.

Report the cause, change, live result, and any checks that could not run.
Do not convert unknown health into success by repeatedly probing until one request passes.

## Log the run

```bash
skill-run-log /tangle-ops --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `slack-alerts` when unresolved recurring notifications need producer-level investigation.
- `deploy-proof` when deployment completed and serving behavior remains to prove.
- `ground-truth` when startup or runtime latency lacks a complete production breakdown.
- `verify` when the operational fix works and repository delivery checks remain.
