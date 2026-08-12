# Handoff: agent-dev-container — Firecracker made real (boot fix, reproducible kernel, CI gate, latency) — 2026-08-11

**Objective:** "every time we go live with Firecracker it breaks" → find why, fix it, prove it on real KVM and on CI, then push create latency to its limit.

**Status:** Two fixes merged to `develop`. FC lifecycle gate executes and passes on the CI box for the first time. One perf PR open as a *candidate* (not promotable — see stats). One customer-facing defect root-caused but unfixed (#5126), which now blocks both correctness and all latency measurement.

## Shipped — verified present on `develop` by content

| PR | What | Proof |
|---|---|---|
| #5122 → `453dcb3b5e` | FC create never booted a VM: driver sends `startOnCreate`, Docker route honored it, FC route referenced it **0 times**; `createStartsContainer: true` then skipped the health check that would have caught it | `git show origin/develop:...runtime-firecracker-create-route.ts \| grep -c startOnCreate` → 3 |
| #5122 | dm-snapshot rootfs mode (`FC_ROOTFS_SNAPSHOT`, **off by default**), device teardown + startup orphan sweep | `grep -c snapshotMode ...rootfs-manager.ts` → 4 |
| #5144 → `2b4831d2ee` | Guest kernel built from the pinned flake, replacing a `curl` of **Linux 4.14.174 (EOL Jan 2024)** from Firecracker's demo bucket | CI: `guest_kernel=Linux version 6.1.141`, `guest_kernel_sha256=ac64a16353f01fec` |
| #5144 | Firecracker release digest pinned in-repo (was fetched from the same server as the artifact — trust-on-first-use) | `apps/host-agent/Dockerfile` ARG `FIRECRACKER_SHA256_*` |

**CI gate green, first time ever** (run 31454506852):
```
firecracker_lifecycle=executed
firecracker_version=Firecracker v1.16.0
guest_kernel=Linux version 6.1.141
Tests 3 passed (3)
```
Promotion into `ci.yml` needs 10 consecutive greens; **1 down**.

## Open loops — 9 rows

| Item | State | Pointer | Next command |
|---|---|---|---|
| #5126 delete returns `200 {"status":"deleted"}`, VM dies, then reconciliation restores it | root-caused, unfixed | `containerhost:<id>` survives the delete | drop the mapping in the same op as the sidecar; see `removeMappedContainerAsSystem` |
| #5147 sidecar-health poll ramp | OPEN, **candidate not promote** | bootstrap CI `[-372.5,+160.5]` crosses 0 | re-run n≥15/arm after #5126 |
| #5148 compile cache absent in dist-staged rootfs | OPEN, ~270 ms measured | Dockerfile:491 bakes it; dist staging does not | bake in `build-rootfs.sh`, assert non-zero entries |
| FC gate → `ci.yml` | 1 of 10 greens | `.github/workflows/firecracker-lifecycle.yml:10-14` | count consecutive greens |
| `FC_ROOTFS_SNAPSHOT` default | shipped off | rootfs_prepare 532→45 ms | staging soak, then flip |
| `sidecar_boot` 983 ms | largest remaining term | in-guest process entry → HTTP bound | after #5148 |
| #5150 sdk-python prime backend | OPEN | — | unrelated to this thread |
| #5158 / #5076 / #5032 | OPEN | — | unrelated to this thread |
| Disk at 96% (82 G free) | watch | reclaimed 26→173 G earlier; drifted back | `docker image prune -f`; do **not** delete `~/.local/share/firecracker` |

## Live lanes

**None.** Re-verified at write time: `pgrep -f dev-host-agent-fleet.mjs` → 0, `pgrep -x firecracker` → 0, `dmsetup ls | grep fcroot` → 0.

Reproduce the harness (durable, `/tmp` reaped it 4×):
```bash
K=$(cat /tmp/fc-kernel-path)   # or: cd infra/nix && nix build .#firecracker-guest-kernel
FIRECRACKER_KERNEL_PATH=$K/vmlinux LOG_DIR=/tmp/p1-fleet \
  /home/drew/.local/share/adc-fc/start-fc-fleet.sh
NODE_EXTRA_CA_CERTS=/tmp/p1-ca.crt node /home/drew/.local/share/adc-fc/fc-bench.mjs 6
node /home/drew/.local/share/adc-fc/stats.mjs ctl.json trt.json fc.wait_for_sidecar
```

## Measurements (pinned stack: FC v1.16.0 + guest 6.1.141)

| Stage | p50 | Note |
|---|---:|---|
| create total | 2651 ms | n=10 |
| `fc.wait_for_sidecar` | 1842–2055 ms | 70–79% of a create |
| ↳ `sidecar_boot` | 983 ms | largest single term |
| `fc.rootfs_prepare` | 462–532 ms | 45 ms with snapshot mode |
| `fc.cold_boot` | 135–166 ms | Firecracker's own work |

**Every latency number reported before the hypervisor upgrade is void.** A local Firecracker **v1.6.0** against a repo pinning **v1.16.0** inflated the baseline: reported 6575 ms was really 3215 ms, and a claimed 2.8× snapshot win is really **1.19×**. Corrections are posted on #5122.

## Standing decisions + KILL CONDITIONS

| Decision | Kill condition |
|---|---|
| `FC_ROOTFS_SNAPSHOT` stays **off** by default | a staging soak shows no regression AND #5126 is fixed |
| FC gate stays out of `ci.yml` | 10 consecutive greens |
| Guest kernel tracks nixpkgs, not a hand pin | nixpkgs' 6.1 falls behind staging's patch level enough to matter (currently 6.1.141 vs 6.1.174) |
| No compile-cache bake shipped unverified | a real rootfs build produces non-zero cache entries |
| Benchmarks capped at ~6 reps | #5126 fixed — then n can rise |

## Operator corrections paid this session — do not pay twice

1. **"don't break one thing"** — the Docker runtime must be verified, not assumed, on every FC change (1469 host-agent tests).
2. **"regardless of dev cost"** — build the reproducible artifact; do not ship the fast unverifiable blob.
3. **"test on the ci box"** — local green is not the deliverable; the CI verdict line is.

## What I was uncertain about at close

- **I was wrong five times, four on #5126 alone** (reservation guard, `isContainerMissingError`, driver 404 coercion, id mismatch). Each was plausible from reading code; only running it with logs settled it. Treat any code-only hypothesis here as unproven.
- **Process counts are not a valid signal for #5126.** They drop to 0 on delete and rise again seconds later. Use `containerhost:<id>` and the orchestrator's own list.
- **`GET /sidecars` empty + by-id 404 is correct tenancy**, not a bug — send `x-user-id`. This cost three escalating wrong claims and one wrongly-filed issue (#5125, closed).
- **#5147's Δ is real in direction but not significant** at n=6 (d=0.90, p=0.119). Its solid result is variance: sd 252.8 → 68.3.
- The compile-cache bake failed on a nested CJS-loaded file, not the entry; Node 22.16 auto-detects ESM, so the missing `package.json` was never the guest's problem.

## Next actions

1. **Fix #5126** — gates correctness, billing, and every measurement.
2. Re-run #5147 at n≥15/arm on the fixed harness — promote or kill.
3. Land the compile cache (~270 ms) with the detect-module answer in hand.
4. Attack `sidecar_boot` (983 ms) — the only large term left.
