# Reflect: session — 2026-08-16 — n=1

**Verdict:** The session shipped 45 operator commits + 1 upstream merge (agent-mail, agent-runtime#879) and ended the kb fork (audit: 18 ADOPT / 12 KEEP / 11 GAP), but the headline defect is mine: 4 of 4 claims I made about limits of Drew's own platform were wrong when tested (billing 402, egress allowlist, prime-agent missing, CLI auth), each retracted only after he pushed back. measured.
**Biggest cost this period:** ~1 day of citation-channel re-implementation + a store-lifetime of 0/1,548 reference edges to finding #1.
**Next:** /verify targeting the clean reliability window (child-death %, citation rate) with baseline 89% deaths / 0 of 264 cited.

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-15 18:00 → 08-16 22:00 |
| Sources | discovery-lab git (64 commits: 45 mine, 19 other agents), discovery git, PRs #288/#274/#879, issues #872/#875/#877/#884, brand#97/#98, agent-knowledge#140, in-session measurements |
| Prior reflections read | 3: 2026-08-15-discovery-meta-system-marathon, 08-13-profile-search-recovery, 08-10-postcompact-instrument-recovery |
| Not inspected | other agents' 19 commits in detail; live transcripts of the 5 running investigations |

## Findings — top 6 of 11, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | kb fork: kb.mjs imports 1 name, exports 15; citation channel dead for store's life (0/1,548), cites patch re-implemented owned primitives | store lifetime | ~1 day + 0 reference edges ever | wiki compounds | measured | meta/16-agent-knowledge-adoption.md; audit exports listing | Stage 4 shipped (14af01b0); Stages 1–3 queued; fork-ratio rule in AGENTS.md | me |
| 2 | I claimed platform limits without testing on Drew's own infra: 402=unfunded (was credential), egress fixed (was `egressPolicy:{mode:open}`), prime missing (is `prime-agent`), CLI auth broken (wrong env var) | 4 of 4 tested wrong | 3 wrong recommendations + operator corrections | trust + rework | measured | meta/sandbox-seats.md corrections section | rule: probe the create-API surface before claiming a platform limit; owned infra ⇒ test, never infer | me |
| 3 | Vacuous-pass class: seats `pick` exited 0 on unknown verb → dispatch into spent quota (137/140 children died, 134 at 0 tokens); same class as ASI-semicolon page crash and `sp-` prefix bug (all superperm runs resolved to NO line) | 3 this session | 1 dead dispatch window ≈ hours of retries | gate integrity | measured | c5640358; seats.mjs comment; lines.mjs comment | unknown verbs exit 2; page-exception screenshots; prefix normalization — all shipped | me |
| 4 | Killed 16 live runs by swapping node_modules without draining first | 1 | 16 runs' partial work; zero-spend 3h spiked to 76.4% | 16 runs | measured | in-session fleet check: 0 journal activity post-swap | requeue-as-starved worked; rule: drain or accept the cost explicitly before substrate swaps | me |
| 5 | Multi-agent collisions: stack drift (declared 0.53.0/installed 0.52.0) blocked ALL dispatch ~40 min; PR #274 removed the probe my gate consulted (silently) | 2 | ~40 min dispatch outage + 1 vacuous gate | coordination | measured | /tmp/dispatch log; 76eca18d | evidence-based seat health inside their boundary; hard exits | me+agents |
| 6 | Instructed-but-impossible: template ordered citing while the record tool had no cites field AND search never showed page ids | 264 pages/day | teach/gate mismatch invisible | behavior measurable | measured | PR #288; 0/264 measurement | channel opened; behavior re-measure next | me |

5 findings dropped below the bar (incl. codex fire-and-forget ×3, npm tree corruption).

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Seat economics violated by factory agents | 08-15 (#1) | 2 | seats pinned + memory file | children's harness choice was ungated; allowlist caught 88.7M codex tokens | no — allowlist now fail-closed |
| Instrument defect voids measurement (multiline check class) | 08-08 era | 5 | 2 fail-closed gates (08-10) | held locally; upstream has the SAME bug — filed agent-knowledge#140 with reproducer | no — moved upstream |
| Frontier Goodhart (periphery questions) | 08-15 (#2) | 2 | per-line charters | held: batch-2 Tier A all frontier-anchored | no |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| child deaths (all-time window) | 89% | 98% post-governor* | +9pp | 140 | measured, *confounded: spent quota + pre-governor drain | spawn journals |
| zero-spend runs, 3h window | 76.4% | 0% | −76pp | 6 | measured, small n | health.mjs |
| kb pages (per line delta) | 1,379 | 1,548 | +169 | — | measured | kb-audit |
| citation edges | 0/1,548 | channel open, 0 baseline | — | 1,548 | measured | PR #288 |
| duplicate page ids | 4 | 0 | −4 | — | measured | dedup commit |
| torn-write risk | 8/12 control tears | 0/12 durable | −8 | 12×8 | measured | kb-write.test |
| turn-level observability | 0 lanes | 2,900 turns/70 runs | — | 70 | measured | transcript.mjs |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| fail-without/pass-with with a control arm | lock crash test caught its own non-failing control; cites tests 3-of-4 fail pre-change | 2 instances |
| adversarial critics before build | agent-mail: capability-URL redesign came from critique, merged clean upstream | 28/28 tests |
| death-cause autopsy before fixing | governor arithmetic came from 82%-transport decomposition, not guesswork | 1,264 deaths classified |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Measure the clean window: child-death % and citation rate | reliability + compounding | deaths ≪89%; cites >0 | 10 min | next graded batch | me | fleet-autopsy + cites grep |
| 2 | File remaining 8 agent-knowledge issue drafts + fork-ratio check in check-stack-boundaries | upstream + fork detection | 8 issues, 1 CI check | 1 h | 08-17 | me | issue URLs; check red on kb.mjs pre-audit state |
| 3 | Adoption Stages 1–3 (search, lint/graph, claim ledger) | local code deleted | −~300 LOC | 3 h | 08-17 | me | npm test + byte-compare |
| 4 | Seat scale-out when subscriptions arrive (1 secret + 1 row each) | factory capacity | +10 boxes/seat | 5 min/seat | on purchase | drew+me | seats status |

## Durable notes written
Reuse check: fork-ratio + gate-motive rules extended /home/drew/code/AGENTS.md (discovery §"Two mechanical rules"); kb-partition + seat-split memories existed (checked: memory/MEMORY.md); no note existed on owned-platform claims (grep'd 'platform' over memory/).

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| memory/test-owned-platform-before-claiming-limits.md | 4/4 platform-limit claims wrong untested; probe create-API surface (a 400 lists valid enum values) before claiming | — |

## Self-gate
8/8 passed — failed: none.
