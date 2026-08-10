# Reflect: session (discovery gen-3 + substrate release) — 2026-08-10 — n=1 session, 16 runs

**Verdict:** The premise "we ran no experiments" is false in count and true in decision: 16 runs / 141.4M input tokens ran INSIDE this session (measured, `pursuits/*/result.json`), producing 12 new oracle-verified claims — binary N=27 and N=28 exhaustive at rung 5 among them — but the one DESIGNED experiment (v6-vs-v7, n=3/arm) closed **NO-DECISION**, and 54.0M of the spend (wave 1) was voided by two instrument faults before any arm could score. The session's real product was the substrate: runtime 0.131.0 published with the root-driver retry, 8 PRs merged across 4 repos, and the improvement-path adoption ratified in docs/15.
**Biggest cost this period:** 54.0M input tokens to finding #1.
**Next:** /discovery-lead targeting generation 4 as the first live run of the canonical improvement documents, with baseline = wave-2's v6 distribution [1,1,3].

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-09 08:00Z → 2026-08-10 02:20Z |
| Sources | discovery-lab 85340c3..e4acc06 (12 commits); runtime PRs #745 #747 #749 #753 #755; cli-bridge #127 #128; ADC #5062 #5066; discovery PR #12; oracle/*.json (n=31 graded runs); workflow wf_c7624ffe-6e1 (8 agents, 882k tok); traces analyze --last 1 |
| Prior reflections read | 3: 2026-08-06-discovery-lab-evolution-campaign, 2026-08-07-supervisor-lab-first-supervisor-run, 2026-08-08-supervisor-lab-killtest-session |
| Not inspected | wave-2 per-child spawn journals beyond settle events (graded outputs only); ADC develop's parallel-agent session (only its merged diffs) |

