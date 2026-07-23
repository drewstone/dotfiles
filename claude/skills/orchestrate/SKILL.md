---
name: orchestrate
description: Decompose and run a multi-agent workflow when no single skill covers the goal.
---

# Orchestrate

Every other skill is a recipe. This one is the grammar that writes a new recipe for a goal that has none — when the honest move isn't running a skill but composing several into a workflow built for this goal alone. Skills are the primitives; orchestrate is the grammar.

`/governor` reads state and picks the single next skill, then exits. `/multi-pursue` runs one fixed shape — N independent `/pursue` tracks, always. `/orchestrate` **chooses** the shape and **composes** the primitives, then compiles the result to a `Workflow` script and runs it end to end: it can wire `/hypothesize` → parallel `/pursue` tracks → `/critical-audit` skeptics → synthesize, or any graph the goal demands.

Shared conventions in `_common.md`.

**This is not free and does not self-trigger.** A workflow fans out many agents and spends real tokens; the operator opts in by name or an explicit "compose / fan-out this" ask. If one obvious skill covers the task, or the work is trivially sequential with no fan-out and no independent check, orchestration is pure ceremony — run the skill.

## When to use

| Signal | Skill |
|---|---|
| One skill clearly covers it | that skill directly — orchestration is ceremony |
| Pick the single next skill and stop | `/governor` |
| Always the same N `/pursue` tracks | `/multi-pursue` |
| Deep web research: sweep → verify → cited report | `/deep-research` — the pre-composed research instance |
| Equal-compute "which agent architecture wins?" | `/arena-experiment` — the pre-composed tournament instance |
| Goal fans out into independent stages, or is too novel for one skill | **`/orchestrate`** |
| "Find every X, then dedup and rank" (a stage needs all prior results) | **`/orchestrate`** — barrier |
| "Try it N ways and take the best" | **`/orchestrate`** — selection policy |

## The grammar: one structure, N policies

A workflow is not one pattern picked off a menu — it is one **dependency structure** with any number of **coordination policies** layered on top. Getting this right is what makes "orchestration is the grammar" true instead of a slogan.

**Structure — pick exactly one, read off the dependency graph:**

- **pipeline** (default) — per-item stages; each item's chain depends only on that item, so chains run concurrently and wall-clock ≈ the slowest single chain.
- **barrier** — one stage needs every prior result (dedup, global merge, cross-item rank, first-hit race, consensus vote). Costs a wait-for-the-tail; pay it only when you can name the reduce.

**Policies — layer any, orthogonal to structure:**

- **diversity** — multi-modal sweep: each agent searches a different way, blind to the others, so misses decorrelate.
- **termination** — loop-until-dry: keep spawning finders until K≈2-3 consecutive empty rounds.
- **verification** — adversarial-verify: N≥3 independent skeptics per finding, majority-refute kills it.
- **selection** — judge-panel / tournament: N attempts scored by parallel judges, synthesize from the winner and graft the runners-up. Use only when quality varies run-to-run and scoring is more reliable than generating (else the panel is noise).

A real workflow is one structure × several policies. The worked example in the reference rides a diversity sweep + termination + a verification barrier on a pipeline+barrier spine — four policies, one graph.

## Procedure

1. **Decompose — independent vs barrier edges.** Split the goal into units and label each edge: does stage B read only its own input (independent → pipeline) or every result from stage A (a reduce → barrier)? The dependency graph picks the structure. Most "sequential-looking" work is per-item independent — check before you serialize.
2. **Pick the structure, then layer policies.** One structure (pipeline unless you can name the reduce), plus whichever of diversity / termination / verification / selection the goal needs. Name each so the plan is auditable.
3. **Author the graph, compile it to a `Workflow`, and run it.** Nodes are existing skills (a bare subagent only when `skills` lists nothing that fits); edges are the step-1 dependencies. Compile the graph down — the structure becomes a `pipeline()` or a `parallel()` batch closed by a `phase()` boundary, and each policy its own construct (per-policy mapping in the reference) — then run it; do not hand stages back to the operator to run by hand. For file-mutating parallel stages set `isolation: 'worktree'` and reserve the shared index/registry for the synthesis step.
4. **Tolerate partial failure.** One throw in a `parallel()` batch cancels all its siblings, so wrap every fanned-out `agent()` to return `{status:'failed', reason}` instead of throwing. loop-until-dry and adversarial-verify must treat a missing return as a datum (a skipped vote), not a crash.
5. **Synthesize.** The synthesis chooses, combines, or rejects — never dumps parallel summaries. State the expected agent count in the plan before dispatch so the operator can veto.

## Rules

- **Compose primitives; don't hand-roll — including the execution layer.** A stage that re-implements what `/pursue` or `/critical-audit` already does is drift; hand-rolling batching, queuing, or isolation instead of compiling to the `Workflow` primitive is the same mistake one level down. Reach for a bare subagent only when `skills` lists nothing that fits.
- **Pipeline by default; a barrier only when you can name the reduce.** A barrier idles the whole batch on its slowest agent — pay that only for a true dedup / merge / global-rank / race / vote. If stage B reads only its own item, delete the barrier.
- **Adversarially verify before you believe.** Every load-bearing finding gets N≥3 independent skeptics; majority-refute kills it. A finding one agent produced and no one attacked is a hypothesis, not a result.
- **If one skill covers it, orchestration is ceremony.** The cost of a fan-out plus a synthesis pass must buy something one skill can't: real parallel work or independent verification. Name the fan-out and the reduce, or run the single skill and stop — a straight line of one skill never needed this.

Use `references/full-reference.md` for the structure×policy tables, the Workflow compile mapping, the barrier justified-vs-not rule, a worked composition, and the rate-limit / wall-clock math.

## Then consider

- `governor` — if, after decomposing, the whole goal reduces to one skill: dispatch that and skip orchestration.
- `multi-pursue` — when the authored plan is exactly N independent `/pursue` tracks; it's the fixed, specialized version.
- `deep-research` — when the goal is web research: sweep → verify → cited report is already composed; dispatch it, don't re-author.
- `arena-experiment` — when the goal is an equal-compute architecture comparison; the selection policy shipped whole, with its own calibration gate.
- `calibrate-before-measure` / `eval-agent` — the guard and rubric-builder for any judge-panel stage; prove the judge can see the quality gap before you trust the panel.
- `hypothesize` — as the first stage when "what should the stages even be" is itself unknown; rank the approaches, then compose.
- `critical-audit` / `harden` — the skeptic stage inside a verification barrier.
- `autopsy` — when a composed workflow returns null or contradictory results; root-cause whether the structure or a single stage was wrong.
