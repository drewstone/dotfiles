---
name: tangle-ops
description: Reconcile the real state of blueprint-agent and its sandbox platform in one pass — production health, provisioning, deploy failures, credential drift, warm-container performance — before changing anything. Use when a deploy is red, the product is slow or hanging, a check is failing, or someone asks "is it working".
---

# tangle-ops

**Run `tangle-ops status` first. Always.** Before reading a dashboard, a prior session's claim, or a CI badge — all three go stale in minutes here, and every hour lost on this stack has gone the same way: reading a signal that named a *symptom*, believing it, and fixing the wrong thing.

```bash
tangle-ops status          # production, provisioning, runners, open PRs, last deploys
```

## The one rule

**A check that cannot run must not look like a check that passed.**

Every command reports a third verdict — `INDETERMINATE`, `UNREADABLE`, `not-on-this-origin` — rather than collapsing "I could not determine" into "fine". That collapse is the most repeated defect in this codebase, catalogued 17 times in a single session. When a command says INDETERMINATE, that is the answer; do not retry until it looks green.

## Route the symptom

| symptom | command | what it actually tells you |
|---|---|---|
| a deploy is red | `tangle-ops deploy develop` | the failing **step**, not the job |
| need the log | `tangle-ops joblog <run-id>` | `gh`'s own `--log-failed` returns **zero bytes** here |
| PR won't merge | `tangle-ops ci bp` | real failure vs a cancelled job (which means nothing) |
| product hangs on "Processing" | `tangle-ops pause` then `tangle-ops sandbox` | provisioning blocked, or creates broken |
| starts feel slow | `tangle-ops warm prod 24` | warm hit rate; warm is worth ~4s a start |
| "works in prod, not staging" | `tangle-ops drift` | a credential can be **present and revoked** |
| something looks stuck | `tangle-ops orch staging /staging-cell/status` | the orchestrator's own view |

## Five traps, each of which has cost hours

**A cancelled job is not a failure.** GitHub reports it as `fail`, it blocks a merge identically, and `gh run rerun --job` refuses it. A cancelled **run** reruns fine. Believing otherwise led to pushing empty commits to force CI, and one captured a half-merged tree and silently reverted 59 files of merged work. Use `tangle-ops rerun`, never an empty commit.

**Probing one arm of the sandbox API proves nothing about the other.** A create with an `Idempotency-Key` takes a different server path than one without. On 2026-08-05 only the keyed arm was broken — so every *product* create failed while every hand-rolled `curl` succeeded, and it survived a day of debugging. `tangle-ops sandbox` runs both arms and confirms its own cleanup.

**The orchestrator admin server is not public.** It binds `127.0.0.1:4096`; `orchestrator.tangle.tools/admin/...` returns **404**, which reads like a missing route rather than "you are not on the host". Its `ADMIN_API_KEY` lives only in the container and is a *different* credential from the public API's, on a different port. `tangle-ops orch` runs the call on the box so the key never moves.

**A present credential can be a revoked one.** A rotation replaced a shared token in production and skipped staging; the file still held a value, so every presence check passed while the provider answered `401` for four days. `tangle-ops drift` exercises credentials rather than checking for them.

**Secrets are dotenvx-encrypted.** `grep DATABASE_URL ~/company/devops/secrets` finds nothing and reads as "we have no credential". Use `dotenvx get <KEY> -f <file> --strict` — plain `get` exits 0 returning *ciphertext* when the key is missing.

## Verifying a claim about production

Production is `https://ai.tangle.tools`. **Not** `app.tangle.tools` — that is the Tangle dApp, a different product that answers 200 with an SPA shell for any path, so probing it produces confident nonsense.

The production database has no shell route: Hyperdrive stores the origin password write-only. Query it through the Worker's ops facility — `GET /api/admin/ops/query/<name>` with the service token, registered queries only, never caller-supplied SQL. `tangle-ops hyperdrive` shows the origins and says so.

## Before you claim something is fixed

Deploys go `develop` → staging → `main` → production. Staging runs three product probes, and only one of them is the core journey:

- `Migrate & Deploy` — the code shipped
- `Verify staging browser flow` — **prompt → rendered preview**, the actual product
- `Verify staging session recovery` — reprovision after a dead container

`Migrate & Deploy` passing while a probe fails is a **product outage reported as a deploy failure**. That exact misreading hid a twelve-hour outage.

Any sandbox you create to test, you delete, and you confirm the delete returns 404 — they cost real money and orphans accumulate. `tangle-ops sandbox ls` finds ones nobody cleaned up.

## Then consider

- If the problem is inside `agent-dev-container` — fleet health, host drift, settlement backlog, release seeds — invoke the **`adc-infra-triage`** skill next. It goes deeper on the platform than `tangle-ops` does, and its `triage.sh` dumps both environments in one pass.
- If a number you are about to report came from a single sample, or from a machine under load, re-run it before it becomes a claim. Under load average >100 this repo's unit suite fails *different files each run with zero failing assertions*; check `cut -d' ' -f1-3 /proc/loadavg` before believing a full-suite failure.
