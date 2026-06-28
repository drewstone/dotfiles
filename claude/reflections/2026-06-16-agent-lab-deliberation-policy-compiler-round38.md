# Reflect: agent-lab Deliberation Policy Compiler Through Round 38
Date: 2026-06-16

## Run Grade: 8/10

| Dimension | Score | Evidence |
|---|---:|---|
| Goal achievement | 8 | The goal is Gen 2 trajectory-to-policy synthesis. EOPS now has two strong scoped hard-policy wins after the previous reflection: Round 29 add-CI/report-incident passed 6/6 generated tasks and beat OpenCode DeepSeek raw by +83.3pp, CI [+50.0,+100.0]; Round 30 live no-match state audit had 0/105 false routes and 0/105 mutations. AppWorld was adopted through exported `@tangle-network/agent-bench` without runtime edits, but the global AppWorld policy failed fresh transfer. |
| Code quality | 7 | The AppWorld runner now supports round-stamped artifacts, bounded concurrency, directive files, redacted previews, and env scrubbing. `pnpm typecheck`, EOPS harness test, JSON/JSONL parse, secret-pattern scan, and `git diff --check` passed. Deduction: agent-lab still has a large dirty tree, many historical auto-archived artifacts with pending verdict rows, and no compact AppWorld family-miner abstraction yet. |
| Efficiency | 8 | Rounds 31-38 cost under $1 in observed router pricing for AppWorld paid cells and answered three questions: exported bench readiness, global policy transfer, and reasoning-horizon interaction. The horizon/fresh-transfer checks prevented false promotion. |
| Self-correction | 9 | The run caught a serious artifact hygiene issue: one GLM AppWorld trace printed inherited env vars. The artifact was redacted, the runner now deletes secret-bearing env vars before child sessions, and the artifact secret scan is clean. The loop also killed its own global-policy candidate after fresh transfer failed. |
| Learning | 9 | The strongest learning is precise: EOPS task-conditional workflows transfer; global AppWorld procedure prompt does not. Kimi shows reasoning-horizon elasticity, but more turns can harm a policy. This supports Aviv's framing that the optimized unit is the induced deliberation policy: route + representation + budget + stopping rule + output contract. |
| Overall | 8 | This is good science and useful product direction. It is not yet a polished SDK story or broad cross-domain promotion proof. The next step must mine task-conditional AppWorld policies instead of writing broader global prompts. |

## Session Flow Analysis

1. Flow: Governor dispatch -> reflection -> fast exploit loop.
   Frequency: `2` governor rows, `35` skill-run rows total, `24` `/evolve` rows.
   Outcome: good velocity, but reflections lag behind experiment count. Rounds 26-38 ran after the last reflection before this one.
   Automation potential: auto-trigger `/reflect` after any transfer-kill or after five `/evolve` rows, whichever comes first.

2. Flow: Source-slice positive -> fresh transfer check -> no promotion.
   Frequency: AppWorld Rounds 34-38.
   Outcome: `appworld-operator-policy-v1` looked weakly positive on train (`0.4375 -> 0.4514`, `1/24` full solve), then failed dev transfer (`0.4000 -> 0.4000`, `0/8` improved, higher cost). This prevented a bad claim.
   Automation potential: every candidate ledger entry should require a fresh-transfer artifact before `promotionStatus=promoted`.

3. Flow: Broad/global capability fails -> task-conditional policy survives.
   Frequency: repeated across static skills/tools/capability packs and now AppWorld.
   Outcome: generic skills/tools were already weak or zero; AppWorld global operator policy is now also not promoted. EOPS task-conditional policy remains the strongest line: add-CI/report-incident passed generated matched tasks, raw comparison, and live no-match state safety.
   Automation potential: policies should be routed by task/failure family. No more global prompt paragraphs unless they are only a baseline arm.

4. Flow: Runtime changed -> agent-lab adopts exported surface.
   Frequency: Round 31.
   Outcome: `agent-lab` uses exported `@tangle-network/agent-bench` through `link:../agent-runtime/bench`; no runtime edits. The AppWorld path is a bench-native stateful loop, not an AgentProfile workflow surface yet.
   Product signal: the integration story is improving, but the public SDK layer still needs a clean "send traces, get policy candidates, run gates" workflow.

## Project Health

Trajectory: improving scientifically, messy operationally.

Validated strengths:

- EOPS add-CI/report-incident: policy `6/6` generated tasks and `12/12` verifier rows; OpenCode DeepSeek raw `1/6`, lift `+83.3pp`, CI `[+50.0,+100.0]`.
- EOPS live safety: `0/105` target false routes and `0/105` state mutations.
- AppWorld exported bench: `24/24` non-Claude cells judgeable on Round 33 with `0` backend errors.
- AppWorld horizon finding: raw Kimi `12 -> 24` turns improved `0.4375 -> 0.4792`; policy Kimi `12 -> 24` harmed `0.5000 -> 0.3611`.
- Fresh-transfer discipline: AppWorld global policy not promoted after dev tied raw and cost more.

