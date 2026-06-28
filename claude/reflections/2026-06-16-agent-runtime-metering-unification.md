# Reflect: agent-runtime session — driver metering → single-ledger journal unification
Date: 2026-06-16

## Run Grade: 8/10

| Dimension | 1–10 | Evidence |
|---|---|---|
| Goal achievement | 9 | 4 PRs merged (#314/#315/#316/#319). Started as "finish the previous agent's broken/uncommitted work"; grew into driver pool-bounding, executor unification, §1.5 fix, full driver-inference metering, and a single-ledger journal redesign. Every PR mergeable + green. |
| Code quality | 9 | Conservation invariant preserved through a foundational journal-schema change; both adversarial review passes returned **SOUND** (each token counted once at root + nested depth, hand-traced). Tests 979→1007. Caught + fixed the previous agent's broken `scope.signal` (would've failed typecheck + threw every run). |
| Efficiency | 6 | The git entanglement (branch-switching in the shared checkout swept a parallel agent's event-bus work into a stash) cost a multi-step recovery the operator had to redirect. The pragmatic→root rework (extraRootSpend bridge → journal unification) was a partial redo, though operator-driven. |
| Self-correction | 9 | Adversarial reviews caught: the unsafe `maxTurns=0` (no real bound), the usd-channel guard gap, the crash-orphan drift, the dead `observedTotal`. Recovered the parallel agent's work into a clean PR rather than losing it. Diagnosed the stale-`dist/` typecheck artifact twice (not a code bug). |
| Learning | 7 | The worktree lesson was learned *mid-session, after the operator flagged it twice* — then applied consistently (#316/#319 built in isolated worktrees). Should have been the default from turn 1. |
| Overall | 8 | Strong, correctness-rigorous delivery of 4 merged PRs; marred by one avoidable process failure the operator had to correct. |

## Session Flow Analysis

1. **Verify-gate → adversarial-review → fix → commit (the MVP loop).** `trigger`: any non-trivial change ready to commit. `steps`: full gates (lint/typecheck/test/build) → spawn a Workflow of independent adversarial reviewers reading the real code → act only on *verified* findings → commit → PR. `outcome`: caught a would-be-shipped broken guard, an unsafe unbounded loop, a usd-channel hole, and a crash-path drift — **before** any of them merged. Ran ~4×. Highest-leverage flow of the session.

2. **Worktree-per-work-line (learned mid-session).** `trigger`: independent work-line in a shared, multi-agent checkout. `steps`: `git worktree add -b feat/X off main` → symlink node_modules → build+verify in isolation → push + PR → `git worktree remove`. `outcome`: #316/#319 built with zero entanglement after the lesson landed.

3. **Recover-foreign-work.** `trigger`: detected uncommitted work in the shared tree that I didn't author (a parallel agent's event bus). `steps`: don't discard → verify it compiles + passes on its own → PR it as its own clean branch (#316). `outcome`: the parallel agent's work shipped instead of being buried in a stash.

## Project Health

**agent-runtime** — trajectory: **improving**. The supervise/coordination spine got materially more correct this session: the conserved-pool now meters the driver's own inference (the largest token consumer, previously invisible), and all cost reading single-sources on the journal. Test coverage meaningful (1007 tests; the new ones assert real invariants — conservation, nested re-homing, crash re-home, replay fidelity — not just happy paths). Architecture: cleaner, not debt — the `metered` event is symmetric with the existing `settled`/`reconcile` pattern. Next highest-value action: a real equal-k bench run *with a coordination-driver arm* — newly valid now that the bench's `routerDriverChat` forwards usage (it didn't before #319).

## Cross-Project Patterns

- **"Unify on one ledger / one source of truth" recurs as the operator's taste.** Same shape as the executor unification (#315: one worktree-harness core) and the cost-ledger unification (#319: one journal). When two representations of the same fact exist, the operator wants them collapsed — even at the cost of touching the foundation.
- **Adversarial-review-before-commit mirrors the repo's own thesis** (selector≠judge; verifier > self-consistency). The session re-derived the product's core insight as a working habit.

## Skill Effectiveness

- **Workflow (parallel adversarial review)** — the standout. Every invocation paid for itself with a real finding. One footgun: the first review's *return shape* was buggy (read `.findings` off the wrong pipeline stage → null results); recovered cheaply via `resumeFromRunId` (cached agents, ~instant). Learning: in `pipeline()`, the return is the *final* stage's output — combine review+verdict inside the stage, don't read stage-1 off the result.
- **Skill not used that should be a standing gate:** "review the diff before committing" is valuable enough to be automatic, not ad-hoc.

## Product Signals

- **Parallel agents in a shared checkout entangle — silently.** A `git stash -u` swept another agent's uncommitted work; a branch-switch nearly stranded it. The harness already supports `isolation: "worktree"` for agents — this should be the **default** for any repo where multiple agents work concurrently. This is a real product gap, not a one-off.
- **"Pragmatic bridge vs root fix" needs an explicit operator gate.** I shipped the `extraRootSpend` bridge (correct, latent-safe) and the operator immediately escalated to the root unification. Signal: for changes to a *foundational invariant* (here, equal-k), default to the root design and surface the trade-off, rather than shipping a bridge that becomes a future footgun.

## Proposed Automations

1. **Worktree-by-default for this repo.** A pre-work hook or convention: any new work-line → `git worktree add` off main, never branch-switch the shared checkout. (Settings/hook change, not a skill.)
2. **`/review-before-commit` as a standing gate** — wrap the "full-gates + adversarial-Workflow + act-on-verified-findings" loop into one invocation, since it caught every real bug this session.

## Action Items

1. **(process) Adopt worktree-isolation as the default** for multi-agent work in agent-runtime — the one avoidable failure of this session. Highest impact.
2. **(forward) Bench equal-k run with a coordination-driver arm** — now valid post-#319 (the bench meters driver inference). Tests the binding "non-blind topology vs blind at equal-k" question with a real driver arm for the first time. Cross-repo (bench/agent-lab); optional, only if that research line is live.
3. **(hygiene) Extract the durable learnings to memory** (below).

## This reflection, recursively

The session's own lesson — *isolate before you act, verify before you assert* — is exactly the discipline the metering work encodes (one ledger, debit-before-overspend, review-before-commit). The process failure (shared-checkout entanglement) was a violation of the same principle the code was busy enforcing.

---

**Skill dispatch:** No `/evolve` — this was infra/correctness work, not a metric to optimize (no baseline/target). The executable forward step is operational, not a skill: **adopt worktree-by-default** (action item 1). The one research-adjacent dispatch is cross-repo and optional: `Next (optional, in bench/agent-lab): run the equal-k gate with a coordination-driver treatment arm — newly valid now that #319 meters driver inference.`
