# Handoff: ADC create-latency attribution + release recovery — 2026-08-19

**Objective.** Recover production from a 27h-stale serving state, then answer "why is create slower than the physical limit?" with measured numbers.
**Status.** Both done and proven on the deployed path. Production serves `9c6e8165b585`; plain create **1.70s → 1.28s**; the desktop path is decomposed for the first time. **15 PRs merged.**

## Ground truth at close (re-verified at write time)

| Thing | Value |
|---|---|
| develop tip | `f45901064826` |
| main tip | `9c6e8165b585` |
| production serving | `9c6e8165b585` — matches main |
| host drift | **0 rows**, 3 hosts registered, converged |
| my open PRs | **1** (#5947, checks green, not mine to merge alone — see loops) |
| other open PRs | #5946 (next release train, auto-cut) |
| live lanes | **none** — every monitor ended or was stopped |

## The two numbers

**Plain create: 1.70s → 1.28s median (n=5, min 1.23).** Inside the 2–4s target.
The win is #5889: the orchestrator probed every host for warm depth via
`GET /v1/docker-pool/stats`, a route the host-agent stopped serving in #2976.
Every probe was a guaranteed miss, and one unreachable host burned its full
2500ms timeout inside every customer create. Receipt proof after deploy:
`warm_claim durationMs 0, skipped=served_in_route`.

**Desktop create: 6.59s, and the 1.57s "watchers" span is now split** (measured
off the wire, post-drift-clear):

| leg | ms |
|---|---:|
| **browser (Chromium)** | **1022** |
| xvfb | 180 |
| browser CA trust | 106 |
| window manager | 77 |
| dbus | 11 |
| mcp | 0 |

Chromium is 73%. The parallelisation idea is worth less than it looked —
dbus+xvfb+ca_trust are 297ms serial with maybe 180ms overlappable. **Deferring
the browser start off boot-to-listen is the only lever worth its risk.**

## What remains, and why I could not close it

**#5938 — 753ms per create, the largest single remaining term (59% of a 1.28s
create).** I filed this asking Platform for an atomic key claim/rebind endpoint,
then **built the endpoint to test the premise**. The database refused it:

```
SQLITE_CONSTRAINT: api key attribution is immutable
```

Migration `0059_chief_spencer_smythe.sql` makes `resource_id`, `resource_type`,
`lineage_id`, `parent_key_id`, `product` and the mint actor immutable after
creation; `0061` does the same for the billing ledger. A pooled key minted at
`resourceId=pool` can **never** become a sandbox's key. This is a deliberate
billing-integrity invariant, not missing work — the code comment in
`acquirePooledRouterKey` understates it as "Platform has no endpoint yet".

Reverted everything and rewrote the issue as three priced options. Only **option
2 (mint per-sandbox ahead of demand)** buys the latency without weakening
attribution.

## Merged (15)

`#5829` release→main · `#5831` smoke deletes every attempted ref · `#5832`
release versionability gate · `#5833` roadmap gate charges each commit once ·
`#5873` sdk-memory committed bin launcher · `#5889` **dead-route warm probe
skip** · `#5890` capability-pool readiness deadline 1000→5000ms · `#5909`
**create waterfall + Slack + parent-link containment + Server-Timing** · `#5935`
hub-exec idempotency (+ the deploy harness it was missing) · `#5936` agent docs ·
`#5937` version packages · `#5939` **desktop bring-up instrumentation** · `#5940`
one canonicalJson not three · `#5942` **Release 20260819** · `#5943` session-store
cycle break.

## Live lanes

**None.** All monitors ended or were stopped. Nothing to resume.

## Open loops — 8 rows

