---
name: tangle-ops
description: Diagnose Tangle production health and run incidents: recurring infrastructure alerts, deployment failures, provisioning, credentials, and startup latency.
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

## Run an incident

An incident is a failure a customer or the synthetic customer turn can see, including a fix that cannot ship.
1. **Declare it within 10 minutes of the first failing signal.** Name one incident commander (by default the session that owns the fix), the start time from the system's own record, and the symptom users see.
2. **Send a status every 15 minutes** until recovery: the symptom now, the current blocker and its owner, and the next action with its minute.
3. **At T+15, list the mitigations with their cost**, even when a fix looks close: roll back the deploy, turn the change off with a flag, switch the model or route, or ship forward. For each, say what it restores, how long it takes and what it breaks; take the fastest one that restores users, and let the fix follow.
4. **Own every blocker the minute it blocks the fix.** A red base branch, a flaky test, a usage limit, a required version PR or a held runner gets an owner and a next action, never a wait; move to another seat, host or route rather than idle behind a limit.
5. **Recovery is a passing check on the real path**, such as the synthetic customer turn, not a merged PR or a green deploy step.
6. **Within a day, write the postmortem** from [the incident reference](references/incident.md): where the time went, drawn with `viz waterfall`, the causes behind the cause, and corrective actions with owners.

## Investigate recurring alerts

For recurring infrastructure alerts, read `#infra-alerts` and `#router-alerts` across the relevant incident window with the available Slack read and search tools; inspect their contracts instead of assuming tool names or pagination limits.
Follow threads and resolution messages, group messages by producer and incident key, and record the newest occurrence and whether a later result resolves it.
Read [producer discovery](references/alert-producers.md) to trace an alert to its current producer; confirm filenames, schedules, hosts, and dispatch inputs before acting on an older message.

Read the failing workflow step or host journal and connect the message to its actual condition, then fix that cause in the producer's repository through its current deployment procedure.
Preserve incident identity when a producer is renamed so existing incidents can resolve.
Changing wording or removing a notification does not resolve the underlying failure.
Automatic approval of an investigation does not authorize new outbound messages; before manually dispatching a workflow, inspect its side effects, including automatic Slack posts.
After a fix, verify the next real producer result and its resolution behavior; when success is intentionally silent, inspect the successful run and observe one full repeat interval before claiming recurrence stopped.
Historical messages remain incident evidence; editing a message is a separate authorized action.

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

- `ship` when deployment completed but served behavior remains unverified.
- `ground-truth` when startup or runtime latency lacks a production breakdown.
- `verify` when the operational fix works and repository delivery checks remain.
