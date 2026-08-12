# Handoff: agent-dev-container — 2026-08-11 (UPDATED evening)

## LATEST STATE (evening ~21:45 UTC) — READ THIS FIRST, the morning section below is history

**A SECOND prod outage happened this evening and is now FIXED + PROVEN.** Same class as the
morning ACL outage, deeper root cause found.

**Verdict:** prod creates were 100% down (HTTP 500/521, orchestrator crash-loop restart 95) on Redis
`WRONGPASS`, while `/health` stayed green. Root cause: a deploy left **redis running bare** (no
`--aclfile`, no `users.acl` mount) because `scripts/deploy.sh` regenerates `docker-compose.yml` with a
bare redis every deploy and never includes the host-managed `docker-compose.redis-acl.yml`; also
`REDIS_ADMIN_PORTAL_PASSWORD` was absent from `/opt/orchestrator/.env`, so any compose run that DID
include the override errored and fell back to bare redis. `orchestrator_service` then did not exist in
redis → WRONGPASS. Underneath that, the crash-loop left a partial host record
(`host:meta:<id>` present, `host:<id>` absent) that rejected re-registration with *"incomplete
controller-owned registration state"*.

**Fixed on the box (`95.216.8.253`, host `95.217.35.250`), each step proven:**
1. Extracted `REDIS_ADMIN_PORTAL_PASSWORD` from the running `admin-portal` container, verified
   `sha256 == users.acl` hash, added it + `COMPOSE_FILE=...:docker-compose.redis-acl.yml:...` to `.env`.
2. `docker compose up -d --force-recreate redis` → redis now runs `--aclfile`; `AUTH orchestrator_service` → **OK**.
3. Recreated orchestrator → **0 WRONGPASS**, healthy.
4. `DEL host:meta:production-host-agent-01` (remnant) + `docker restart host-agent` → **"Successfully registered with orchestrator"**, heartbeats 200.
5. **Ground-truth proof:** real customer create `POST https://sandbox.tangle.tools/v1/sandboxes` → **HTTP 201 in 9.3s**, then deleted (0 orphans).

**Durable fix = PR #5177** `fix/deploy-redis-acl-survives-deploy` → base develop (branched off `ce104d370d`):
deploy.sh carries the ACL override in `COMPOSE_FILE` when present, requires `REDIS_ADMIN_PORTAL_PASSWORD`
fail-closed, and adds a **redis auth gate** after the swap (explicit `AUTH user pass`, NOT `PING` — a bare
redis default user is nopass and answers PING, hiding the outage; self-heal once, else abort). Proven
against real redis containers: ACL+correct→PASS, wrong-pw→abort, no-creds→skip, **bare-redis→abort**.
`bash -n` clean. Memory updated: `project_redis_acl_prefix_allowlist_outage`.

**⚠️ DO NOT deploy orchestrator until #5177 lands** — the current `deploy.sh` regenerates bare redis and
re-triggers this exact outage. The box `.env` edits hold only until the next deploy rewrites `.env`.

**PR 5132** (`fix/require-verified-email`, billing) — CI **green** (all checks pass) but **CONFLICTING**
with develop: 6 files, incl. a real **drizzle migration collision** (develop `0056_melodic_hydra.sql`
vs 5132 `0056_tense_shatterstar.sql`) + `account-access.ts` + `server.ts`. Resolution: rebase onto
develop, renumber 5132's migration to **0057**, regenerate `_journal.json`/`0056_snapshot.json` via
drizzle-kit (NOT a hand-merge — schema-drift risk). Left unresolved deliberately (careful task, not a
handoff-tail rush).

**Still open from the morning that remain true:** `/health` blind to create outage (the class behind
BOTH outages — highest-value fix, unbuilt); Redis ACL + override in no repo; autoscale; reclaimer
dry-run. See the morning open-loops table below.

---

# Handoff: agent-dev-container — prod outage, release unblock, staging repair — 2026-08-11 06:40 UTC (HISTORY)

**State at 06:40 (SUPERSEDED — prod went down again that evening, see top):** prod `main=96b152446cce` serving, `/health ok`, canary success ×2 (06:02, 06:29), 6/6 live creates pass. Staging `4396f8fe2606`, `/health ok`, host-agent healthy. develop is `2b4831d2ee6d`, 18 ahead of main.

## The one thing to read first
`memory/project_redis_acl_prefix_allowlist_outage.md` — prod creates returned **500 in 2ms with `/health: ok`** for 88 min. Cause: `/etc/tangle-redis/production-orchestrator/users.acl` granted `orchestrator_service` 16 key prefixes and **not `~project:*`**. Same denial broke the Lua host-migration `TYPE` call → `Failed to list registered Docker hosts` → the "0 hosts / 0 slots" and drift alarms. **Three alarms, one cause.**

