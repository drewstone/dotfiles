---
name: orchestrate
description: "Full method for /orchestrate — the structure×policy tables, the Workflow compile mapping, when a barrier is justified vs not, a worked bespoke composition, and the rate-limit / wall-clock math that makes pipeline beat barrier."
---

# Orchestrate — Full Reference

`/orchestrate` is the meta-conductor. It turns the skill library from a fixed menu of recipes into a composable language: given a goal too large or novel for any single skill, it decomposes the work, chooses a coordination shape, wires existing skills as the stages, compiles the shape down to a `Workflow` script, runs it, and synthesizes. Skills are the primitives; the value here is the grammar — the specific graph you author for one goal.

It is not `/governor` (which selects one existing skill and exits) and not `/multi-pursue` (a fixed shape of N `/pursue` tracks). Orchestrate chooses the shape and composes the primitives. When the goal actually reduces to a single skill or a fixed N-track fan-out, hand off to those — this reference exists to keep orchestration from being summoned when a straight line would do.

## Two axes: structure × policies

A workflow is not one item chosen from six. It is one **dependency structure** carrying any number of **coordination policies**. The six patterns people name are really two on the structure axis and four on the policy axis — treating them as peers on one list is the category error that makes the worked example (which uses four at once) look impossible.

### Structure — pick exactly one

| Signal in the goal | Structure | Why it fits |
|---|---|---|
| Per-item work; each item's stages depend only on that item | **pipeline** (default) | Chains run concurrently; no stage waits on a sibling. |
| A stage must see all prior outputs — dedup, global merge, cross-item rank, first-hit race, consensus vote | **barrier** | The next step is a genuine reduce over the whole set. |

### Policies — layer any

| Signal in the goal | Policy | Why it fits (and what already ships) |
|---|---|---|
| One search method has correlated blind spots | **diversity** (multi-modal sweep) | Each agent searches a different way, blind to the others, so misses decorrelate. Sweep + verify + synthesize on the web is already composed as `/deep-research` — dispatch it, don't re-author. |
| "Find everything" with an unknown total count | **termination** (loop-until-dry) | Keep spawning finders until K≈2-3 consecutive rounds return empty. |
| "Is this finding real?" — any claim you'll act on | **verification** (adversarial-verify) | N≥3 independent skeptics per finding; majority-refute kills it. |
| Output varies run-to-run and scoring beats generating | **selection** (judge-panel / tournament) | N independent attempts, parallel judges score, synthesize from the winner + graft runners-up. Build the judge's rubric with `/eval-agent` and gate it with `/calibrate-before-measure` first — an uncalibrated judge that can't see the quality gap turns the whole panel into noise. `/arena-experiment` is this policy already composed for equal-compute architecture comparisons. |

Selection's precondition is falsifiable: if the judge is not more reliable than the generator, N judges cost more than they buy — don't layer it. A real workflow is one structure × several policies; see the worked example.

## Compiling the graph to a Workflow

Orchestrate does not stop at a nice plan handed to the operator. It compiles the authored graph down to a `Workflow` script and runs it. Hand-rolling batching or isolation instead of compiling is the same "don't hand-roll" failure the skill warns about, one level down.

| Shape | Compiles to |
|---|---|
| pipeline | `pipeline()` of `agent()` per item; the per-item chains run under `parallel()`. |
| barrier | a `parallel()` batch, closed by a `phase()` boundary, then the reduce `agent()`. |
| diversity (multi-modal sweep) | one `parallel()` batch of `agent()`s, each with a divergent brief. |
| termination (loop-until-dry) | a driver that re-dispatches a `parallel()` round and stops after K consecutive empty rounds. |
| verification (adversarial-verify) | `parallel()` skeptics per finding + a majority `reduce`. |
| selection (judge-panel) | `parallel()` attempts + `parallel()` judges + one synthesis `agent()`. |

Two rules the compile must honor, both carried from `/multi-pursue`:

- **Isolation for parallel writers.** Any stage whose agents mutate files in parallel uses `isolation: 'worktree'`, and the shared index/registry is reserved for the synthesis step — never two agents writing one file.
- **Partial-failure tolerance.** One throw in a `parallel()` batch cancels every sibling. Wrap each fanned-out `agent()` so a failure returns `{status:'failed', reason}` instead of throwing, so one bad agent can't kill the other eleven. loop-until-dry and adversarial-verify then treat a missing return as an abstention (a skipped vote), not a crash.

## When a barrier is actually justified — and when it isn't

The barrier is the most expensive structural choice: it converts N parallel chains into "everyone waits for the slowest, then one stage runs." Justify it only when the stage after it is a genuine function of the whole set.

**Justified — you can name the reduce step:**
- **Global dedup / merge** — you can't dedup finding #3 against #47 until both exist.
- **Cross-item ranking** — "top 5 of everything" needs everything in hand.
- **Early-exit race** — first success cancels the rest (the barrier is at the OR, not the AND).
- **Consensus vote** — adversarial-verify's majority needs all skeptics reported.

