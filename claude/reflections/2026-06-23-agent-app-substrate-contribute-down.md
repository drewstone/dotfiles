# Reflect: agent-app — substrate freshness → issue burndown → contribute-down to SDK
Date: 2026-06-23
Scope: single session (long; ~12 PRs across 2 repos)

## Run Grade: 8.5/10

| Dimension | Score | Evidence |
|---|---|---|
| Goal achievement | 9 | Every ask shipped + verified live: agent-app `0.40.0→0.42.3`, `@tangle-network/sandbox@0.9.0` published. 3 open issues closed/advanced (#16 tool registry, #42 buffering, #119 terminal), auto-publish-on-merge wired, the full contribute-down (writeMany into SDK → agent-app adopts → dup deleted). |
| Code quality | 9 | Tests added/updated every PR; 1880 agent-app tests + SDK suites green; clean diffs; the dedupe (#135) and writeMany were genuine simplifications, not churn. No regressions. |
| Efficiency | 7 | Real rework: (a) resumable-turns doc oversold the buffer → needed correction PR #134; (b) two failed 0.9.0 publishes (dist-hygiene leak, then provenance-on-self-hosted) before success; (c) `[skip release]` token in a PR body caused a no-op publish. Each was diagnosed fast, but a pre-flight check would've avoided them. |
| Self-correction | 9 | Caught own doc oversell during the audit and fixed it. Both publish failures diagnosed to root cause and adapted (oidc_opt_out). Reconciled "audit Lin's PR" misread immediately. |
| Verification | 9 | Claim-gate held throughout: every "published" confirmed against npm live (`npm view`, tarball unpack to confirm `writeMany` present + no `sidecarUrl` leak); every "tests pass" run; CI watched to conclusion. |
| Overall | 8.5 | High-volume, high-value, honestly verified, strong self-correction. Deductions for avoidable rework cycles. |

## Session Flow Analysis

1. **FLOW (recurring ~4x): "is X on latest / publish a new version"** → orient (git/branch/npm) → bump → typecheck+test+build gates → PR → tag/auto-publish → confirm live on npm. *Automation potential: realized — wired auto-publish-on-merge (#128). This flow is now a workflow, not a manual ritual.*

2. **FLOW (recurring 3x): operator points at code → "is this overcomplicating something simpler?"** → audit → find the REAL duplication (usually NOT where pointed) → recommend + fix.
   - resources/ ≠ resumable buffer; real dup was the **sandbox SDK's session replay**.
   - "audit Lin's #130" → #130 is correct; the real smell is the **apparatus belonging in the SDK**.
   - "minors on develop?" → real answer: snapshots already exist; don't move stable publishing to develop.
   - **Every time Drew's "this smells over-engineered" instinct was right — just mis-aimed. My value was locating where the complexity actually lived.**

3. **FLOW: contribute-down** — shell hand-rolls a platform primitive → move to SDK (writeMany) → publish → adopt → delete the shell copy. The canonical engine/shell pattern, executed end-to-end across two repos.

## Operator Questions Revealing Gaps
- *"why doesn't it auto publish on merge?"* → no auto-release existed. **Fixed.**
- *"does the changeset bump trigger automatically?"* → I'd asserted the chain without reading the workflows. **Gap: verify release mechanics before claiming.**
- *"minors on develop merge?"* → release-governance question; answer was "no, by design (review gate)."

## Pivots / Corrections
- "i meant Lin's PR too" — I'd used #130 as a *reference* instead of *auditing* it. Misread the target.
- "fix that 0.0.0 bullshit" — mid-task injection; handled inline.
- Persistent tension: Drew pushed "just do it / stop asking," yet outward publishes + release governance genuinely needed his call. Calibration mostly right (acted on code, asked on publish-to-latest + governance).

## Project Health — agent-app
- **Trajectory: improving.** Now self-publishing on merge; substrate current; 3 issues burned down; architecture doc added (`ARCHITECTURE.md`).
- **Tests: meaningful** (1880, real behavior incl. 401-refresh, file-API partitioning).
- **Debt: low and shrinking** — the dedupe + writeMany adoption removed hand-rolled code. One known residue: the exec path in `writeProfileFilesToBox` (can't retire until `/files/write` gains a `mode`).

## The Meta-Lesson (highest-value finding)
**Shipping surfaced two latent failures nobody knew about: the SDK had been UNPUBLISHABLE since 0.8.2.** The dist-hygiene guard blocked it (a public field `ScopedToken.sidecarUrl` collided with the IP banlist), and the broken snapshot pipeline (skipping on cancelled CI) hid that no publish was succeeding. The *act of trying to release* was the only thing that revealed it. **There is no alarm when the latest code can't publish.**

## Product / Process Signals
1. **`verify-dist` runs only at publish time, not on PRs.** The `sidecarUrl` leak merged cleanly and only failed at the publish gate — after merge. Running it in PR CI catches IP-hygiene + public-surface regressions *before* merge.
2. **Snapshot pipeline silently skips on cancelled develop CI** → no develop snapshot since 06-19; masked the unpublishable state.
3. **Provenance + self-hosted runners are incompatible** — the SDK publish path must use `oidc_opt_out`; a manual dispatcher hits this every time. Worth defaulting/ documenting.
4. **Auto-publish-on-merge is single-package-safe** (agent-app) but wrong for shared monorepos (ADC keeps the Version-PR gate). The blast-radius distinction is the reusable principle.

## Skill Effectiveness
N/A — this was direct execution + release engineering, not skill-dispatched/measured work. No `.evolve/` measurement infra (appropriate for this kind of work). Note: the reflect run-grading template fits dispatch campaigns better than ship/release sessions; adapted the table accordingly.

## Action Items (by impact)
1. **Add `verify-dist` (+ `pnpm pack` dry-run) to ADC PR CI** for the public SDK packages — catch dist-hygiene/public-surface leaks before merge, not at publish. *Highest leverage; would have prevented the entire #2533 detour.*
2. **Fix the snapshot-skip-on-cancelled-CI** so develop snapshots flow again (and stop masking unpublishable states).
3. **Document/default `oidc_opt_out` for the self-hosted SDK publish** so manual dispatches don't 422 on provenance.
4. (Parked) `/files/write` `mode` → retire agent-app's exec path entirely. Low payoff, sidecar-service change.

## Next (executable)
No skill dispatch warranted — there's no metric to optimize, no architectural thesis to pursue, no eval gap; the work shipped and verified. The next actions are **concrete infra fixes**, not a skill:
- **Next: open an ADC PR adding `verify-dist` + `pack` dry-run to PR CI for `products/sandbox/sdk`** (action item #1). Direct code fix; highest leverage.