Current weaknesses:

- Scorecard was stale until this reflection; now updated through Round 38.
- `runs/RUNS.md` still contains many auto-archived pending-verdict rows from older artifacts.
- AppWorld policy mining is still hand-authored at the global-policy level; no AppWorld task/failure-family miner exists yet.
- The public product path remains too research-heavy: customers cannot yet add the stack in a small integration and receive mergeable policy improvements.

Next highest-value action:

- Build the AppWorld task-conditional mining loop. The target is not a stronger paragraph; it is a compiler that clusters failures and routes narrow policies only where measured headroom exists.

## Cross-Project Patterns

- Agent-runtime and agent-lab are converging on the same architecture: agents are profiles, skills/tools are mounted surfaces, and stateful artifacts are the unit of improvement. This reflection did not modify `agent-runtime`.
- The best results come from objective stateful verifiers, not LLM judges. EOPS SQL verifiers and AppWorld evaluator both expose partial-credit failure structure.
- Overfitting risk is being managed by fresh transfer. The AppWorld policy kill is a good sign for research integrity: the system rejected its own tempting positive.
- The product promise should not be "we found a magic prompt." It should be "we learn when a policy applies, what budget it needs, and when to abstain."

## Skill Effectiveness

Measured from `.evolve/skill-runs.jsonl`:

| Metric | Value |
|---|---:|
| Skill-run rows | 35 |
| `/evolve` rows | 24 |
| `/pursue` rows | 5 |
| `/multi-pursue` rows | 1 |
| `/reflect` rows before this one | 1 |
| `/governor` rows | 2 |
| Experiments ledger rows | 136 |
| Missing experiment classifications | 19 |
| Duration min / median / p90 / max | 3 / 35 / 74 / 126 min |

What worked:

- `/evolve` remains the best exploit loop for objective gates.
- `/multi-pursue` was useful when the problem decomposed into mining, safety, and gate planning.
- `/governor` made the right call here: reflection was due before another spend loop.

What needs improvement:

- Skill-run rows still lack transcript pointers.
- Old experiment rows still have `classification` gaps.
- Scorecard updates should be part of every reflection, not a manual catch-up.

## Product Signals

1. Strongest product claim:
   A self-improving harness can compile task-conditional policies from traces and improve stateful tool agents. EOPS has scoped proof with real lift and no-match safety.

2. Weakest product claim:
   A global skill/prompt makes agents better everywhere. AppWorld directly argues against this: source-slice positive, longer-horizon negative, fresh-transfer null.

3. SDK implication:
   The minimum shippable product should expose trace capture, candidate mining, candidate gating, and promotion records. It should not ask users to hand-build research campaigns.

4. Research-paper implication:
   The flagship claim should be non-universality: different models/tasks need different deliberation policies and horizons. Rounds 34-38 are clean evidence for that framing.

## Proposed Automations

1. AppWorld family miner:
   Read Round 33-38 artifacts, cluster by task family, failure names, pass denominators, and transcript failure hints. Emit candidate families like answer-finalization, Venmo mutation, and low-score dev `530b157_*`.

2. Candidate transfer auditor:
   Given a source-slice positive candidate, automatically run a fresh split/offset transfer before it can be promoted.

3. Horizon sweep planner:
   Treat max turns as a policy coordinate. For each candidate, test at least raw/policy across two horizons before declaring a policy effect.

4. Artifact hygiene guard:
   Keep env-scrub and redaction in every stateful benchmark runner. Add a test fixture that simulates secret-looking output and verifies artifact redaction.

5. Scorecard updater:
   Reflection should recompute or update scorecard metrics from experiments/artifacts and mark stale metrics explicitly.

## Action Items

1. Build AppWorld task/failure-family miner over Rounds 33-38.
2. Emit task-conditional policy candidates with route predicates, required evidence, budget, and stopping rule.
3. Gate at least one candidate on fresh AppWorld tasks against raw Kimi and one second non-Claude model.
4. Add an artifact-redaction test for the AppWorld runner.
5. Backfill the 19 missing experiment classifications if this line becomes a paper/report appendix.

## Dispatch

Next: `/multi-pursue` targeting AppWorld task-conditional policy mining.

Brief: Baseline is Round 38 fresh-transfer null: global `appworld-operator-policy-v1` tied raw Kimi on 8 unseen dev tasks (`0.4000` vs `0.4000`) and cost more, so it is not promoted. Run independent tracks for: failure-family miner, task-conditional policy compiler/router, and fresh AppWorld gate runner. Success criterion: at least one narrow AppWorld policy family beats raw on fresh tasks with no secret-leak artifact matches and no broad global-prompt promotion.
