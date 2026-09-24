# Speed loop

Use this when the target is latency, throughput, cost per task, or any other quantity that agents can push by iterating.
It adds speed-specific rules to the main evolve loop.

Sources: Max Woolf, "Agentic iteration" (minimaxir.com, 2026-09), and Anthropic, "How we made claude.ai faster" (claude.dev, 2026-09).
In the first, repeated constrained rounds produced 7.5x to 32x cumulative speedups across model generations.
In the second, one sprint made four user journeys 3.1x faster by geometric mean, with 3,000 merged changes and no rollbacks.

## Define the journey and the number

- Name the user journey and the clock the user feels, for example "text sent to first reply" or "request to first agent token".
- Report the p75 or p95 wall time from the field, and name the percentile.
- Set a numeric target for each round, such as "at least 1.2x faster on every benchmark case". A vague goal ("make it faster") invites feature work and gaming. A target above about 2x per round invites cheating. A target below about 1.1x wastes the round.
- Keep the benchmark cases broad: several input sizes, cold and warm paths, and the slowest realistic case.

## Measure deterministically, then ratchet

- Wall time is what users feel, but it is too noisy for a CI gate.
  Find a deterministic proxy that moves with it: CPU instruction counts (Valgrind, `node --predictable`), engine call counts, React commits per interaction, hooks and subscriptions mounted, style recalculations, layout shifts, database queries per request, network round trips, bytes shipped, or process spawns per turn.
- Validate the proxy once against wall time on the real path. The claude.ai team saw a 48% instruction cut give 78% faster wall time, and a 31% cut give 44%.
- Add the proxy to CI as a ratchet. The number may only go down; a win is locked in by lowering the ceiling.
- Measure what normal metrics miss: hidden reloads, duplicate cache writes, work repeated each turn, and one-byte versus two-byte string paths.

## Guard the benchmark against gaming

- Freeze the benchmark harness and its inputs. The agent may not edit them, and a git diff audit of the benchmark directory is part of review.
- Run benchmarks one at a time, never in parallel, on the same host and flags.
- Forbid the shortcuts that fake a speedup: skipping work (fewer epochs, a disabled subsystem), changing input sizes, native-CPU-only flags, and unsafe code unless it is explicitly allowed.
- Keep a correctness check beside every speed check: outputs match a reference implementation, and quality metrics may lose no more than an agreed limit (for example 5%).

## Iterate to convergence, then break through

- Loop: profile, form a hypothesis about the dominant cost, change, measure, keep or revert.
- Stop a line of work when a round gains only 3 to 5% while adding disproportionate code.
- After convergence, run one breakthrough round. Say that incremental tuning is exhausted, forbid hyperparameter-only changes, and ask for a fundamentally different algorithm or architecture.
- Fan out hypotheses: start several independent subagents on cheaper models, each on a different region of the code, reporting ideas without running the benchmark. Then the owner implements and measures the best ones one at a time.
- Run a deletion pass: cut at least 20% of source lines through deduplication, and keep every file under 1,000 lines. Smaller, simpler code often runs faster.
- Race a competitor: benchmark against the strongest alternative under fair rules, and set the target relative to it (for example at least 2x faster than all of them).

## Ship safely and at scale

- Put each user-visible change behind a feature flag: a kill switch or a gradual ramp. Retire flags once a change is proven.
- Roll out in stages: internal users, then 1%, then everyone. Some problems appear only in the field (the claude.ai prerender layout shift could not be seen in headless Chrome).
- Confirm the win in field telemetry by platform and build before lowering the ratchet.
- Run many narrow threads at once, one per slow journey or bottleneck, each with a named human owner who judges user-visible trade-offs from before-and-after recordings.
- Drop changes whose benefit does not justify their complexity ("2 ms per send is not worth it").
- Push ambition explicitly. Teams that told their agents "be braver" got bigger structural wins than teams that accepted local tuning.

## Report

For each round, report the journey, the percentile, before and after, the deterministic proxy and its ratchet value, the correctness check, the rollout stage, and what was tried and rejected.
