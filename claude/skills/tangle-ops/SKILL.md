---
name: tangle-ops
description: Diagnose Tangle production health, deployment failures, provisioning, credentials, and startup latency.
---

# Tangle Ops

Read live state for the requested product and environment before changing it.
Use the maintained [operator tool](https://github.com/drewstone/tangle-tools/tree/main/tangle-ops) and its current help.
Confirm its repository mapping and target; another product's healthy response proves nothing here.

Use the narrow command for a known symptom; use `tangle-ops status` when the failing surface is unknown.
For a long release or repeated status checking, read [work duration](references/work-duration.md) and its cached history command once.
If the tool is unavailable, use the owning repository's runbook and current probes.

## Diagnose the actual failure

| Symptom | Evidence needed |
|---|---|
| Failed deployment or blocked PR | Exact failed or cancelled step and its logs |
| Product stuck provisioning | Product request, admission state, and sandbox create result |
| Slow startup | Production timing and warm-claim results across representative requests |
| Environment drift | Configured target plus live credential and service checks |
| Inaccessible host or admin endpoint | Current allowed access route and read-only probe |

Keep unavailable, unreadable, and indeterminate checks distinct from healthy results.
An empty log is not success; use the owning log-retrieval path and retain the failure reason.
Inspect why a run was cancelled before rerunning it.

## Trace a Sandbox execution

For failed, slow, or unexpectedly long turns, run `tangle-ops trace <execution-id>`; use `trace-stats` for trends.
Trust `totalMs` only when timing bounds identify `sandbox_execution_ledger` or `builder_timeline`.
Replayed `/events` durations are observer evidence, not execution end.
The host egress reader returns bounded rejection classes and variable names; keep full logs and values on host.

## Check native CLI delivery and authentication

For native CLI version failures, read the [Nix pins](https://github.com/tangle-network/agent-dev-container/blob/develop/infra/nix/agent-clis.nix), [signed profile workflow](https://github.com/tangle-network/agent-dev-container/blob/develop/.github/workflows/nix-profile.yml), and [host activation](https://github.com/tangle-network/agent-dev-container/blob/develop/scripts/update-host-agent.sh).
The managed Docker path mounts host Nix tools into the sandbox.
An image change or profile publication does not prove a fresh sandbox runs the new CLI.
Bind the receipt to the signed closure, source identity, active host profile, and actual CLI version in a fresh sandbox.
Check [image and Sidecar capture proofs](https://github.com/tangle-network/agent-dev-container/blob/develop/apps/orchestrator/src/driver/host-capture-proof.ts) separately from the CLI profile.

For subscription auth, read the [auth and materialization contract](https://github.com/tangle-network/agent-dev-container/blob/develop/packages/cli-agent-registry/src/cli-auth-bundle.ts).
Transport validation accepts supported secret references; the private executor resolves them to native authentication material.
A validated reference does not prove login or model execution.
Keep credential values outside profiles and traces.

## Preserve operational constraints

- Probe the product's real request path, including idempotency headers and auth identity.
- Test credential validity without exposing values; presence alone proves nothing.
- Follow the secret owner's current runbook and strict decryption behavior.
- Keep host administration on its configured access path; public routes use different authority.
- Track test resources and confirm cleanup.

Read the current deployment workflow before selecting integration or production branches.
A passing deploy step does not prove the product journey or recovery path works.

## Prove recovery

Repeat the failed journey against the deployed target and inspect its final state.
For latency changes, compare the same production path and conditions.
For provisioning changes, confirm the created resource works and cleanup completes.
Do not turn unknown health into success by probing until one request passes.

Report the cause, change, live result, and checks that could not run.

## Log the run

```bash
skill-run-log /tangle-ops --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `slack-alerts` when recurring notifications need producer-level investigation.
- `ship` when deployment completed but served behavior remains unverified.
- `ground-truth` when startup or runtime latency lacks a production breakdown.
- `verify` when the operational fix works and repository delivery checks remain.