Diagnose in one step (port **4095**, not 4096):
```
curl -k -X POST https://127.0.0.1:4095/projects \
  -H "authorization: Bearer $ORCHESTRATOR_PRODUCT_API_KEY" \
  -H "x-user-id: <real user id>" -d '{"projectRef":"probe"}'
```

## Shipped and verified merged (13 of 14; #5127 closed-superseded, content landed)
| PR | What | Proof |
|---|---|---|
| #5080 | desktop: `wait_until_stable`, screen OCR, window actions, office toolchain | 247 files / 3079 tests |
| #5081 | release unblock + hermetic manifest-drift invariant | replays real history: reds on both pkgs, greens with changeset |
| #5083 | pnpm store per-runner | `reused 0→1744, downloaded 1743→0` |
| #5089 / #5095 | no artifact upload gates the nix closure publish | closure published; `Deploy Preflight` passed |
| #5090 | cvv canary vs log timestamp | 6-digit value; ISO-8601 max digit-run is 4 |
| #5097 | CI-side Playwright baseline re-seed | **push still 403s — see open loops** |
| #5102 / #5103 | smoke: retry proxied billing reads; provide Chromium | — |
| #5105 / #5108 | verified-access + signup-credit gate | 4818 tests; exemption covers 161 of 164 |
| #5124 | retire hosted alarm-heartbeat schedule | replaced by cron box; all 5 alarms served |
| #5134 | E2E: 2 browser projects on PR, 5 on push | 22 min → ~9 min PR feedback |
| devops `128c72e`, `d4c5722` | local artifact store provisioned; heartbeat off GitHub | on `fix/runner-temp-reaper` |

## Open loops
| Item | State | Pointer | Next command |
|---|---|---|---|
| `/health` blind to create outage | **unfixed, highest value** | orchestrator health handler | make it write/read a `project:` key; verify by revoking `~project:*` on staging |
| Redis ACL in no repo | unfixed | `/etc/tangle-redis/production-orchestrator/users.acl` (bak-, bak2- kept) | version it; a host rebuild reintroduces the outage |
| Autoscale dead | unfixed | `not_found: SSH key not found` ×6 | fix Hetzner SSH key ref; prod is on 1 host |
| Reclaimer `dry-run` | unfixed | `LIFECYCLE_SUSPEND_ABANDON_MODE` | 37 candidates, 17 dead containers, `known=22 > cap=20` |
| #5097 re-seed push 403 | **fixed but unproven** | synced `TANGLETOOLS_GH_TOKEN` from vault (`agent-state.env`), proved push by creating+deleting a ref | dispatch `update_snapshots=true` and confirm a branch appears |
| Staging create/exec proof | never run | `staging-sandbox.tangle.tools` | same probe as prod; staging trust is unverified |
| Warm-pool scratch race | diagnosed, unfixed | `customer-storage-inventory.ts` | scratch volume counts as customer storage before its container is labelled → `force_empty_staging` needed |
| Immortal release seeds | 1 parked | `/opt/orchestrator/releases/.parked-*` | 185 records, non-terminal seeds back to 07-20; converged recovery never clears `in-progress.json` |
| Artifact quota | purged, unproven | 926 GHCR versions deleted | recheck; GitHub recalculates every 6–12h |
| bp `SLACK_WEBHOOK_URL` | repointed, unconfirmed | `#infra-alerts` = `C0B9LBV73HU` | I posted a labeled probe; bot token is `account_inactive` so I could not read which channel got it |

## Traps that cost time (do not relearn)
| Trap | Reality |
|---|---|
| `lvcreate` succeeds ⇒ thin pool healthy | **False.** Only `vgchange -ay` exposes a txn-id desync (`25364 vs 25366`). |
| Runbook `host-agent-updater.sh` | Now a 2026-04 `.bak`; host-agent is restored by the ship or a hand `docker run` (15 mounts — use the array). |
| CI job "FAIL" in monitors | 5 were `CANCELLED` by concurrency, not failures. Read the rollup, not the notification. |
| `gh pr comment --body` with tables | Shell mangles it; use `--body-file`. |
| Two samples 76s apart | Cannot distinguish a stuck queue from a draining one. Settlement drained on its own. |
| Local Playwright re-seed | Rewrote 13 baselines CI considers correct; font rasterisation does not travel. Re-seed in CI only. |

## Not done / left dirty
- 8 scratch worktrees under `/tmp/claude-…` (auto-reaped).
- `~/company/devops` has 31 uncommitted SOC2 evidence files (pre-existing, not mine).
- Grandfather window for 5105: **deliberately not built** — the real cohort is 3 dormant internal accounts, not the 252 I first reported.
