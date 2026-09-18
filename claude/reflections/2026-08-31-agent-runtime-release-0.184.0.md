# Reflect: agent-runtime release — 2026-08-31 — n=1

**Verdict:** `@tangle-network/agent-runtime@0.184.0` is live: workflow `33349241836` completed `2 of 2` required jobs and a peer-complete consumer `1 of 1` imported `148 of 148` exports — measured.
**Biggest cost this period:** `4m36s (n=1)` of registry propagation to finding #2.
**Next:** `/handoff` for `2 of 2` deferred ownership boundaries; direct headless-Tangle cwd proof is `0 of 1` — measured.

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | `n=1`, 2026-08-30–31 — measured |
| Sources | release ledger and handoff; PRs #1029/#1030; workflow 33349241836; npm view, pack, and consumer commands — measured |
| Prior reflections read | `3 of 3`: 2026-08-22, 2026-08-23, 2026-08-24 — measured |
| Not inspected | ADC internals and direct Tangle headless process proof, `2 of 2` protected surfaces — measured |

## Findings — top 2 of 2, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Initial consumer smoke omitted optional Sandbox peers. | `1 of 2` attempts | `1` failed import plus `1` rerun; duration unmeasured (`n=1`) | `1` rerun; duration unmeasured (`n=1`) | measured | Initial tarball install/import; explicit peer cohort fixed it. | Install the supported peer cohort in the smoke command. | release operator |
| 2 | npm metadata lagged the successful publish. | `13 of 14` polls returned E404 | `4m36s (n=1)` | `4m36s (n=1)` if propagation shortens; otherwise unmeasured | measured | npm view E404 at 02:11:42Z; success at 02:16:18Z. | Poll with a bounded loop and record the first success. | release operator |

`0 of 2` findings were dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | This session | Status | Escalate? |
|---|---|---:|---|---|---|---|
| Narrator in the lead seat | 2026-08-22 | `1 of 3` | Lead-checkpoint directive | `0 of 1` corrections | measured | no |
| Reflection defers its top action | 2026-08-23 | `1 of 3` | Reflect-last rule | `1 of 1` artifacts completed | measured | no |
| Built beside the ask | 2026-08-24 | `1 of 3` | Adherence required | `0 of 2` protected repos edited | measured | no |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Focused tests | `n/a (n=0)` | `88 of 88` passed across `2 of 2` files | pass | `n=88` | measured | focused Vitest |
| Full tests | `n/a (n=0)` | `3,253 of 3,259` passed; `6 of 3,259` skipped | pass | `n=3,259` | measured | `pnpm test` |
| Publish jobs | `0 of 2` completed | `2 of 2` succeeded | `+2 of 2` | `n=2` | measured | workflow 33349241836 |
| Registry consumer | `0 of 1` complete imports without peers | `1 of 1` with explicit cohort | `+1 of 1` | `n=1` | measured | npm pack/install and Node import |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Merge after fresh review and checks | `4 of 4` checks and `1 of 1` current-head approval preceded each merge. | `2 of 2` PRs |
| Compare CI archive and registry bytes | SHA-256 values matched. | `1 of 1` artifact |

## Ranked actions
| # | Action | Lever | Expected Δ | Effort | By when | Owner | Verification | Status |
|---:|---|---|---|---|---|---|---|---|
| 1 | Adopt `WorkspaceRequestSchema` when interface 1.9.1 publishes. | Boundary parser duplication | `1` local parser → `0` duplicate validators (`n=1`) | `1 of 1` dependency update | publication | runtime + SDK | `npm view` version, then boundary tests. | measured gap |
| 2 | Materialize cwd in the Tangle headless mapper. | Process-cwd proof | `0 of 1` → `1 of 1` proofs | `1 of 1` mapper fix plus test | provider release | SDK/provider | Real create asserts repo target and process cwd. | measured gap |

## Durable notes written
Reuse check: `rg` checked `AGENTS.md`, `CLAUDE.md`, and `.agent` (`n=3` files); extended ledger and handoff (`n=2` artifacts).

| Path | Claim | Supersedes |
|---|---|---|
| `.agent/reflections/2026-08-31-022315.md` | 0.184.0 is registry-live; peer and propagation costs are measured. | — |
| `.agent/release-progress.md` + `.agent/HANDOFF.md` | Release proof and owner-bound follow-ups are recorded. | — |

## Self-gate
`8/8` passed — failed: none.
k-of-n · cost both sides · status label · repeat check · Verdict names one number + one dispatch · actions name lever+target+owner+verification · zero adjectives standing in for counts · words outside tables `166` ≤600.
