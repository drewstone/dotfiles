# ADC redesign assessment — 2026-09-06

Five architect passes (orchestrator control plane, state plane and storage, runtime boot path, sandbox API and billing, gauges) plus the create-wall diagnosis. The delivery and operations pass died on the spend cap; its findings below come from this session's own reads. Every number cites code or a run.

## Verdict in three lines

- **Redesign:** the billing substrate (one outbox, one storage port) and snapshot identity (app-owned ids, one control-plane row for seal, watermark, placement).
- **Refactor in place:** the orchestrator control plane, the runtime boot path, and the measurement stack. The shape is right; the duplication and dark spots are the cost.
- **Leave alone:** the create saga's step structure and the fail-closed invariants (billing evidence, idempotency, security boundary). Every speed win today came from deleting redundant work around them, not from touching them.

## Ranked moves

1. **Create path: one D1 round trip after the orchestrator answers.** Shipped as PR `perf/create-path-one-d1-round-trip`. Five lease round trips (~150ms each) deleted; the commit batch carries the ownership guard and the release. Expected: worker total 2.0s → ~1.2s. Gauge: Create Waterfall run after deploy. Keep: #6994's commit-before-201.
2. **Warm seed as the unit of readiness.** Correction after reading the 00:14Z artifact per profile: the plain create IS served warm (leaf `warm_claim_rebind` 62ms, no scratch-home stage). The cold stages belong to the **desktop** (computer_use) profile, which bypasses the pool by design: `fresh_scratch_home` 639ms, `sidecar_module_load` 418ms, `egress_proxy_create` 287ms, browser CA trust 226ms, egress CA trust 210ms, cache ownership repair 208ms, about 2.0s of per-box work on every desktop create. First PR: the probe records the warm outcome per sample and the verdict speaks when a plain create is served cold (the artifact keeps no samples today). Then: a warm seed shape for desktop, or move CA trust, cache repair and module load into the image. Then move per-box work (scratch home, CA trust, cargo/nix probes, sidecar boot) to seed spawn; claim binds identity only. ROADMAP:266 shows this fleet-wide silent cold-pathing happened before with no gate failing.
3. **Durable placement row.** `state_plane_placement` has zero hits in the tree although NORTH_STAR W0.1 lists it in flight. Placement is rebuilt at boot from container labels and merged with a 60s-flushed SQLite file (index.ts:737+, project-manager.ts:1139+); one bind fans into five Redis structures. Add host_id, reservation_id, container_id, incarnation to DurableProjectStore, write them where set-container-host runs, make resume/snapshot/cold-reap read the row first, demote the label scan to a verifier. This removes the HOST_INFO_MISSING class and half of what the 900-line heartbeat script reconciles.
4. **One measurement spine.** Twelve independent clocks, five `parseServerTiming` copies, nine median/quantile functions, six stage-recorder shapes. Migrate the six LifecycleSpanRecorder callers, stage-ledger and StartupBootstrapRecorder onto sdk-telemetry's SpanRecorder; forward the ptid to host-agent (0 files today); persist each op's span tree as its receipt. Delete first, no behavior change: `check:create-p50` (grades a frozen 2026-06-15 run against itself), `.evolve/perf-baseline.json` (TTFT p50 11900 n=3), `.evolve/benchmark-*.tsv` (zero references), the stale `.evolve/` pursuit state, and the CURRENT_STATE generated block whose gate passes while stale.
5. **Billing substrate: one outbox.** Three charge-intent tables (compute, egress, gpu_lease) with three reconcilers and three gauges inside a 4,344-LOC class; 18 commits in 30 days; #6849 existed to re-copy behavior between tables. The Redis ledger and quota re-implement the D1 logic for Node/on-prem (~4,000 LOC) with weaker semantics. Target: one `charge_intents` table with a `kind` column, one reconciler, a SqlDb port so the D1 ledger runs on SQLite for on-prem. Expand-only migration, then delete the copies.
6. **Snapshot identity owned by the app.** Restic's post-upload content hash is the snapshot id, so the spool's `restic copy` re-ids every snapshot and needs `original` linkage; the resume gate lives in an in-process Map (the #7012 cross-host class; a deploy between stop and resume skips the restore). Stamp `--tag id:<uuid>` on every backup, resolve by tag, persist seal head + durability watermark + placement as one row. Then the `original` resolution code, seven SnapshotMetadata codecs, and the sidecar's own restic spawn path go.
7. **Lua consolidation.** 44 scripts sent as full text by EVAL on every call (redis-client.ts:160-165; no evalsha anywhere); the reservation state list is copied at 17 sites in 5 files; every semantic change is mirrored by hand into a 985-line FakeRedis. Shared prelude (decodeReservation, RESERVATION_STATES, holdsSlot, keyType, receipt), EVALSHA, and unit tests against the real scripts so the FakeRedis can be deleted.
8. **Network isolation cache from the health scrape.** Shipped in the same PR as move 1: 131ms of a 467ms orchestrator span was a /health probe the fleet poller already performs.
9. **Delivery honesty.** develop and main report `protected: false`; the org is on the free plan, where private repos have no branch protection or rulesets. Every merge gate is policy only. PR `fix/ci-secret-scan-and-sync-phantoms` replaces the sync PR with a direct merge push (kills the seven phantom failures per release) and stops the secret scan paging on scanner errors. Still owed: retire the ~12 permanently red one-off workflows (BMAF v1-3, export/observer/durability experiments, live-e2e red since 07-24, Alarm Heartbeat red since 08-10); make deploy's mutating stages non-cancellable (half-deploy class, 8 of 12 cancelled on 09-03).

## Delete list (proof of no dependents in each row)

- Orchestrator warm-claim seam: `sidecar-manager.ts:141-160` predicate returns false unconditionally; branch at 1092-1170, `sidecar-warm-claim.ts`, `driver/host-agent-driver-warm.ts` (~600 LOC dead on every backend).
- Redis runtime records `state/runtime-record-store.ts` project/sidecar methods: zero writers in the monorepo; one reader (security ban handler) reads nothing.
- Legacy `dockerhost:` key migration (`ensureHostKeyMigrated`, 29 sites).
- CRIU surfaces: `getCriuStatus`, routes/system.ts CRIU route, types.ts:491-604.
- Storage compat shims `apps/orchestrator/src/storage/{s3-snapshot-manager,block-storage-manager,errors}.ts` (self-described legacy import modules), `filesystem-block-storage.ts` (571 LOC, no production constructor), `local-fs-storage-*.ts`.
- Sidecar: second `securityCors()` registration, the `/fs/*` middleware whose both branches `return next()`, `apps/sidecar/src/{services,routes}/snapshots.ts` (restic inside the container).
- Sandbox API: the `assertOwned` at provision.ts:142 (done), one of two identical IP rate-limit rule tables, the hand-rolled tier cache in `middleware/auth.ts:86-210`, returned-but-unread create phase fields.
- Gauges: `check:create-p50`, `.evolve/perf-baseline.json`, `.evolve/benchmark-*.tsv`, `.evolve/{progress.md,experiments.jsonl,governor.jsonl,current.json,pr-722-description.md}`, `scripts/{check,generate}-speed-current-state.mjs` with the generated block.

## What not to do

- Do not move the commit batch or the claim release back to `waitUntil`: #6994 fixed a customer-visible DELETE 409 after 201.
- Do not delete the isolation probe or flip `CONTAINER_NETWORK_ISOLATION`; the cache fill removes the cost without touching the boundary.
- Do not pre-mint credentials before the claim: replace-on-mint revokes the prior key per (userId, slot); #4798 was the incident.
- Do not optimize cold-path spans as create work; fix the warm-hit rate and alarm on misses.
- Do not stand up the Firecracker cell now (#6697): no customer can request it and it costs a billed ccx SKU.
- Do not rewrite the orchestrator wholesale; the fix PRs cluster on a few seams that a placement row and a Lua prelude close.

## Sequencing

1. Merge the two PRs opened today; read the next Create Waterfall (18:05Z cadence) for postCreate < 200ms and transport < 100ms.
2. Warm-miss visibility PR (receipt fields + production alarm), then seed-spawn moves.
3. Durable placement row PR.
4. Gauge deletions PR, then the SpanRecorder migration.
5. Billing outbox and snapshot identity as their own tracked lanes in ROADMAP.
