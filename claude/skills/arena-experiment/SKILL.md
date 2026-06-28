---
name: arena-experiment
description: Design + run a rigorous, equal-compute, executable-graded comparison of agent ARCHITECTURES (topologies, coordination policies, profiles) across a controlled difficulty axis — to find WHERE one approach beats another, not just whether it solves a task. Use before any "does smart multi-agent / topology X beat dumb loop / baseline Y" experiment. Reuse the substrate; never rebuild the harness.
---

# Arena experiment — when does the way you organize agents matter?

A normal benchmark asks *"can this agent solve this task?"* (a capability question). An **arena experiment** asks a different question: *"does the **way** you organize agents matter — and **when**?"* (an architecture question). The two need different apparatus. Reach for this whenever you're comparing topologies / coordination policies / dispatch strategies — `single-steered` vs `dumb-Ralph` vs `worker-heavy` vs `supervise()`, blind vs diverse, compaction on/off, etc.

## Law 0 — reuse the substrate, build only the difficulty dial

This harness already exists. **Do not rebuild it** (a prior session reinvented `AgenticSurface` as a lab-local `Arena` class and had to delete it). Verify the symbols still exist, then use them:

- **The task = an `AgenticSurface` / `Environment`** (`agent-runtime` `src/runtime/strategy.ts`): `open / tools / call / score / close`. A stateful, **probe-able** workspace — this is the discovery-capable seam (NOT `BenchmarkAdapter`, which is stateless one-shot grading and cannot express probe-to-localize).
- **The run = `runBenchmark`** (`agent-runtime` `src/runtime/run-benchmark.ts`): sweeps `Strategy[]` over one Environment at **equal conserved budget**, scored by the Environment's own executable check. Topologies are just `Strategy`s (BYO).
- **Discovery already ships**: `commit0-env.ts` (agent-bench) hands the agent `list_files / read_file / run_tests` and makes it localize the work by probing — a discovery environment exists; copy its shape.
- **Per-arm cost attribution already ships**: `SupervisedResult.spentBreakdown = { driverInference, childWork }` — brain-vs-worker tokens, computed from the journal. Read it; don't recompute.
- **Held-out / dev split already ships**: `deterministicSplit` (agent-eval `benchmarks/types.ts`).

**The ONE thing worth building** is the *coordination-difficulty dial*: a hermetic, seed-driven, offline (Docker-free) `AgenticSurface` generator whose task structure varies how much coordination the work demands. That belongs in **agent-bench** (fleet-reusable), as a new surface alongside `createCommit0Environment` — not in a lab.

## The five things to fix before you spend a token

1. **Goal** — one line: *map the threshold on a difficulty axis above which an intelligent coordinator beats a mechanical loop at equal compute, and explain why.* Not "is multi-agent good."
2. **Hypotheses** — falsifiable, per difficulty level, with a stated kill condition. Always include the **null control**: the zero-coordination task where the dumb loop *should* win (independent units, full spec). If you can't say what result would kill the hypothesis, you don't have one.
3. **Test subjects** — the *architectures* are the subjects (primary independent variable). The **difficulty level is the moderator** (codec=0 → discovery → dependency → flaky). Model / budget / seed are held fixed per run, swept across runs (capability moves the threshold — a weak brain may never win; it flails).
4. **Methodology** — pick a level → **calibrate (gate, below)** → run all topologies at equal budget through `runBenchmark`, n seeds → grade held-out + executable → capture per-arm `spentBreakdown` + traces.
5. **Rigor** — equal-compute by *conserved pool* (same tokens, not same call-count); held-out + no-cheat firewall; **n ≥ 24**, paired bootstrap + BH correction, report win/loss/**ties** (sub-floor deltas are NOISE); **pre-register the dial setting** so you can't quietly tune difficulty until "smart" wins.

## The calibration gate (do this BEFORE the comparison — invoke `calibrate-before-measure`)

The arena's whole value is that it lets you measure in the RIGHT regime. So prove the regime bites first:
- **Ceiling ≫ single-steered** by a wide margin → the task overflows / the capability is required. If a dumb baseline ties the ceiling, the difficulty dial is at zero — every topology will tie, and you'll mislabel a null as a finding.
- **The dumb baseline is FAIR, not a strawman** (bounded checklist, real grind — not an O(N²) caricature). A rigged-easy dumb arm is the most common way to fake a smart win.
- **The metric discriminates** (a great solution and a broken one separate cleanly on the executable check).

No comparison spend until all three pass.

## Why this exists

A whole session tried to make the LLM-brain supervisor win by managing its context (self-compaction, lean prompt) — **three experiments, all failed**, because the cost was the *coordination loop* (spawn/await/observe rounds), not the size of what it read. And the task it was run on (10 independent codec modules) **structurally cannot show a coordinator winning** — it's the null control. The lesson: every "does smart multi-agent help" result is meaningless until you know *where on the difficulty axis you measured*. The arena exists to put you in the regime where the question is a fair fight, with the rigor primitives (equal-compute, held-out, per-arm cost) inherited, not hand-rolled.

## Then consider (post-hook — after this skill completes)

- **Calibration passed + a positive result** → `push-past-easy`: try to KILL it (re-run for variance at n≥24, hunt the confound — prompt-caching, baseline fairness, model flakiness) before reporting.
- **A null on a hard arena** → `dont-collapse-the-architecture`: a null at one difficulty level is not "coordination is worthless" — turn the dial up / change the structure / try a stronger brain before concluding.
- **A surprising / too-clean number** → `autopsy`: read the raw artifacts and per-arm `spentBreakdown` before believing it.
- **Reporting the finding** → `report`: BLUF + the full per-arm table (every measured dimension, all topologies, the calibration gap, threats-to-validity) — never a curated subset.
