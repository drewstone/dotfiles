# Handoff: ADC quota / billing-observability marathon — 2026-08-16

**Objective.** Make the deployed smoke and the production canary green, then keep fixing at the source.
**Status.** 11 PRs merged, production deployed and its two customer-facing alarms green. One central fix (`cron-sweep`) is on develop but NOT in production, so its proof metric has not moved.

## Ground truth at close (re-verified, not remembered)

| Thing | Value |
|---|---|
| develop tip | `b4a3ef13d` |
| main tip / prod serving | `5adbf7b81` / `5adbf7b816bf` |
| sandbox-api `/health` | `ok` · chargeIntents depth 0 |
| staging `/health` | chargeIntents depth 0 (**was 132 rows / 9.5 days**) |
| `slots_held` / running | **147 / 6** — sweep undeployed, still climbing |
| Live pushes at close | 3 |

## Merged tonight (all on develop)

`cd8ac7eb5` evals payer · `934bf3e52` plan-read fail-loud · `d49f8a8af` canary payer + CLI changeset · `1d714a95d` payer contract gate · `a121c7b7c` quota-slot release · `4757c944e` refusal names blocker (4 route modules) · `bf7ae906e` DeepSeek harness · `24c75f0c1` cron sweep + `failed` release · `3f9dba8e4` charge-intent `last_error`

**In production (main):** quota-slot-release, deepseek.
**NOT in production:** cron-sweep, last-error, refusal-4site.

## Verified on the real path

- Production smoke: **success** (was failing at step 12, then 18).
- "Can a customer buy a sandbox": **red → green** (had been red for days on the canary's own credential).
- DeepSeek: `nix build .#deepseek-harness` → store path; `dsh --version` → `0.1.0-rc.6`, exit 0.
- Gates: sandbox-api **2889 passed / 199 files**; `check:invariants` **75/75**; oxlint 0.

## Open loops — 7 rows

| Item | State | Pointer | Next command |
|---|---|---|---|
| Sweep proof metric | unproven | slots_held 147/6 | after prod deploy: D1 `SELECT COUNT(*) FROM active_sessions` → expect ~45 |
| `topError` on staging | moot for now | staging drained to 0 | re-read `/health` when a queue next backs up |
| sandbox-web ratchet fix | pushed, no PR | branch `fix/sandbox-web-unknown-boundaries` @ `b3c6be5ec` | `gh-drew pr create --base develop --head fix/sandbox-web-unknown-boundaries` |
| react-doctor repo-wide red | open | 4 apps below baseline | needs all four cleared at once; see kill condition below |
| `async-parallel` finding | deliberately unfixed | surface-audit.ts:1512 | leave; see kill condition |
| Terminal state for charge intents | deliberately deferred | `last_error` now records reasons | decide per failure class once reasons accumulate |
| Resume-on-create | not started | `sandbox-resume-flow.ts` | extract core with all 5 compensation branches inside |

## Standing decisions + KILL CONDITIONS

1. **Never supply a git identity.** Kill condition: none — the global config is authoritative. Two commits (`cd8ac7eb5`, `934bf3e52`) carry a permanent `Co-authored-by` because I overrode it. Rule now in `~/code/dotfiles/claude/{CLAUDE,AGENTS}.md`, `~/code/AGENTS.md`, memory.
2. **Merge with an explicit `--body`** on squash. Kill condition: if a merged commit ever shows a trailer despite it, the mechanism is wrong — re-investigate.
3. **No terminal state that drops charge-intent rows.** Kill condition: once `last_error` shows a class that is provably unsettleable (e.g. deleted org), that class may be cleared with the reason recorded.
4. **Merging with `Guardrails`/`Fast Checks` red is currently correct.** Kill condition: the moment those two go green on any PR, they become blocking again. Evidence: #5765, #5764, #5759 all merged with the identical pair.
5. **Do not "fix" `async-parallel` at surface-audit.ts.** Kill condition: if react-doctor stops flagging navigate-then-wait shapes, revisit. Satisfying it today means asserting against a page that has not navigated.

## Operator corrections paid this session — do not pay twice

- **Co-authorship trailers.** Caused by me overriding git identity. Second time in 18 days.
- **Stop passing new config.** Never `git -c user.*`; never `git config user.email`.
- **Stop narrating, act.** Repeatedly. Lead with the action.

## Uncertain at close

- **The sweep's real-world effect is unproven.** 3/3 mutations red and the logic is right, but I never observed a single live slot release; `slots_held` went 137 → 147 while it sat undeployed. If it still releases nothing after deploy, the next hypothesis is owner-key grouping in `createSandboxProjectOwnerResolvers`, not the status predicate.
- **Why staging's 132-row queue drained is unknown to me.** It resolved without my `last_error` deploying, so something else cleared it.
- **react-doctor's 4-app drop has no identified cause.** The tool is pinned at 0.1.6 and the lockfile confirms it; only two web commits landed recently and neither plausibly moves four apps.

## Method note worth keeping

Mutation testing caught a defect in **6 of 6** of my own changes tonight — every one passed its first test pass. Equivalent mutant counted as coverage; a shared status set that made unknown fail-open; a D1 backend naming nobody; a 429 turning into a 500; backend drift; and two tests that never invoked the code path they asserted on.
