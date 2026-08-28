# Handoff: agent-dev-container — 2026-08-15 ~04:30Z

**Open loops at close: 11** (table below).

## Objective and status

Standing mission: both environments fully green, deploy success → 100%.
**Customer path: GREEN on both environments** (verified live, not from checks).
**~30 PRs merged this session.** The remaining work is billing correctness, not availability.

## Ground truth at write time (re-verified, not recalled)

| thing | value |
|---|---|
| origin/main | `9af1343f4` — production serves it (built 03:11Z) |
| origin/develop | `64aff00bf` |
| staging serves | `cc5f394b5082` (built 00:22Z) — behind; lacks #5581's 409 fix |
| open release PR | #5591 `release/20260815` (9af1343f4..795622236) |
| disk | 316G free / 82% (was 1.6G at worst; ~96 worktree clones remain, 20 dirty = other agents') |

## THE HEADLINE FOR THE NEXT SESSION (corrected after full root-cause)

**Sandbox compute billing died at 2026-08-12T14:28 UTC — the minute #5132's
platform deploy landed** (`856e27077` via `de4908eb6`). NOT 7 days (that was the
oldest surviving row's age), and NOT all revenue: **router billing is fine** (it
re-mints keys per sandbox); sandbox compute is the surface at zero.

Root cause chain: `requireTrustedDeductAttribution`
(`billing-provenance.ts:381-405`) tests four columns whose migration defaults
(`0059_chief_spencer_smythe.sql:9-17`) are themselves disqualifiers; the backfill
(`key-provenance-backfill.ts:334`) repairs the one column the rule does NOT
check; #5283 added legacy tolerance to VERIFY only, so a legacy key
authenticates but cannot be billed. Third symptom of #5132 after the dashboard
outage and the CLI hub keys.

**MEASURED SPLIT BY KEY (2026-08-15 07:3xZ, prod D1 + platform DB — supersedes the
estimates below).** 29,190 rows across only **16 distinct keys**:

| key | rows | class | fate |
|---|---|---|---|
| `key_nR16VgruThRlnlfU` | **15,787** (attempts=0) | v0 / **user** / alive, no expiry | **RECOVERS** |
| `key_xQxap_dUuCAcbsMX` | 5,725 (attempts 629) | v0 / gtm-agent / revoked+expired | dead |
| `key_akAZ6MKo8-W8Yz8p` | 4,770 (attempts 629) | v0 / gtm-agent / revoked+expired | dead |
| `key_Rb-ezumXLCbwuRJm` | 2,010 | v0 / gtm-agent / revoked | dead |
| `key_lDii3l29yjgVhCrO` | 200 | v0 / **user** / alive | **RECOVERS** |
| `key_HS1FXHY-TD_vQEJB` | 151 | v0 / gtm-agent / revoked | dead |

**~15,987 of 29,190 rows (55%) recover on deploy.** The dead remainder is ALL
`gtm-agent`, which rotates keys every 24h — hence revoked AND expired.
This also CONFIRMS the review's MEDIUM finding: ~12,656 rows on four dead
service-provisioned keys retry forever, permanently unbillable, holding slots in
every 100-row page. No code change recovers them; they need parking (never
`DELETE` — money records).

Earlier estimate (superseded, kept to show the drift):

Backlog: **25,047 rows / $16.37**, growing ~3,600 rows/day, in three populations:
- **11,832 rows / $7.21 on ALIVE legacy keys — recoverable with no key
  mutation**: mirror the `keys.ts:386-395` tolerance into
  `billing-provenance.ts:403` (agent `ac8c78f5c9b07ab35` building it).
- 13,120 rows / **$9.15 on revoked+expired gtm keys — effectively dead**;
  evidence-based settlement (#5469) needs attribution that was never stored
  (`has_attr_json=0` across all 1,236 sandboxes). **Write-off vs re-attribution
  is DREW'S CALL — do not decide it.**
- 65 rows on a fully-valid key, blocked only by queue ordering.

**NEVER backfill `attribution_version=1` onto legacy keys** — the
`api_keys_v1_attribution_immutable` trigger makes it irreversible, and it
asserts lineage facts nobody knows. If wanted later it needs
`origin_kind='legacy_migrated'`.

The 403 message ("unknown, revoked, or expired") is factually FALSE for the
alive keys — the real condition is "lacks billing attribution". It was silent
for 2.6 days because the D1 queue has NO metric, NO health field, NO alarm.
The "100 of 100 identical" sample was the head of a starved queue (only 2 keys
ever attempted; 24,134 rows never tried once), not the population.

**Instrument lesson that cost ~3 agent-runs:** `wrangler tail` returns nothing
useful here. Workers Logs is enabled (`products/sandbox/wrangler.jsonc:18-20`) —
query the OBSERVABILITY API for history.

## UPDATE 06:5xZ — third mass agent death, all work recovered, three PRs open

Four agents died on the session limit mid-push/mid-verify. Recovered:

| PR | branch | state |
|---|---|---|
| ~~#5615~~ | `fix/billing-legacy-attribution-tolerance` | **MERGED 07:28Z** after an adversarial security review COULD NOT REFUTE it. The tolerance is strictly NARROWER than the verify precedent (verify: 2 terms; billing: those 2 **plus** `attributionVersion === 0`, and `provisioned_by_service` checked unconditionally where verify only applies it to product-scoped keys). av=1 double-bounded, same row object so no TOCTOU. Payer stays server-derived. **The v0 population can only shrink** — all 5 insert sites hardcode the current version and the immutability trigger blocks downgrades. Reviewer ran what the author never did: 16/16 new, 169/170 across 10 suites, tsc clean. |
| **#5614** | `fix/post-deploy-check-billing-owner` | Was already fully on remote at `11049e309`. Fixes the readiness gate + product smoke pointing a first-party SERVICE key at a create that now requires `billingOwnerId`. Its sweep of other `SANDBOX_PRODUCTION_API_KEY` consumers is INCOMPLETE. |
| **#5616** | `fix/sidecar-proxy-mcps-terminals` | Pushed and PR'd (`de8128832`). terminals PATCH 404 (route did not exist, +163 lines with a 215-line test) + audit recording no reason for a failed surface. **The `config/mcps` 500 may still be open** — the reporting half is fixed, the 500 itself is unverified. Its two initial reds were the stale base, proven not the change (both exit 0 after merging develop). |
| ~~#5614~~ | `fix/post-deploy-check-billing-owner` | **CLOSED as non-viable.** Its production path used `SANDBOX_PRODUCTION_PROVE_API_KEY`, which exists at NO scope (repo or `production` env) — only `SANDBOX_STAGING_PROVE_API_KEY` exists. develop already fixed `env-readiness.yml` better: keep the service key, name the payer via `SANDBOX_CANARY_BILLING_OWNER_ID`, tied to the canary so one rotation moves both. **REMAINING GAP:** `scripts/sandbox-product-smoke.sh` and `scripts/sandbox-cli-staging-smoke.sh` carry NEITHER strategy — extend develop's billing-owner shape, do not add a second credential strategy. |

**#5595 PROVEN LIVE:** `checks.chargeIntents` now reports on production `/health`
(degraded, depth 27,580, oldest 601,865s; top-level `status` stays `ok` by design).
Ordering is reaching the starved set — `never_tried` 23,917 → 24,391 while total
24,767 → 27,604, i.e. ~2,363 previously-starved rows attempted in ~2h. Rows stay
because every attempt still 403s; that clears when #5615 deploys.

**Deploy state:** `main = 3e92412cc` serving on BOTH halves. Platform deploy green
3x. Runtime run 31867137601 landed the code but reported failure on three
post-deploy checks — NOT an outage: bearer create 201/3.49s, session create 201,
deletes 200, verified in the same window. Two of those reds are #5614's; the third
is the browser audit **working as designed** (22 surfaces, 19 OK, 0 NOT RUN)
surfacing the real `config/mcps → 500` and terminals `404`.

**A gate that earned its place:** `check-alarm-precondition-coverage.mjs` refused
the sidecar branch because #5595's new canary probe had no test on that base —
"an alarm's probe decides who gets woken; an untested one decides it silently."

## Live lanes at close (2)

| agent | task | check |
|---|---|---|
| `a8ca42276d8e9560c` | **DONE** — root cause delivered (see corrected headline); its report is the authoritative account | output: `/tmp/claude-1000/-home-drew-code-agent-dev-container/b06897e1-*/tasks/a8ca42276d8e9560c.output` |
| `ac8c78f5c9b07ab35` | **IN FLIGHT** — the money fix: mirror verify's legacy tolerance into `billing-provenance.ts:403`, bounded to `provisioned_by_service='user'`, ledger-stamped `legacyAttribution: true`; also fix the lying 403 message. Recovers $7.21 on deploy | output: same dir, `ac8c78f5c9b07ab35.output` |
| `af0ab53ee2de1d23f` | charge-intent fairness + queue observability; its commit `2c89df976` was local-only and is now RESCUED to remote `fix/charge-intent-fairness`. CORRECTION to my earlier redirect: ordering DOES matter — 65 rows on a valid key settle on first contact, and the 800-row poison head starves the batch even after the tolerance fix | output: same dir, `af0ab53ee2de1d23f.output` |

Both were dispatched from session `b06897e1-d279-4ea8-96eb-d0ede76d56e9`. If they died
(two mass agent-deaths already this session: EAGAIN process exit, then expired login),
their worktrees under `.claude/worktrees/agent-<id>` hold the work — **check the
worktree before assuming anything landed; `git ls-remote` is the only push proof**
(the push wrapper's exit code lied 3 distinct times under load).

## Open loops — exhaustive (11)

| # | item | state | pointer | next command |
|---|---|---|---|---|
| 1 | Billing provenance 403 — root cause | agent in flight | memory `project_charge_intent_starvation` (corrected version) | read agent output; then fix platform-side or re-attribute |
| 2 | Backlog recoverability (24,679 rows) | unknown — THE decisive question | same | decided by #1's verdict |
| 3 | Charge-intent fairness + observability PR | agent in flight | `fix/charge-intent-fairness` | verify → PR → adversarial pass → merge |
| 4 | Ship gate query-window bug | UNOWNED | `d1-usage-service.ts:1626-1630`; gate polls an oldest-500 staleness audit, fresh sandbox sorts LAST behind 1,738 leaked opens (oldest 2026-03-20) | add `?sandboxId=` lookup + a reaper for leaked opens |
| 5 | Deploy staging (409 fix #5581 + everything since) | UNOWNED, no code needed | staging serves cc5f394b5, main is 9af1343f4 | merge release #5591; staging ships from develop automatically |
| 6 | `intelligence-api` RED on develop | UNOWNED | 5 failed / 2,097 passed; ZodError `usageWithinLimits` from `@tangle-network/agent-eval` | upstream schema drift — needs its own fix |
| 7 | Two live staging defects | UNOWNED | `GET /v1/sidecar-proxy/<id>/config/mcps` → 500; `PATCH .../terminals/<id>` → 404 | reproduce, fix |
| 8 | Root password on static host | UNOWNED, security | `95.217.35.250` `/etc/shadow` has a usable root password; unreachable only while a drop-in disables password auth | lock/rotate it |
| 9 | Parked volumes + evidence dirs | parked | `/root/parked-storage-20260814T224310Z` on 138.201.222.180; `/root/lockprobe-20260815T002359Z` on 138.201.133.55 | delete after ~a week if nothing regressed |
| 10 | Release #5591 open | ready | carries everything through 795622236 | merge when checks settle; then deploy platform-first |
| 11 | MEMORY.md over size limit | minor | 31KB vs 24.4KB cap — recall truncates | trim index lines |

## Standing decisions + kill conditions

| decision | kill condition |
|---|---|
| Never merge a recovered/unverified diff — supply proofs first | none; this is how the wizard bug shipped |
| Bounding retries on the D1 queue is the WRONG first move | kill if the credential fix lands AND the poison head still starves the queue |
| `readOpenInterval` gate treated as broken (query-window), not billing signal | kill if a per-sandbox lookup still fails with billing healthy |
| Staging serves as source of 409 noise until deployed | kill on staging serving ≥ 9af1343f4 |
| Park-never-delete, money records especially | none |

## Operator corrections paid this session (do not pay twice)

- "merge it all now / do it" — when Drew has approved a class of action, stop re-asking per instance.
- 100% deploy success: refuse metric-gaming explicitly (dropping post-deploy jobs flips 29/47 green with zero production change) — he accepted the honest framing.
- Agents corrected ~12 of my premises tonight and were right every time. The expensive ones: grepping one file and declaring a call gone (it moved one layer down); root-causing the WRONG billing queue; declaring `closed/cursor_at=0` pathological (it is what settle writes — 1,420/1,420); "the projection did nothing" (measured mid-split-deploy).

## Traps rediscovered tonight (each cost real time)

- **Split deploy:** Worker half lands BEFORE orchestrator half in one run; unknown query params are IGNORED → a cross-service change reads inert in between. Check BOTH `/version`s.
- **Staging DREW key:** base64 with a dotenvx banner line ahead; `grep -oE '^[A-Za-z0-9+/=]{40,}$' | base64 -d`, verify fp `p/xBzn9tPfnBwX…`. `sed` mangles it.
- **Fresh worktree reds** (`turbo not found`, `Cannot find module`) are the environment, never the change. `adc-wt claim` gives a warm tree (252s vs 1s check-types).
- **Integration tier** shares one Redis; killed runs red 4 receipt-idempotency tests; `FLUSHALL` fixes.
- The platform/intelligence box has `python3`/`node`, **no `jq`**.

## What I was uncertain about at close

- Whether the 24,679 intents are recoverable — depends entirely on which of
  unknown/revoked/expired fires and whether re-attribution is possible.
- Whether staging's next ship will be green (streak is 1; walls cleared, but
  wall #7 may exist).
- Whether the two live-lane agents survived; verified state only as of dispatch.
- The `BILLING_PROVENANCE_REJECTED` platform-side rule — never read; the failure
  is observed but the rule's exact predicate is not.