**Not justified — use a pipeline instead:**
- "Summarize each file" — each summary needs only its file. No barrier.
- "Fix each failing test" — independent. Stream them.
- A barrier added "to collect results before reporting" — reporting is not a computation over the set; stream results as they land.

Rule of thumb: **if you can name the reduce (dedup, rank, merge, vote, race), the barrier is real; if the only thing after it is "print them," delete the barrier.**

## Concurrency and wall-clock

- Concurrency is bounded by **rate limits, not a fixed number of live agents** — there is no reliable magic constant. `/critical-audit` already notes that ≥3 parallel agents in a 10-minute window draws enough backpressure to prefer serial. Measure the effective width for your session, and let the `Workflow` primitive own batching and queuing rather than hard-coding a batch size.
- The wall-clock argument holds at any width N:
  - **Pipeline ≈ the slowest single chain.** Chains run concurrently up to width N and stream through in waves beyond it; it is never the sum of stage times. Ten 3-stage chains finish in about one chain's time when N covers them, not ten.
  - **Barrier ≈ slowest-in-batch + the reduce + slowest-in-next-batch.** Every barrier adds a wait-for-the-tail penalty set by the slowest agent in the batch (the p90 straggler sets the clock).
- A pipeline degrades gracefully as waves stream through; a barrier stalls the whole next stage on the last wave's tail. That is why pipeline beats barrier whenever the barrier isn't buying a real reduce — true regardless of the exact concurrency width.

## Worked example — "Audit our SDK for security + correctness bugs and ship the fixes"

A composite goal no single skill covers. Decompose first, then compose one structure × several policies.

Decomposition:
- Bugs are found independently across files/modules → fan-out, no barrier there.
- "Is this bug real?" needs independent checking → a verification barrier.
- Fixes are mostly per-bug independent → pipeline, with a barrier only at the final merge.

Spine: a **pipeline** with one **barrier** at verification and one at the final merge. Policies layered on it: diversity (stage 1), termination (stage 2), verification (stage 3). Selection isn't needed here — that's a choice, not an omission.

**Stage 1 — diversity sweep (parallel, blind).** Three finder families, blind to each other so their blind spots don't correlate:
- `/semgrep` — static rules.
- `/harden` — adversarial / invariant reasoning.
- `/critical-audit` — staff-engineer read of the diff/surface.

Compiles to one `parallel()` batch of divergent-brief `agent()`s; each streams candidate findings into the pursuit file. No barrier — findings are independent.

**Stage 2 — termination (loop-until-dry) on the hottest module.** If stage 1's densest file keeps yielding, a driver re-dispatches `parallel()` rounds of `/critical-audit` finders on it until 2 consecutive rounds come back empty.

**Stage 3 — verification barrier.** For each candidate finding, 3 independent skeptics whose job is to refute it (reproduce it, or show it's a false positive). Compiles to `parallel()` skeptics + a majority `reduce`; majority-refute kills the finding. A true barrier — the verdict is a vote over all skeptics, and a missing skeptic return counts as an abstention, not a crash.

**Stage 4 — fix pipeline.** Each surviving finding → one `agent()` that fixes root cause and adds the regression test that catches it. `isolation: 'worktree'` per fix; the shared test index is reserved for synthesis. Independent — no barrier; fixes stream through in waves.

**Stage 5 — merge barrier + `/converge`.** Collect the fixes, resolve shared-file conflicts (a real reduce → barrier), run the suite, drive CI green.

Synthesis: one artifact — findings confirmed vs refuted (with the vote), fixes landed with their test names, and what the sweep missed that only surfaced under verification.

Notice the shape: a `/hypothesize` survey stage wasn't needed (the approaches were known), so it isn't in the graph. Authoring the graph to this specific goal is the skill. A different goal ("we don't even know which approaches to try") would open with `/hypothesize` and branch differently.

## Opt-in and cost

- Orchestrate does not self-trigger. A trivial or single-skill task must not summon a multi-agent workflow; the operator invokes it by name or an explicit "compose / fan-out / orchestrate this" ask.
- Budget honestly: a 5-stage workflow with fan-out can spend dozens of agent-runs and the token cost that implies. State the expected agent count in the plan **before** dispatching, so the operator can veto.
- The do-not test: can you name (a) the fan-out — what runs in parallel — and (b) the reduce or verification the composition buys? If you can name neither, run the single skill and stop; this was ceremony.

## Persist and dispatch

Write `.evolve/pursuits/<date>-orchestrate-<slug>.md`: the decomposition graph, the structure + policies chosen per edge, the skill filling each stage, the compiled `Workflow` outline, the expected agent count, and the synthesis rule. Append a `skill-runs.jsonl` line. A workflow that can't be resumed from its file after a context reset isn't externalized.

The dispatch is a single action — run the composed workflow, not a per-stage checklist handed back to the operator:

```
Next: run Workflow <slug> — diversity sweep → loop-until-dry → verify barrier → fix pipeline → merge (~N agents)
Stop: goal reduces to one skill (/critical-audit) — no fan-out, no reduce; dispatching that instead
```
