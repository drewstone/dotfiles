# Handoff: agent-dev-container — 2026-08-13

## State at close

**Customer path healthy on both environments** — create 201, n=3/env (prod p50 2,858 ms; staging p50 10,583 ms).
**10 fixes merged** to main + develop. **3 are not yet live on prod** (merged, blocked behind the deploy queue).

## What was wrong and what fixed it

| # | Defect | Fix | Live? |
|---|---|---|---|
| 1 | Legacy keys (99.8% of active) could not create — ~20h SEV1, 502 `PLATFORM_DELEGATION_REQUIRED` | platform `keys.delegate()` mints a non-delegated ROOT for eligibility-proven user legacy keys | yes |
| 2 | Legacy sandbox meta failed the child-lineage check → 500 `USAGE_TRACKING_FAILED` | legacy meta persists NEITHER attribution (OMIT-BOTH) | yes |
| 3 | Legacy router root had no spend cap | $1000 cap (`DELEGATED_CHILD_KEY_BUDGET_USD`), no TTL (running creds are re-keyed only at create/resume) | yes |
| 4 | `tangle-intel` bin → gitignored dist broke `pnpm install` (360 alarm runs) | committed launcher, matching `packages/librarian` | yes |
| 5 | Deleted Hetzner SSH key blocked every autoscale birth (201 alarm runs) | dropped the dead key from both secret stores + the box `.env`; fleet grew 1 host/20 slots → 2/38 | yes |
| 6 | #4780 deleted `prepareAgentCliHomesAtStartup()` — every cold box since 2026-08-05 had no `$HOME/.config/opencode` | restored + boot-wiring test | merged |
| 7 | SSH bootstrap exec hardcoded 10s → any 1-CPU SSH create 500'd at ~39s | named 45s `SSH_BOOTSTRAP_EXEC_TIMEOUT_MS`, env-overridable | merged |
| 8 | Sidecar launch-readiness baked 15s in-container (sibling of #7) | named env-overridable constant | merged |
| 9 | Container-start failure class laundered into generic `PROVISION_FAILED` | propagate `CONTAINER_START_FAILED`; status stays 500 (SDK retry keys on status) | merged |
| 10 | **Production took no runtime deploy for ~14h** — guard demanded target sha == main tip at RUN time, but a deploy waits ~25 min for a runner while main moves (124 commits/24h, p50 gap 185s, guard also called inside two 900s poll loops) | MERGED (main contains target) + FORWARD-ONLY (target contains what `/version` serves) — monotone, and strictly safer than equality | merged |

## Verification still owed

1. cpu-1 + SSH create on prod must flip **500 → 201** (repro: `POST /v1/sandboxes {environment:"universal", sshEnabled:true, sshPublicKeys:[…], resources:{cpuCores:1, memoryMB:2048, diskGB:2}}`).
2. A cold-created box must contain `/home/agent/.config/opencode/opencode.jsonc`.
3. Both deployed smokes green (`sandbox-staging-smoke.yml`, targets production + staging).

## Traps learned today (each cost real time)

- **A green customer probe does NOT prove your build is serving.** Staging auto-rolled-back from the build carrying the fixes to a 2-day-old one; create still returned 201. Always re-read the serving sha.
- **deploy.yml auto-rolls-back on smoke failure** — when the SMOKE is what you are fixing, the loop reverts the fix that would green it.
- **The repo default branch is `develop`**: `gh workflow run deploy.yml` without `--ref main` runs the workflow from develop and the current-main guard rejects it.
- **`-f ref=` must be a full 40-hex sha**, never `main`.
- **Fresh worktrees fail preflight for environment reasons** (`turbo not found`, unbuilt `runtime-contracts`/`cli-agent-registry` dists) — run `CI=true pnpm install` and build those deps; it is never your change.
- **Bash tool default timeout is 2 min**; the pre-push hook plus transfer exceeds it — pass an explicit longer timeout or the push dies mid-flight.
- **12+ runtime files trips the ROADMAP gate** — add an entry rather than using the `no-roadmap:` escape.

## Deliberately NOT shipped

The naive in-container-credential guard (`pbs==='sandbox'` + `auto:` prefix) alone **breaks workflow sibling spawn** and every test suite stays green through that regression. Shipped only after splitting the authority (run-scoped `auto:script-sibling-sandbox:<runId>` in the exec env) and measuring the blast radius: **0 of 415 stored workflows reference `TANGLE_API_KEY`**. Never key on the `auto:` prefix alone — the production canary is `auto:user:sandbox:production-canary-*`.

## Open, unexplained

- **Staging create is 3.7× prod** (10.6 s vs 2.9 s p50). Never investigated; nobody watching it.
- Staging deploy failed again at close — likely the auto-rollback loop, unconfirmed.