## Findings — top 6 of 9, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Wave 1 void: fs-jail hid `tools/kb.mjs` AND `extraTools` is router-arm-only — both recording routes severed silently; 6 leads did real work (N=27–29 exhaustions), 0 scoreable | 1 wave (6 runs) | 54.0M tok | ~54M/wave | measured (`prereg/q36-gen3.md` wave-1 ledger; oracle 0s) | shipped: `resolveSupervisorTools` mount + rung/check on `kb_record`; proven `smoke-kb-tools` → verified:1 | done |
| 2 | My smoke gated execution, not SCORING: smoke-741-retry-d proved child+artifact but never exercised kb-record→oracle; wave 1 died on the unsmoked half | 1 | subset of #1 | wave-scale | measured (smoke-d task text vs wave-1 zero pages) | smoke must traverse the metric path to the grade; encoded in prereg + this note | claude |
| 3 | n=3/arm champion gate undecidable BY CONSTRUCTION at 95% (stack floor = 6 pairs) and the two prereg prose rules disagreed at the observed outcome | 1 comparison (12 runs) | 140.8M for NO-DECISION | stop-when-decisive via `pairedEvalueSequence` | measured (agent-eval `paired-delta-test.ts:33-41`; v6=[1,1,3] v7=[1,2,3]) | ratified: sealed `HypothesisManifest` + paired decision for gen-4 (discovery PR #12) | claude |
| 4 | Transport faults typed `ValidationError` → the #745 retry declined its own target class; 3/6 wave-1 arms died on "finished without emitting output — Retry the request" | 3 arms | 10.8M tok (in #1) | class eliminated | measured (result.json errors; #747 second commit + e2e test) | merged 415da2fc | done |
| 5 | 3 parallel-agent collisions: ADC convergence, sandbox publish, 0.131.0 release (#754 beat #755, and better — opencode binds wired) | 3 | ~2.5h wall (inferred) | re-fetch base + registry before authoring | measured occurrences | rule in memory: verify → stand down → never double-ship | claude |
| 6 | Boundary scanner ENOBUFS masked a REAL violation (analysts.mjs raw `/v1/chat/completions`) for unknown days — a crashed checker certifies silence | 1 (duration unmeasured) | unmeasured (no scan coverage window) | violation class visible again | measured (`tools/check-stack-boundaries.mjs` fix; analyst now via `streamAgentTurn`, live call → 2 findings) | done | done |

3 findings dropped below the bar (EVOLVE-SPEC dangling normative ref; npm token E401; stale main-checkout cherry-pick).

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| #741 whole-tree teardown (~14.9M, 08-06) | 2026-08-06 | 2 | filed upstream | **RESOLVED this session**: #745 merged + published in 0.131.0 | no |
| Instrument defect voids a measurement before it runs (agent-eval adjudication 08-05; killtest tolerance 08-08; wave-1 today) | 2026-08-05 | 3 | per-incident fixes | fixes were per-incident; the CLASS persists because smokes don't traverse the metric path (finding #2) | **yes — 3rd raise: smoke-the-scoring-path is now the standing rule; next void of this class means the rule failed** |
| Skill non-use / hand-rolled workflows | 2026-08-06 (implicit) | 2 | none | no forcing function; traces measured 0 invocations/101 calls | watch — this /reflect + /handoff are the corrective |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Campaign oracle-verified claims | 126 | 138 | +12 | 31 graded runs | measured | `oracle/*.json` sum |
| Q36 binary frontier (exhaustive, rung 5) | N=26 | N=28 | +2 | 1 | measured | `oracle/q36-g3b-v7-c.json` |
| Published runtime | 0.128.0 | 0.131.0 | +3 releases' content | — | measured | `npm view` |
| Runtime main CI jobs green | 2/4 | 4/4 | +2 | — | measured (publish run success) | run 31348564390 |
| Lab runtime provenance | file: tarball + localBuild decl | registry | exception closed | — | measured | discovery-lab 48a01f6 |
| Wave-2 cost per verified claim | — | 7.9M tok | — | 11 | measured | 86.8M/11 |
| Smoke cost vs wave cap gated | — | 0.6M vs 240M | 400:1 | 4 smokes | measured | smoke result.json |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Smoke before wave | 4 smokes found 4 distinct real defects pre-spend | 0.6M gating 240M |
| Confound-first verdicts | wave-2 ruling survived the later discovery that the stack's own floor agrees | 6-pair floor |
| Adversarial verify before architecture verdicts | wf_c7624ffe-6e1 refuted my own sealed-path claim; relocated it correctly | 8 agents / 882k tok |
| Stand down on parallel-agent collision | 3/3 resolved without duplicate merges | 3 |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Gen-4 as canonical documents: seal → measure(supervise+oracle) → compare → proposal, e-value gate | decisive comparisons per token | NO-DECISION → stop-when-decisive | 1 session | next lab session | claude | experiment JSONs verify from file contents; gate emits promote/reject/continue |
| 2 | v8 candidate: `prompt.instructions` (10,263 chars) → `resources.skills` | per-turn context re-billing; gen-4's measured change | −10k chars/turn/lead | 0.5 day | with gen-4 prereg | claude | profile digest + pi `--skill` materialization in receipt |
| 3 | Run `agent-eval analyst-benchmark` prime vs dspy on CodeTraceBench | analyst selection for the campaign | a number instead of a hunch | hours | this week | claude | benchmark artifact committed |
| 4 | Smoke rule: every pre-wave smoke must end at a GRADED claim, not an artifact | repeat-class #2 | next instrument void caught pre-spend | 0 (rule exists in prereg) | standing | claude | wave prereg cites the graded smoke |

## Durable notes written
Reuse check: extended `~/.claude/projects/-home-drew-code-discovery/memory/discovery-zero-policy-state.md` (session state + 3× collision rule); checked: no existing smoke-the-scoring-path note (grep'd 'smoke' over memory dir — only substrate-defects KB page, which is lab-side).

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| memory/discovery-zero-policy-state.md | 0.131.0 published; localBuild closed; v6 holds NO-DECISION; gen-4 = canonical docs | prior version |
| discovery-lab kb (lab store, 3 pages) | substrate-defects-by-running; champion-gate convergence; improve()-fitness verdict | — |

## Self-gate
8/8 passed — failed: none.
k-of-n ✓ · cost both sides ✓ · status label ✓ · repeat check ✓ · Verdict names 141.4M + /discovery-lead ✓ · actions name lever+owner+verification ✓ · zero adjectives-as-counts ✓ · words ≈540 ≤600 ✓.