| Item | State | Pointer | Next command |
|---|---|---|---|
| #5938 pooled router key | **redefined as a design question** | issue #5938, migration `0059` | pick option 2 (pre-mint per sandbox) or accept 753ms |
| Defer Chromium off boot-to-listen | measured, not built | `apps/sidecar/src/server.ts:457` | readiness promise in `computer-use-registry.ts`; fail-closed must MOVE not vanish |
| Readiness gate red | **root cause UNKNOWN** — my diagnosis was wrong | run 32217112746, job "Readiness (production)" | open the raw run page; the API log yields only script text |
| Smoke + browser-audit prod reds | untriaged, pre-date tonight | same deploy run | triage independently of the release |
| #5947 scope managed Router credential | open, checks green, not mine | `gh pr view 5947` | review + merge |
| #5946 next release train | auto-cut, open | `gh pr view 5946` | merge when its content is wanted |
| `workflow-compiler.stableStringify` | deliberately NOT folded | `products/platform/api/src/lib/workflow-compiler.ts:795` | leave it — it drops `undefined`, folding changes hashes |
| `apps/sidecar` bins point at `dist/` | 2 more of the #5873 class | `apps/sidecar/package.json` | committed-launcher pattern, as #5873 |

## Standing decisions + KILL CONDITIONS

1. **Never `git checkout <ref> -- <path>` while holding uncommitted edits there.** Kill: none — it silently discarded three separately-verified fixes tonight. Read other versions with `git show <ref>:<path> >` to a scratch file.
2. **A push is proven by content on the remote, never by `EXIT=0`.** Kill: none. An empty commit pushes clean and reports success; `git ls-remote` + `git show origin/<branch>:<path>` is the proof.
3. **Cancelled/queued ≠ failed, and a run-level `failure` ≠ the deploy failed.** Kill: none. Read the JOB conclusion — "Deploy to Production: success" under a red run means post-deploy verification failed, which triages rather than blocks.
4. **Deployment has three layers: orchestrator sha, host-agent package, sidecar bundle.** Kill: none. `/version` reports the first; check `hostDrift` before claiming an instrumentation change is live.
5. **Do not fold `stableStringify` into `canonicalJson`.** Kill: if `workflow-compiler` stops depending on `undefined`-dropping, fold it.

## Operator corrections paid this session — do not pay twice

- **"Stop telling me it's still open."** Reporting in-flight state repeatedly reads as stalling. Report a *change* or say nothing.
- **"What is 'ping platform on 5938', this is done and you just need to test it?"** Correct instinct: I was treating an in-repo package as someone else's. `products/platform/api` is in THIS repo. Build the thing and let the system refuse it — which is exactly how the immutability invariant surfaced.
- **Mutation-test every new test.** Four decorative tests tonight, caught by machinery not by me: a stub ordered so the assertion held either way; a mutant that couldn't reproduce the bug; a locale where the defect is invisible; a bare `! cmd` in bats that can never fail (repo ships `refute_grep`).
- **Re-verify delegated findings.** One of three audit findings did not reproduce; I built the "fix", mutation-tested it, saw the mutant survive, and reverted rather than ship a fake.

## Uncertain at close — read before trusting the above

- **The readiness gate's real failure is unknown.** I claimed a missing secret (`PRODUCTION_SANDBOX_API_KEY`, `stores: []`); the workflow falls back to `SANDBOX_PRODUCTION_API_KEY`, which exists and was updated 2026-08-19, and my own probe key returns 200. That diagnosis was **wrong** and I could not extract the executed error from the API log.
- **The 1.28s plain-create figure is n=5 on one vantage** (this laptop, warm TLS). The canary measures the desktop path and is not comparable — see `project_create_latency_desktop_vs_plain`.
- **The desktop legs are n=1.** The split's shape (Chromium dominant) is unambiguous, but the exact ms are one sample; the waterfall workflow posts n=5 every 6h from CI.
- **#5947 is not mine** — green, but I did not audit it.

## Method notes worth keeping

- **Build the thing to test the premise.** The #5938 endpoint took ~20 minutes and turned a wrong issue into a correct one. A design question answered by argument stays arguable; one answered by `SQLITE_CONSTRAINT` is settled.
- **The repo's gates are stricter than my review.** In one change they caught: a stale-cache `tsc` false-clean, 16 pre-existing lint violations that only fire on touch (a red generator), closure narrowing, a reverted type union, and a 6-versions-stale `node_modules`. Run the package's own `check-types`, never bare `tsc`.
- **`git log -S <symbol>` before optimizing.** For `sidecar_top_level_init` it returned 5 commits, all instrumentation, zero optimization — nobody had tried, and nothing had been reverted.
