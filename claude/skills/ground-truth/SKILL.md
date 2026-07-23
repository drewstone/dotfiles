---
name: ground-truth
description: Measure every stage on the real production path before optimizing a live system.
---

# Ground-truth harness first

You're about to make a live system faster / more reliable, or debug why it's slow / broken / flaky. **Stop.** The opening move is visibility, not a fix. A change to a system you can't fully SEE is a guess; the expensive failure is a whole effort spent on a baseline that was never real (local ≠ production, one slice ≠ end-to-end, "lever exists in code" ≠ "measured firing on the real path"). Build the harness first — the fixes are the easy part.

**The gate:** answer with real-environment numbers — *"what is the measured, real-path, end-to-end breakdown right now, and which term dominates?"* Can't answer → you're ready to build the harness, not to optimize.

**Stand up all of it in ONE parallel fan-out** (concurrent lanes → converge; serial-grinding over days is the anti-pattern this kills):

1. **Instrument every hop** — per-stage timing on the ACTUAL path end to end (client→edge→API→orchestrator→host→thing), read live (`Server-Timing` header, per-phase diagnostics, spans). Zero dark segments >~20ms; an uninstrumented one is the FIRST PR, before any optimization.
2. **Benchmark the REAL path** — where code actually runs (deployed, jailed, cross-region), not the local stand-in. A local number is a hypothesis about production until the production path emits it. Label every number: vantage, env, warm/cold, n, exact command.
3. **Reversible test loop** — prove changes on real infra WITHOUT mutating shared state (local real-infra e2e / isolated cell / dry run). If the only way to test is hand-patching shared staging, BUILDING THE LOOP IS THE TASK — hand-patching shared state is the tell you skipped this.
4. **Trace your own run** — `traces analyze --harness claude-code --last 1` via the published `@tangle-network/traces` CLI (install with `curl -fsSL https://raw.githubusercontent.com/tangle-network/traces/main/install.sh | bash`, or run once with `npx --yes @tangle-network/traces@latest analyze --harness claude-code --last 1`) EARLY, not after the user is furious. It catches what you can't see from inside: status-without-a-moved-number, re-measure churn, a fake baseline.
5. **Baseline + ranked lever map** — one measured current-state number + the decomposition naming the dominant term and what's irreducible (security/physics floor) vs cuttable. Cut the biggest REAL term first.

Don't shave the easiest-to-reach term — measure, then cut the dominant one. If a number surprises you (too good, too flat, a post-deploy regression), autopsy it against raw rows before reporting — a surprising number is a hypothesis about the harness until the data says otherwise.

## Then consider

- Harness up + baseline measured → `evolve` to drive the dominant lever to target with the ratchet.
- `report` to present the decomposition + threats-to-validity + ranked actions as a domain-expert artifact, not prose.
- First measurement marginal → `dont-collapse-the-architecture` (the regime that makes the lever pay off may not be active yet).
