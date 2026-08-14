# Handoff — agent-sdk tranche + ADC release — 2026-08-13

**Objective:** close four upstream issues (agent-runtime #808/#800, agent-sdk #146, ADC #5277), then triage the whole agent-sdk backlog, get it released and live.
**Status:** shipped and verified live. agent-sdk open issues 15 → 3. Production serves the tranche.
**Reflection:** `~/.claude/reflections/2026-08-13-agent-sdk-tranche-adversarial-gate.md`
**Open loops below: 8 rows.**

## Live state (re-verified at write time, not from earlier notes)

| Check | Value |
|---|---|
| Prod orchestrator | `f7ef0446fd29`, buildTime 2026-08-13T21:00:15Z |
| `sandbox.tangle.tools/health` | `{"status":"ok"}` |
| Tranche in prod | `18aec64ff` (#5277), `584ad0c05` (#5316), `7b7e1d209` (#5317) — all ancestors of the serving revision |
| npm | runtime 0.133.8 · interface 0.49.0 · provider-tangle 0.7.3 · sandbox 0.22.0 |
| Live lanes | **none** — no background agents, monitors, or workflows still running |

## Shipped (all MERGED, verified `gh pr view`)

| Repo | PRs |
|---|---|
| agent-runtime | #810 (#808 fail-fast), #811 (#800 durable admission) → tagged v0.133.0, published |
| agent-sdk | #152 (#146 capability claims), #156 (undici GHSA), #157 (#90/#134/#116/#135/#137), #158 (#136 contract), #160 (#130 UP evidence), #165 (#154 retained half) |
| ADC | #5316 capability endpoint, #5317 interaction ledger, #5326 (#5277 key auth + F9), #5367/#5373 releases, #5371/#5372 changeset+version, #5380 smoke harness, #5381 local-signoff 19/19, #5420 responseDedupe flag |

## Verification commands that mattered

```
node scripts/check-local-ci-covers-gate.mjs      → 19 jobs covered, 0 infra-only
npm view @tangle-network/sandbox@0.22.0 version  → 0.22.0 (exact check; a substring grep false-positived earlier)
npm pack @tangle-network/sandbox@0.22.0          → tarball carries capabilities(): Promise<SandboxRuntimeCapabilities | null>
pnpm check:control-artifacts                     → 129/129 (builds+packs the provider; proves the published artifact)
```

## Open loops — 8

| # | Item | State | Pointer | Next command |
|---:|---|---|---|---|
| 1 | agent-sdk#154 interaction half | **withheld deliberately** — not incomplete | branch `feat/154-interaction-responses` @ `f9044cb33`, **no PR** | after ADC#5421: `gh pr create --repo tangle-network/agent-sdk --base main --head feat/154-interaction-responses` |
| 2 | ADC#5421 (SDK: id-targeted answer + return resolution body) | OPEN, unstarted | blocks loop 1 | read `products/sandbox/sdk/src/sandbox.ts` `_answerQuestion` |
| 3 | agent-sdk#162 native harness session id rejected | OPEN, **live prod bug**, dispatched by Drew not fixed by me | `tangle-events.ts` reads `session.updated.data.sessionId` as runtime identity | `gh issue view 162 --repo tangle-network/agent-sdk` |
| 4 | agent-sdk#136 phase-2 provider wiring | OPEN, unstarted (contract shipped #158) | CLI-bridge usage readout + tangle terminal bridge | `gh issue view 136 --repo tangle-network/agent-sdk` |
| 5 | ADC#5323 idempotent workspace-branching server surface | OPEN, filed | blocks the branching half of agent-sdk#146 | — |
| 6 | ADC#5324 server-issued create receipt | OPEN, filed | needs a new agent-interface contract | — |
| 7 | ADC#5355 CI cross-host artifact + durable-store flake | OPEN, filed, **partially mitigated** by #5381 | remote CI still flaky; local gate now authoritative | — |
| 8 | 99 stale worktrees under ADC | not cleaned | `git worktree list` | `git worktree prune` after confirming none are in use by other agents |

## Standing decisions + their KILL CONDITIONS

| Decision | Why | Kill condition |
|---|---|---|
| Do NOT ship agent-sdk#154's interaction half | SDK cannot aim an answer at an interaction id and discards the server's resolution; guessing delivers a wrong answer to a running agent, refusing wedges a session permanently after one lost ack | ADC#5421 lands → ship it; branch is the starting point |
| Local signoff is the merge authority; remote CI is an async backstop | Org on GitHub Free, repo private, `main`/`develop` both `protected:false` → zero enforceable required checks; local gate covers 19/19 | Repo moves to a paid plan with required checks, OR the local gate stops covering a merge-gate job (`check-local-ci-covers-gate.mjs` reds) |
| Every behavior change gets one adversarial review prompted to REFUTE | 10 of 11 implementations were refuted; 5 defects were customer-visible | Refute rate falls below ~2/10 across ≥10 reviews — then sample instead of gating every change |
| Prod promotion needs explicit human direction | Repo release guardrail | Unchanged — Drew's "land the deploy" was that direction, per-instance |

## Operator corrections paid for this session — do not pay twice

1. **"CI is a nuisance"** — correct, and now measured: CI never had enforcement power. Do not wait on remote CI; run the local gate and merge.
2. **Ship it, don't ask** — Drew dispatched issues himself when I reported rather than acted. Default to action on unblocked work.
3. **Explain in ELI5 with all deps and expectations** when asked what something is — the #154 explanation was the requested shape, not a status list.

## What I was uncertain about at close

- **Whether prod `f7ef0446` (21:00Z) still carries only my tranche** — it contains my three commits, but other agents merged ~12 ADC PRs in the same window that I did not inspect. If something regresses, do not assume it is mine.
- **agent-sdk#162's blast radius.** It broke one Braid retained run in production; I did not measure how many runs hit the same path.
- **Whether the 99 ADC worktrees are safe to prune** — other agents may hold them. I did not prune.
- **ADC#5355's two flake modes may not be the only ones.** I observed exactly two (cross-host artifact restore, orchestrator durable-store boot timeout) across 3 re-runs; a third is plausible.

## Traps for the next session

| Trap | Cost paid | Avoid |
|---|---|---|
| A changeset on a `main`-based branch is never consumed (`baseBranch: develop`) | ~1h, twice | branch changesets off `develop`; `changeset status` before PR |
| Prod deploy dispatch has 4 silent no-ops | ~5h prod on a stale revision | `memory/reference_adc_deploy_dispatch_inputs.md` |
| A monitor substring-grep reported an npm publish that had not happened | 1 wrong claim, caught by `npm pack` | assert with `npm view pkg@ver`, then unpack the artifact |
| `CI=true pnpm install` cannot regenerate a lockfile (forces frozen mode) | ~20min | plain `pnpm install`, then `git diff pnpm-lock.yaml` |
| Fresh ADC worktrees red the push preflight on stale dist | ~40min | build `workflow-script-runtime` + `runtime-contracts`; `turbo` builds deps, `exec tsc` does not |
