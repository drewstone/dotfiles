# Reflect: session — 2026-08-07 — n=1 (2026-08-05 18:00 → 08-07, continuous)

**Verdict:** The lab ran its first supervisor and it beat the un-steered control **15/20 circuits to 1/20**, and the same session **published a cost that was wrong** — arm S's 4.4 h driver was never billed, so `$21.94` is a floor and `0.68 wins/$` a ceiling. measured
**Biggest cost this period:** 1 corrected headline in a `SETTLED` doc to finding #1; it would have propagated into every downstream supervision-vs-solo cost decision.
**Next:** /diagnose on "promotion by copy" with baseline 3 duplicated modules (deepswe runlog, pricing ×3, pursuit-vs-traces journal).

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-05 18:00 → 08-07, 2 session-limit interruptions |
| Sources | `git log c69fb4e..HEAD` (15 commits + 1 merge), PR #75 (MERGED, verified `git ls-tree origin/main src/pursuit/`), 4 pursuits under `.agent/pursuit/`, `traces analyze --session 30315b60 --llm --model glm-5.2`, `docs/results/qopt-supervised-vs-arena.md` |
| Prior reflections read | 3: `2026-08-05-supervisor-lab-first-real-task.md`, `2026-08-06-discovery-lab-evolution-campaign.md`, `2026-08-05-agent-eval-autoresearch-supersession.md` |
| Not inspected | 2.75 GB `.run-*` legacy dirs; the `improvement` LLM analyst (timed out against the router mid-run, findings absent not zero) |

## Findings — top 6 of 11, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | A killed run bills its workers and not its driver, and the budget file reads identically to a run that had no driver | 1 of 4 pursuits | 1 wrong headline in a `SETTLED` doc; 35–47% of an arm unpriced | run-validity of every cost comparison | measured | `budget.json` `kind=='supervisor'` count: S=0, S2=1 ($2.48/35%), smoke=1 ($1.25/47%) | `driver-charge-OPEN.json` written before the session, removed on charge (shipped) | me |
| 2 | 0% skill invocation across 751 tool calls, in a session that hand-rolled 4 procedures that ship as skills | 4 | ~2h re-deriving `/handoff`, `/report`, `/finalize`, `/arena-experiment` | ~2h/session | measured | `traces analyze` → "Explicit skill invocations: 0 (Skill tool spans)"; adoption rate 0% of 1 group | Invoke the skill or state in one line why it does not fit | me |
| 3 | **Promotion by copy** — a module is "promoted" by duplicating it, leaving both | 3 | reviewer-blocking nit on #75; 2 runlogs and 3 pricing copies coexist | 1 review round + drift risk per copy | measured | `src/pursuit/runlog.ts` header says "promoted from `bench/deepswe/runlog.ts`", `git diff --stat` shows deepswe UNCHANGED; pricing byte-identical in `qopt-supervised-dispatch.ts:108` + `qopt-report.ts:235` | Migrate the original and delete it; pricing done (`bench/qopt-pricing.ts`), runlog open | me |
| 4 | `biome.json` was never parsed — the repo had been linting against biome DEFAULTS, not its own config | 1 | 41 files reformatted → 15 spurious merge conflicts against main | ~1h merge-conflict resolution | measured | `//` comments in strict JSON → parse error; rename to `biome.jsonc` surfaced 283 real errors, then 5, then 0 across 324 files | Config renamed; `.agent/**` + `.evolve/**` excluded | me |
| 5 | Failed tool calls are retried against the same tool without changing anything first | 25 of 25 | ~15 wasted calls | ~25 calls/session | measured | `traces` → "25/751 failed; 25/25 failed calls followed by another same-tool call (100%)" | A failed call must produce new state before the same tool is called again | me |
| 6 | The lab's own analyzer could not read the lab's own supervision runs | 4 of 4 | 7 run-level facts invisible, incl. 53% idle wall | 1 analyzer pass/run | measured | `traces analyze --supervisor-run-dir .agent/pursuit/qopt-S-20260806` → "no supervisor run found" | `src/pursuit/journal.ts` emits `spawn-journal.jsonl`; all 4 now read | me |

