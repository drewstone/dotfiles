---
name: pursue-worked-examples
description: "Non-normative worked examples for /pursue. The contract lives in SKILL.md; this file only shows filled-in instances of its sections."
---

# Pursue — worked examples

Not a contract. Every rule, gate, and section name is defined in `../SKILL.md`; these are instances of those same sections, plus two calibration points from the real corpus.

## Calibration

| Grade | Artifact | Words | Table rows | Numerals/line | What decided it |
|---|---|---:|---:|---:|---|
| 0/10 | `agent-dev-container/.evolve/pursuits/2026-07-15-infrastructure-intent-and-reliability-audit.md` | 3,809 | 0 | 0.84 | 5.4× the 700-word cap, 0 tables, no baseline-vs-new, no Δ, no kill condition |
| 10/10 | `agent-lab/.evolve/pursuits/2026-06-27-appworld-spotify-route-audit-r93.md` | 343 | 11 | 2.25 | Under cap, 11 table rows, per-run n, evidence as run ids |

## Output template

```markdown
# Pursue: cut sandbox time-to-first-token — Gen 3 — 2026-06-27

**Verdict:** ADVANCE — TTFT p50 4.10s → 1.28s (Δ −69%, n=12 runs each side, measured)
**Cost:** 9 turns, 14 files, +812/−1,190 net lines · **Saving if shipped:** ~2.8s × 4,000 creates/day = 3.1 h/day of user wait (assumption: create rate holds at the 30-day mean)
**Next:** /evolve targeting TTFT p90 against baseline 2.9s

## Plateau → generation
| Field | Value |
|---|---|
| Plateau metric | TTFT p50 — product value: the delay before a user sees the agent's first word |
| Plateau evidence | 3 `/evolve` cycles, best Δ +1.4%, runs `bench-0611`, `bench-0619`, `bench-0624` |
| Baseline (re-seeded) | median 4.10s, n=5 runs, spread ±6%, `pnpm bench:create --host staging-3` |
| Thesis | Boot cost is image pull + cold sidecar; a pre-warmed pool moves both off the request path |
| Moonshot | Snapshot-restore every sandbox from a frozen VM image — rejected: needs the KVM cell, not built |
| Kill condition | p50 >3.0s after warm pool lands · rollback: `git revert 9f2c1ab && pnpm deploy:staging` |

## Changes — 6 shipped, 2 architectural
| # | Change | Files | Net lines | Coupled to | Status |
|---:|---|---:|---:|---|---|
| 1 | Warm pool allocator | 5 | +410 | 2, 3 | shipped |
| 2 | Sidecar prestart on pool fill | 4 | −180 | 1 | shipped |
| 3 | Pool-exhaustion 503 + retry | 2 | +96 | 1 | shipped |

## Baseline vs new
| Metric | Baseline | Gen 3 | Δ | n each | Status | Evidence |
|---|---:|---:|---:|---:|---|---|
| TTFT p50 | 4.10s | 1.28s | −69% | 12 | measured | run `bench-0627-a` |
| TTFT p90 | 7.60s | 2.90s | −62% | 12 | measured | run `bench-0627-a` |
| Create success | 100% | 98.3% | −1.7pt | 120 | measured | 2 pool-exhaustion 503s, `host-agent.log:8812` |
| Host RSS at idle | 1.9 GB | 3.4 GB | +79% | 3 | measured | `docker stats --no-stream` |

## Not measured
| What | Why | Risk if the assumption is wrong |
|---|---|---|
| TTFT under >50 concurrent creates | Staging host caps at 24 | Pool drains; p50 reverts toward 4.1s |
```

The `Create success` and `Host RSS` rows are the point of the example: a table showing only the 2 wins is a defect under the show-every-regression rule.

## Tournament

| # | Architecture | Predicted leverage | Chosen | Why it lost / what was grafted |
|---:|---|---:|---|---|
| 1 | Pre-warmed pool | −65% TTFT | yes | — |
| 2 | Lazy image layers | −25% TTFT | no | Smaller ceiling; grafted its layer-order fix into #1 |
| 3 | Snapshot restore | −90% TTFT | no | Needs a `/dev/kvm` cell that does not exist; re-open when it does |

A pursuit carrying only row 1 is `/evolve` in costume — the losing rows are what make the choice auditable.

## Gates

| Gate | Result | Evidence |
|---|---|---|
| Review gate | blocking (lifecycle create/delete; diff 14 files >5) | `.agent/pursuits/2026-06-27-ttft.md:41` |
| Adversarial review | 11 concerns, 2 would-block, 11 closed | `.agent/reviews/2026-06-27-ttft.md` |
| Diff audit | CRIT 1 / HIGH 3, all fixed | `.agent/critical-audit/2026-06-27/` |
| Tests · typecheck · build | 1,478/1,484 · clean · clean | `pnpm preflight → 6 skipped (kvm)` |

## Self-gate

```
8/10 passed — failed: 7 (cost both sides — saving unmeasured, no create-rate telemetry), 9 (regressions shown — RSS row added only after review flagged it).
```

Reporting the 2 failures is the pass condition; a silent 10/10 is the defect.

## Dispatch

```
/evolve — triggered by Δ −69% ≥ +5% threshold and metric still moving — passing baseline TTFT p90 2.9s + the 2 remaining knobs (pool size, prefetch depth)
```
