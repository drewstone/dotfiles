# Reflect: agent-runtime usability/simplification mega-session
Date: 2026-06-20

Single-session reflection. One continuous conversation that re-architected agent-runtime's DX:
23 commits on `feat/usability-overhaul` (WS6/WS7 still executing in a background agent), all
green at every step, clean-merges `origin/main`. NOT merged; benchmarks typecheck-clean but
not run live.

## Run Grade: 7.5/10

| Dimension | Score | Evidence |
|---|---|---|
| Goal achievement | 8 | Brain unified (`DriverChat` deleted; `supervisorAgent` resolves the brain from `profile.harness` — sandbox-supervisor **proven offline**); surface 355→277 + subpaths 13→6; docs 26→17 + canonical-api 984→76 + the CLASS-6 "can't-lie" gate; `spawn_worker→spawn_agent` (+ observe/steer family) + `depth/breadthDriver→Strategy`; `supervise()` one-call. Gaps: not merged; WS6/7 (improve facade + example prune) in flight; bench only typecheck-revalidated. |
| Code quality | 8.5 | 1058 tests green at EVERY step; each refactor gated (tsc+test+lint+docs:check); the keystone proven with equal-k metering preserved byte-for-byte; the CLASS-6 prose-symbol gate is a durable artifact (smoke-proven: injecting `refineGepa()` reddens it). No regressions. |
| Efficiency | 5.5 | Enormous single session. Heavy internal over-deliberation before acting (repeatedly). 2 execution sub-agents died on 529-overload → I finished manually both times. |
| Self-correction | 8.5 | Owned every operator correction (retryWithDiagnosis-verb, routerBrain half-measure, await_human, round/turn); grounded claims (fetched Symphony not from memory; caught the critique's own `gepaDriver` error before propagating it); the red-team workflow caught my OWN over-merge ("improve = one engine", "gate = one verb"). |
| Learning | 6 | Captured exhaustively in the living tracker + §7.5 (tabled) — nothing forgotten — but zero `memory/` writes during the session (this reflection fixes that). |
| Overall | 7.5 | Strong technical execution + a real DX win + honest gates; deductions for length/over-deliberation, not-yet-merged, and the additive instinct the operator corrected 5×. |

## Session Flow Analysis

**FLOW 1 — operator corrects my ADDITIVE instinct (the dominant pattern, 5×).**
- Trigger: I propose a new verb/primitive/seam (`retryWithDiagnosis`, `await_human`, `routerBrain` as the answer, a 6-verb set).
- Operator collapses it: *"scratch it" / "you're overthinking" / "why routerBrain — it should be an AgentProfile with harness" / "retry is the driver's prompt-policy, not a verb."*
- Outcome: the subtractive version wins — the **AgentProfile atom + prompts/skills**, per the §1.5 law (author the profile, don't write a verb/loop/harness-config).
- **This is THE recurring failure: under momentum I default to mechanism; the operator's taste is subtractive.**

**FLOW 2 — design-question → grounded-take → build (the session's BEST pattern).**
Operator asks *"what do you think? are we aligned?"*; I red-team / audit / fetch to ground, then synthesize + build green. The red-team caught over-merges; the Symphony fetch grounded the positioning. **Adversarial grounding before committing is the antidote to FLOW 1.**

**FLOW 3 — "keep going / finish it / don't leave anything for later."**
Momentum push; I execute workstream-by-workstream, green-gated, committing each. Coherent — but a 23-commit mega-PR is hard to review as one unit.

## Operator questions → product gaps
- *"can supervisor be a sandbox? why routerBrain?"* → §1.5 wasn't enforced in the API; the brain must **materialize from the profile**, not need a hand-built seam. (Fixed: WS1b.)
- *"what is makeWorkerAgent/perWorker/blobs/driveHarness?"* → leaky deps = DX smell. (Fixed: `supervise()` one-call.)
- *"spawn_worker or spawn_agent?"* → the verb lied. (Fixed: rename.)
- The Symphony thread → the commercial positioning.

## Project Health — agent-runtime
- **Trajectory:** improving sharply (DX, naming, docs, surface; capabilities intact at 1058 tests).
- **Coverage:** meaningful offline (keystone + metering + sandbox-supervisor proven). **Real gap: the benchmarks have NOT been run live on the branch** — only typecheck-clean. That is the missing "capabilities intact" proof.
- **Architecture:** cleaner (one brain seam, atom-driven). Debt: `AgentRunSpec` rename deferred (28 files, public — needs a major bump); the multi-round supervisor design tabled (§7.5); WS6/7 in flight.
- **Next highest-value:** finish WS6/7 → full gate → **run the benchmarks live** → split/merge the 23-commit PR.

## Skill / system effectiveness (workflows + sub-agents)
- **HIGH value:** the adversarial red-team (caught the over-merge), the grounded audits (surface/docs/Symphony-fetch). Read-only parallel audits/red-teams are the workhorse — use them freely.
- **RISK:** execution sub-agents die on 529-overload (2/2 this session). **Lesson: delegate AUDITS freely; delegate EXECUTION expecting to verify + finish it yourself.**

## Product signals
- **agent-runtime = a self-improving Symphony** (grounded by fetching `openai/symphony`: static-config reconciler, "done" = a board state not a passing check, blind-retry → ~50-60% fail + no learning). Wedge: the completion oracle (`gateOnDeliverable`) + the analyst→`improve` loop + supervisor-on-any-harness. **A paying customer already uses Symphony.**
- The DX north star ("derive the call path in seconds") IS the product.
- The tabled multi-round supervisor/driver/worker = the long-horizon autonomous-plan-execution product.

## Proposed automations
- **A "no new verb" review check**: before adding a public function/verb, force the §1.5 question — "could this be a profile / skill / prompt?" (My #1 failure; a checklist would catch it.)
- **The CLASS-6 prose-symbol gate generalizes** into a reusable "docs can't lie" tool for any TS package.

## Action items (by impact)
1. Finish WS6/7 (background agent) → full gate (lint+tsc+test+build+docs:check).
2. **Run the benchmarks LIVE on `feat/usability-overhaul`** — the real capability revalidation (currently only typecheck).
3. Split the 23-commit PR into reviewable units (or merge as one with a clear summary).
4. Then untable §7.5: the real-time trace self-correcting driver (the product capability the operator most wants).

## Recursive note
The session itself reveals: a full re-architecture done as ONE mega-conversation is coherent (green at each step) but unreviewable as one PR. The meta-lesson — checkpoint large refactors into staged PRs — and my own over-deliberation is the efficiency tax to cut.

## Next (executable)
Not `/evolve` (no metric to optimize). **Next: after the WS6/7 agent lands, run `bench` live on the branch** (`pnpm --dir bench gate` / the commit0-rsi or canonical suite with creds) to prove capabilities survived the simplification, THEN split/merge. The simplification is typecheck-green, not bench-run-green — that's the one unproven claim before merge.