5 findings dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Three private implementations of a contract that ships | 2026-08-05 (`HANDOFF` §2.8) | 2 | `src/pursuit` built to end it | It was built by COPYING deepswe's runlog, not migrating it — the count went 3→4 (finding #3) | **Yes — /diagnose; the fix reproduced the defect** |
| Pre-push hook reads the checkout's HEAD, not the pushed ref | 2026-08-05 (action #3) | 2 | not done | Never scheduled | No — 30 min, carry |
| Prune `.run-*` to receipts | 2026-08-05 (action #4) | 2 | half — `.agent/pursuit/<id>/` adopted and used by 4 runs | 2.75 GB legacy dirs untouched | No — carry |
| Calibrate before measuring | 2026-08-05 | 3 → **held** | `/calibrate-before-measure` | Held this session: prereg written before any arm, gate refused on a real digest drift pre-launch | No — closed |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| False self-certification | 6 of 17 (35%) | **0 of 112** | −35pp | 112 attempts | measured | ledger `claim_mismatch` across 4 pursuits |
| Circuits verified-improved, supervised | — | 15 of 20 | — | 20 | measured | `qopt-supervised-vs-arena.md` |
| Same, un-steered control | — | 1 of 20 | −14 | 20 | measured | same |
| Wins per dollar, S vs T2 | — | 0.48–0.58 vs 0.17 | ~3× | — | inferred (driver cost unmeasured, finding #1) | same §8 |
| Idle wall, supervised vs control | unmeasured | 53% vs 0.3% | — | 326.6 min / 50.5 min | measured | `traces analyze --supervisor-run-dir` |
| Attempts settling with nothing gradeable | unmeasured | 52 of 70 | — | 70 | measured | same |
| Vitest suite | 1105 passed, 2 failed | 1133 passed, 0 failed | +28, −2 | 73 files | measured | `pnpm exec vitest run` |
| Registered spend | — | $30.33 of $49 | — | 4 pursuits | measured | `budget.json` ×4 |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Pre-register, then let the gate refuse | Caught a profile-digest drift a formatting pass introduced, BEFORE any paid arm ran | 1 of 1 |
| Machine-write the certification at the delivery site | False claims went 6/17 → 0/112 | 112 |
| Autopsy the raw transcripts before accepting a doc's framing | The committed "agents lied" framing was refuted — all 6 complied and starved mid-repair | 6 of 6 |
| Re-verify a subagent's headline claim | S2's FINAL said the `clifford_10` bar fails its own check; reproduced at infidelity 0.0 — false | 1 of 1 |
| Write the test that pins two copies together | Caught an arithmetic error in my own hand-computed constant | 1 of 1 |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Migrate deepswe onto `src/pursuit/runlog` and delete `bench/deepswe/runlog.ts` | promotion-by-copy | 2 runlogs → 1 | ~2h | next session | me | `git ls-files bench/deepswe/runlog.ts` empty; deepswe dry-run writes `status.json` |
| 2 | Overlap driver decisions with in-flight workers | 53% idle wall | 53% → <25% | ~3h | next run | me | `traces analyze --supervisor-run-dir` idle% |
| 3 | Ship the machinery↔domain boundary check, red-before-green | shared code learning domain facts | 14 lab→domain edges → 0 | ~3h | this week | me | scanner red on `profile-arena.ts:69`, then green after the fix |
| 4 | Make delivery the first-class worker objective | 52 of 70 ungradeable | 52 → <20 | ~1h | next run | me | `settled down` count per run |
| 5 | Pre-push hook reads the pushed ref (2nd raise) | false conflict blocks | ~1/push | ~30min | this week | me | push a branch not checked out |

## Durable notes written
Reuse check: extended `memory/agents-falsely-self-certify.md` (reframed stale-not-dishonest); checked — no existing note for the other four (grep'd `driver|unpriced|traces|skill invocation|domain boundary` over `~/.claude/projects/-home-drew-code-supervisor-lab/memory/`, 0 hits each).

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| `memory/killed-run-bills-workers-only.md` | A killed supervised arm omits its driver's cost entirely; 35–47% of arm total on runs that settled. | — |
| `memory/run-the-analyzer-before-reporting.md` | Run `traces analyze --llm` on the operator session before reporting its result; measured 0% skill use in 751 calls. | — |
| `memory/supervisor-custodial-first-win.md` | Custodial driver 15/20 vs 1/20 un-steered; value is steering/reallocation/routing, never decomposition. | — |
| `memory/domains-are-not-the-mess.md` | 24 domains, 0 machinery→domain imports; the leak is shared code learning domain facts. | — |
| `memory/worktree-submodule-phantom-failures.md` | Worktrees skip submodules → empty skill catalog → ~31 phantom test failures. | — |

## Self-gate
8/8 passed — failed: none.
k-of-n · cost both sides · status label · repeat check · Verdict names one number + one dispatch · actions name lever+target+owner+verification · zero adjectives standing in for counts · words 421 ≤ 600.
