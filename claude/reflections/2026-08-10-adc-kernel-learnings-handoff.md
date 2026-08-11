# Handoff: agent-dev-container — kernel/hypeman learnings → follow-ups → instruction dedup — 2026-08-10

**Objective:** Evaluate kernel.sh (blogs + OSS hypeman) against our Firecracker/GPU/sandbox stack, ship what transfers, then close the follow-ups. Extended mid-session to instruction-file cleanup.

**Status:** Complete. 9 PRs merged (6 ADC, 3 dotfiles). Full local gate green (`✓ preflight passed`). Nothing of mine is unmerged.

## Shipped — all verified present in `develop` by content (squash merges, so commit ids do not appear)

| PR | What | Proof it landed |
|---|---|---|
| #4941 | 6 kernel-derived mechanisms: derived-truth reconciler, net-truth idle confirm, route-scope exhaustiveness, protected-set image GC, boot sentinels, FC fanout hygiene | `+8035/-102` |
| #5002 | Eval gate restored: opencode model-switch (3 stacked defects) + egress-inactive resume re-key | `+401/-27` |
| #5047 | project-files tenancy, security-route deletion, cold-reap starvation, FC sentinel tail | `grep getProjectForProduct develop:project-files.ts` → 2 |
| #5051 | ASD-STE100 prose rule | in `develop:AGENTS.md` |
| #5055 | `CLAUDE.md` → `@AGENTS.md` import | `head -1 develop:CLAUDE.md` → `@AGENTS.md` |
| #5075 | Model-routing table: one owner | `+5/-11` |
| dotfiles #72/#73/#74 | Global AGENTS.md compressed 4091→3053w; `~/code/AGENTS.md` versioned + symlinked | `readlink ~/code/AGENTS.md` → `dotfiles/claude/code-tree-AGENTS.md` |

## Verification commands that mattered

- `~/bin/adc-gate <wt> pnpm run ci` → `✓ preflight passed` (`~/gate-logs/followups-gate4.log`). **Never pipe the gate through `tail`** — EPIPE reads as a test failure.
- Bisect that found the develop regression: `bisect-5002.log` PASS · `bisect-preauth.log` PASS · `bisect-5038.log` FAIL → first bad `4c9d1a6e31`.
- Suites at HEAD: orchestrator 4911, host-agent 1465, sidecar 3012, fc-runtime 538.

## Live lanes

None of mine. Verified at write time: `ps -eo pid,etime,cmd | grep -E 'preflight|adc-gate|vitest|tangle-eval'` shows only other sessions' processes (cli-bridge servers, a bench-cache analyze). `/tmp/adc-ste` and `/tmp/adc-dedup` were reaped by tmp cleanup; `/home/drew/code/adc-followups` remains at `60cbdec1ec`, clean, fully merged — safe to delete.

## Open loops — 6 rows

| Item | State | Pointer | Next command |
|---|---|---|---|
| `DERIVED_TRUTH_ENFORCE` never armed | shipped, report-only | `state/derived-truth-reconciler.ts` | set `=true` on staging, read `orchestrator_derived_truth_divergence{kind}` |
| `HOST_AGENT_SENTINEL_FAST_PATH` off | shipped, dark | `runtime/sidecar-boot-sentinels.ts:261` | flip on one staging host, grep host-agent log for `Sidecar boot sentinel` |
| `IMAGE_RETENTION_ENABLED` off | shipped, dark | `docker/image-retention.ts` | arm on staging, watch `image_retention_all_protected` |
| `FC_WARM_SEED_CAPTURE_AT=agent-warm` | option exists, probe does not | `warm-seed-capture.ts` | build an in-guest agent-warm endpoint in apps/sidecar |
| Cross-tenant control-plane reads (`/hosts`, `/observability/*`, `/v1/images`) accept any product key | documented, unfixed | `middleware/route-scope-map.ts` comments | tenancy pass, own PR |
| Model-switch eval tier not on the sidecar-dispatch PR gate | regression escaped once | `scripts/preflight-eval-gate.sh` | add tier; verify it reds on a reverted `4c9d1a6e31` |

## Standing decisions + KILL CONDITIONS

| Decision | Kill condition |
|---|---|
| No QEMU/vGPU data plane; GPU stays a remote-lease broker | a funded customer needs GPU rendering *inside* a sandbox |
| No UFFD pager build-out (RFC 0001 only) | the isolated KVM cell exists — every number needs it |
| Docker-path work outranks FC work | FC serves production traffic |
| Occupancy does not consume the derived-truth summary | occupancy is shown counting a record with no container |
| `~/code/AGENTS.md` and global `AGENTS.md` stay separate files | their section lists overlap again |

## Operator corrections paid for this session — do not pay twice

1. **"make sure we don't already have this"** — 1 of 4 audit items was fiction; verifying first is what surfaced the best fix.
2. **"why are agentsmd and claudemd deviating at all"** — a copy needs a guard, and the guard is weaker than the property. One owner + pointer.
3. **"our agentsmd is way too long"** — the longest section was the one arguing for terseness.
4. **"don't be dumb"** re STE — grep-verify a named rule survives every edit.

## What I was uncertain about at close

- The dev-server drain fix (`INSTALL_FAILED` empty log) is **not mutation-provable in isolation** — the race only appears under full-suite load. Evidence is mechanism + one loaded-gate failure, not a red-on-demand test.
- Zero deployed-path proof for anything merged this session. Every claim is local-gate-level.
- `~/code/AGENTS.md` content is now sound, but I did not re-read it end-to-end after the symlink move.

## Next actions

1. Arm `DERIVED_TRUTH_ENFORCE` on staging — 0 code, converts a dark mechanism into evidence.
2. Warm-pool decrementing placement + depth 4→8 — measured p90 1.86s → ~0.91s.
3. Add the model-switch tier to the sidecar-dispatch PR gate — stops a 15-run rediscovery.
4. Tenancy pass on the control-plane reads.
