# Reflect: session — 2026-08-13 — n=1

**Verdict:** 10 of 11 implementations were refuted by adversarial review before merge; 5 of those defects were customer-visible incidents (free unbillable compute, destroy-a-live-run, wrong answer to a running agent) — measured.
**Biggest cost this period:** ~5h of production stuck on a stale revision, to finding #2.
**Next:** /handoff targeting the 3 open agent-sdk issues with baseline "1 upstream-blocked, 1 unstarted, 1 unfixed"

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-12T20:00 – 2026-08-13T21:00 |
| Sources | agent-sdk PR#152,156,157,158,160,165 + Version Packages 153,155,159,164; ADC PR#5316,5317,5326,5367,5371,5372,5373,5380,5381,5420 (all MERGED, verified `gh pr view`); agent-runtime PR#810,811; npm: runtime 0.133.8, interface 0.49.0, provider-tangle 0.7.3, sandbox 0.22.0 |
| Prior reflections read | 3: 2026-08-13-adc-durability-proof-and-five-day-deploy-block.md, 2026-08-11-adc-prod-outage-and-release-unblock.md, 2026-08-11-adc-handoff.md |
| Not inspected | ADC PRs by other agents merged in the same window (5409–5423); agent-runtime 0.133.1–0.133.8 (published by others); whether prod f7ef0446 still contains my tranche |

## Findings — top 6 of 9, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Adversarial review refuted 10 of 11 implementations; 2 needed a 2nd round. 5 defects were customer-visible: free unbillable compute to any verified account; `recoverRetainedRun` reporting a LIVE run as `null` whose docstring says destroy; timeout overwriting a user's applied answer; capability read deleting a fresh sandbox on a transient 500; a question answered on the wrong interaction, acknowledged `accepted` | 10/11 | ~6h review wall-clock | 5 incidents avoided (unmeasured $) | measured | 3 workflow journals under `subagents/workflows/wf_*/journal.jsonl` | keep the gate mandatory on behavior changes | operator |
| 2 | Prod stuck on a stale revision ~5h. Root cause was NOT CI: 4 dispatch/config errors — bare-SHA `ref` broke checkout, workflow ran on `develop` vs a `main`-only branch policy, `runtime_policy`/`sandbox_product_policy` default to change-detection which skipped, and a stale local `deploy.yml` hid inputs 2–3 | 4 | ~5h prod on old rev | ~5h/incident | measured | run 31670539396 (`branch or tag '8610da459' could not be found`), 31671464491 (D1 job failed 1s, `protected:false` + `main`-only policy), 31671955753 (all deploy jobs skipped), 31672206678 (force → success) | read `origin/main` workflow, never the local copy; use `--ref main` + explicit `force` | operator |
| 3 | Remote CI has ZERO enforcement power and cost hours of waiting: org on GitHub Free, repo private, `main` and `develop` both `"protected": false`, protection + rulesets endpoints 403 | 1 | 3 full CI re-runs, all red on infra | ~2h/occurrence | measured | `gh api /orgs/tangle-network` → `plan.name:"free"`; `/branches/main/protection` → 403 | PR#5381 merged: local gate now covers 19/19 jobs, 0 infra-only | shipped |
| 4 | A changeset authored on a `main`-based branch is silently never consumed (changesets `baseBranch: develop`). This stranded `box.capabilities()` at a version npm already held without it — twice | 2 | ~1h | ~1h/occurrence | measured | `git merge-base --is-ancestor origin/develop <branch>` → false; npm 0.21.1 published from 4851e468b which predates 584ad0c05 | always branch changesets off `develop`; verify `changeset status` before PR | operator |
| 5 | Two "green" signals were false and caught only by inspecting the artifact: a monitor grep reported sandbox 0.22.0 published (`npm pack` → `No matching version found`), and a capability-flag pin stayed green 9/9 while the ledger WRITE was disabled | 2 | ~20min | avoids false ship claims | measured | `npm pack @tangle-network/sandbox@0.22.0` error; reviewer mutation at `agents-sessions.ts:2470` | assert artifact existence (`npm view pkg@ver`), not a substring | operator |
| 6 | A "fix" satisfied the shared conformance harness by narrowing what it checked, not by removing the disagreement | 1 | 1 extra review round | prevents silent test-weakening | measured | reviewer: "the D1 fix removed the check that surfaced their divergence"; closed by `AgentEnvironment.capabilities?` (+13 lines, agent-interface) | diff the shared testkit on every PR that touches it | operator |

3 findings dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Serial-reveal (each review round finds one more layer) | 2026-08-07 | 7th | none durable | 2 of 11 branches needed a 2nd round; the interactions fix introduced a NEW severe defect (a lost ack wedges every later question) | Yes — 7th raise |
| Claiming a state without checking the artifact | 2026-08-11 | 3rd | "verify the remote SHA" | recurred as a monitor substring-match reporting an npm publish that had not happened | Yes — 3rd raise |

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| agent-sdk open issues | 15 | 3 | −12 | 15 | measured | `gh issue list --state open` |
| Local gate coverage of ci.yml merge jobs | 18/19 | 19/19 | +1 | 19 | measured | `node scripts/check-local-ci-covers-gate.mjs` → "0 infra-only (none)" |
| `@tangle-network/sandbox` latest | 0.21.0 | 0.22.0 | tag inversion repaired | 1 | measured | `npm view … version`; tarball carries `capabilities(): Promise<SandboxRuntimeCapabilities \| null>` |
| Implementations refuted on first review | — | 10/11 | — | 11 | measured | workflow journals |
| PRs merged this session | 0 | 20 | +20 | 20 | measured | 10 ADC + 6 agent-sdk + 2 runtime + 2 version |

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|
| Adversarial review prompted to REFUTE, with the reviewer re-running its own probes | Caught 5 customer-visible defects; caught a fix that introduced a worse defect | 10/11 refuted |
| Mutation proof for any "this test pins that behavior" claim | Flag pin stayed green 9/9 with the write disabled; after fix it reds | 3 mutations |
| Refusing to ship a half that cannot be correct | Interaction half withheld: both options deliver wrong answers or wedge a session | 1 refusal |

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Land ADC#5421 (SDK accepts an interaction id; returns the resolution body) | Unblocks agent-sdk#154's interaction half | 3→2 open | M | 2026-08-20 | Drew | provider claims `interactions` and a retry reports `already_resolved_same` |
| 2 | Fix agent-sdk#162 (native harness session id rejected as a runtime-id mismatch) | Breaks a live Braid retained run today | 1 prod bug closed | S | 2026-08-15 | dispatched | rerun the retained Braid canary to terminal output |
| 3 | Add a pre-push guard: a `.changeset/*.md` on a non-`develop`-based branch fails loud | Finding #4 (cost materialized twice) | −1h/occurrence | S | 2026-08-20 | Drew | branch off `main` with a changeset → push reds |

## Durable notes written
Reuse check: extended `~/.claude/projects/-home-drew-code-agent-dev-container/memory/reference_adc_worktree_push_preflight.md` (CI=true cannot regenerate a lockfile). Checked: no existing note on deploy-dispatch inputs (grep'd 'runtime_policy\|branch policy' over the memory dir → 0 hits).

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| memory/reference_adc_deploy_dispatch_inputs.md | Prod deploy needs `--ref main` + `runtime_policy=force`; a bare-SHA `ref` breaks checkout; `protected:false` means CI never gated | none |

## Self-gate
8/8 passed — failed: none.
k-of-n · cost both sides · status label · repeat check · Verdict names one number + one dispatch · actions name lever+target+owner+verification · zero adjectives standing in for counts · words 512 ≤ 600.
