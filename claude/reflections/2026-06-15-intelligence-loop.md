# Reflect: Tangle Intelligence loop session
Date: 2026-06-15

## Run Grade: 8/10

| Dimension | 1–10 | Evidence |
|---|---|---|
| Goal achievement | 9 | The stated arc — close the intelligence loop + produce a certified artifact — landed. 8 PRs merged (#298/#2065/#2066/#2071/#2076/#2077/#2080/#2083); loop wired miner+consultant→auto-replay→ground-truthed-cert→ship; first cert demonstrated LIVE (Δ+100pp). Deduction: the cert is a *mechanism* demo, not a real-customer value cert (see Critical Insight). |
| Code quality | 8 | Tests at every step (20 miner / 6 checker / 30 consultant), typecheck+biome clean per PR, dedicated billing kind + reconcile + atomic claim mirror the proven consultant pattern. Deduction: most code came from autonomous workflows that shipped *buggy* first drafts — quality came from the audits, not the builds. |
| Efficiency | 6 | Real waste: the shared checkout was branch-switched by other fleet agents **mid-edit twice**, reverting uncommitted work → full rework in a worktree. The Workflow `fix` phase rate-limited and died **twice**, forcing manual fixes. Many CI-wait cycles. |
| Self-correction | 10 | The standout. Adversarial audits caught **real bugs the tangletools auto-reviewer AND I missed**: 3 miner billing leaks (cross-process double-spend, unreconciled deducts, report-sweep deletion), the consultant's dead-code disciplines, and the cert answer-key leak. Each diagnosed → fixed → verified. The Δ0 null was correctly diagnosed as the self-judge ceiling, not a bug. |
| Learning | 9 | Memory banked (`intelligence-loop-closed-first-cert.md` + index), handoff written, durable laws extracted (worktree-or-lose-edits, deepseek-when-capped, self-judge ceiling). |
| Overall | 8 | Strong, real shipped value with elite self-correction; dinged by environment friction and a "win" that is mechanism-proven, not value-proven. |

## Critical Insight (the thing we're not seeing)
**The "first certified artifact" was certified by a checker WE wrote, on episodes WE designed, with a correctable band WE knew the rule would clear.** Δ+100pp means "deepseek says `npm` without the rule and `pnpm` with it, and our substring checker rewards `pnpm`." That is the **certification mechanism proven** (genuinely valuable — it breaks the LLM-self-judge ceiling), but it is one fixed-point short of a tautology if mistaken for product validation. It is *exactly* the shape this project has already learned to distrust — see memory `small-n-mirage-power-floor` (14 designed episodes, perfect separation) and `bench-harness-gate-validity-audit` (the bench's real cert hit-rate is ~0). The product is now **mechanism-complete, value-unproven**: the binding evidence (a real customer's traces → a checker we didn't design → a delta we didn't engineer → an artifact they merge that measurably helps) is still at zero, the same place the bench sits.

## Session Flow Analysis
1. **Build → audit → manual-fix → PR** (every feature). Trigger: "build X". Steps: Workflow drafts it → adversarial-audit workflow finds real bugs → I fix by hand → PR. Outcome: shipped + correct, but the *build* step alone was never trustworthy. The audit is the quality organ.
2. **PR → tangletools multi-shot review → CHANGES_REQUESTED (real findings) → fix → merge** (miner). The external reviewer caught billing leaks. A genuine gate worth leaning on.
3. **Live run nulls → diagnose → it's a real design truth → fix → re-run** (cert, twice). Δ0 → self-judge ceiling; Δ0 again → answer-key leak. Diagnosis-of-null is high-value.
4. **Edit shared checkout → fleet reverts → rework in worktree** (twice). Pure waste; now a law.

## Project Health
- **Intelligence product:** trajectory **improving fast** (8 PRs/1 session, loop closed). Architecture clean (reuses substrate; no new storage; mirrors existing patterns). Test coverage meaningful at the unit level; **integration/live coverage is the gap** (the replay worker has no background cadence; certification has only ever run on synthetic episodes). Next highest-value: a *real* deployable checker + an *undesigned* cert.
- **Risk:** mechanism momentum outrunning evidence. Lots of plumbing shipped; the value loop is unproven on real data.

## Skill / System Effectiveness
- **Adversarial-audit Workflow:** highest ROI — found real money bugs twice. Keep using it as a mandatory gate after every build.
- **Build Workflow (dynamic):** produced buggy-but-close drafts; net-positive only *because* it was always followed by an audit + manual fix. Its `fix` phase is **not rate-limit-resilient** (died twice).
- **Frontier-panel Workflow:** high value for the "what won't it do / what would we wish" question — produced the roadmap.
- **gh-drew + REST PATCH:** the `pr edit` GraphQL path 502s on deprecated Projects; REST PATCH is the reliable title/body update.

## Product Signals
- **"git for self-improvement" is mechanism-real, value-pending.** The honest pitch is "we can certify improvements with ground truth" — but we have not yet certified one we didn't construct.
- **Model portability is a resilience win:** when OpenAI/Anthropic capped, deepseek-v4-flash carried the whole loop. The loop is not provider-locked (ticket #1017).
- **Multi-agent-on-one-checkout is a real DX hazard** (mid-edit reverts). Worktree-per-agent or a checkout lock is a tooling product signal.

## Proposed Automations
- **Resilient Workflow fix-phase:** retry/resume on `Rate limited` instead of dying (cost 2 manual recoveries this session).
- **Worktree-per-agent default** for shared fleet repos (encode the law in tooling, not just memory).

## Action Items (impact-ordered)
1. **Real deployable checker** — run the actual command/CI exit-code in a sandbox; certify on episodes whose band we did NOT design. This is the only thing that converts "mechanism" → "value."
2. **Undesigned cert run** — point the loop at real `claude -p`/agent traces (or the bench's logged episodes) and see if it certifies anything we didn't engineer. Report win/loss/ties at n≥24 (power floor).
3. Wire the replay worker to a background cadence (it only runs via `/v1/replay/tick`).
4. Carry the dropped analysis signal (`actionItems`/CI/effect) into remedies so the author stops working blind.
5. Deploy-config `INTELLIGENCE_AGENTIC_MODEL=deepseek-v4-flash` (ticket #1017).

## Recursive note
This reflection itself nearly celebrated a designed-band demo as a product win — the same trap. The discipline that keeps recurring (small-n mirage, gate validity) is the project's real meta-lesson: **distrust any delta whose band you designed; trust only deltas on data you didn't construct, at power.**

---
Next: `/pursue` — build the real deployable checker (sandbox command/CI exit-code), then run an UNDESIGNED certification at n≥24 to convert mechanism→value. Do NOT `/evolve` the substring checker; the architectural gap (real ground truth on real data) is the binding one.
