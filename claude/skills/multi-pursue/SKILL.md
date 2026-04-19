---
name: multi-pursue
description: "Automated N-proposer pursue — runs multiple parallel Claude Code agents, each proposing a structurally different variant of the harness, competing on a Pareto frontier. Implements the pattern from yoonholee.com/meta-harness (raw-trace access, filesystem-based optimization, grounded proposals). Drop into any project, discover the harness (the code around the model/agent), create evals if missing, then run parallel CC proposers that evolve the architecture — not the parameters. State lives in .evolve/multi-pursue/. Use when /evolve plateaus on parameter tuning and the system needs structural code changes, or when the user says 'multi-pursue', 'meta-harness', 'parallel proposers', 'evolve the architecture', 'run N proposers in parallel'."
---

# Multi-Pursue — Automated N-Proposer Architecture Evolution

Drop into any project. Discover what to evolve. Create evals if missing. Run parallel proposers that write structurally different code. Track a Pareto frontier. Converge.

State lives in `.evolve/multi-pursue/` — part of the evolve ecosystem, not separate.

**Use multi-pursue when** /evolve has plateaued on parameter tuning and the gap is architectural. **Use /evolve when** the goal is a measurable metric and parameter changes can move it. **Use /pursue when** you need to design a generation before building. Multi-pursue IS automated /pursue — N parallel proposers instead of one human directing CC.

## How it relates to /evolve and /pursue

```
/evolve         → tight experiment loop, parameter tuning, metric optimization
/pursue         → generational architectural shift, human-directed
/multi-pursue   → automated /pursue — CC proposes architectural shifts, eval judges them
```

When /evolve runs and hits a plateau (3+ rounds, <1% improvement), it should recommend: "Run /multi-pursue — parameter tuning is exhausted, need structural changes."

When /pursue designs a generation, it can dispatch multi-pursue as the builder: "I designed the generation, now multi-pursue finds the best implementation."

**Name note:** this skill was renamed from `/meta-harness` 2026-04-19 for naming clarity — `meta-harness` is the paper's term for the pattern; `multi-pursue` is the more accurate description of what the skill does (N parallel /pursue proposers instead of one human-directed one). The frontmatter retains `meta-harness` as a trigger phrase for backward compat with the paper terminology.

## Start Here — Full Bootstrap

If `.evolve/multi-pursue/` exists, read in order:
1. `.evolve/multi-pursue/config.json` — dimensions AND `dimensionClaims`. If any dimension lacks a claim, fix that before proposing anything. (See Phase 0a.5.)
2. `.evolve/multi-pursue/frontier.json` — what variants are non-dominated
3. `.evolve/multi-pursue/evolution.jsonl` — what's been tried, what worked, why
4. `.evolve/multi-pursue/variants/` — prior variant source code + `.meta.json`
5. `.evolve/current.json` — current evolve state

If `.evolve/multi-pursue/` does NOT exist, bootstrap from scratch (Phase 0).

## Fit Check — before bootstrapping

Multi-pursue is the most expensive skill in the library (N parallel proposers, each with full repo compute). Don't dispatch it prematurely.

1. **Prerequisite: `/evolve` has plateaued.** Meta-harness is the right move when 3+ rounds of `/evolve` produced cumulative delta <2%. If no `/evolve` rounds have run, dispatch `/evolve` first — parameter tuning is cheaper than structural rewrites.
2. **Prerequisite: a stable median-of-≥3 baseline exists.** Without it, parallel proposers can't tell noise from signal. If the baseline is single-run or >10% drift vs recorded, re-seed first.
3. **Prerequisite: at least one dimension has a `productValueClaim`.** Phase 0a.5 is blocking. If claims are missing, fix them before spawning proposers — N×cost on proxy metrics is wasted compute.
4. **Resume check.** If `.evolve/current.json` names a different active skill or a `/pursue` generation is in flight, do NOT start proposers — parallel edits over in-flight work conflict. Dispatch `/governor` to decide.
5. **Repo shape.** Multi-pursue fits optimization-shape repos (starter-foundry, agent platforms, model harnesses). For library/service repos, the harness-vs-client distinction may not map — confirm a single highest-blast-radius file exists before committing.

Uncertain → dispatch `/governor`.

## Phase 0: Discover + Bootstrap

**Goal: go from "improve this project" to a running evolution loop with zero manual setup.**

### 0a. Discover the harness

The harness is the code that wraps the core logic — the scaffolding that determines behavior without changing the underlying model/algorithm. Find it:

1. Read the project structure. Look for:
   - Agent scaffolds (`lib/agent-scaffold.ts`, `src/agent.ts`, `agent/*.py`)
   - Pipeline orchestration (`lib/pipeline.ts`, `src/orchestrator.ts`)
   - Prompt templates with retrieval/memory logic
   - Tool configurations and routing logic
   - Context management / memory systems
2. The harness is NOT: model weights, test fixtures, config constants, CI scripts
3. Pick the file with the highest blast radius on output quality. One file. The proposers evolve THIS.

Write the discovery to `.evolve/multi-pursue/config.json`:
```json
{
  "harnessPath": "lib/agent-scaffold.ts",
  "evalCommand": "pnpm test:eval",
  "validateCommand": "npx tsc --noEmit",
  "dimensions": ["accuracy", "efficiency"],
  "dimensionClaims": {
    "accuracy": "If this number moves, <what user-visible outcome moves>?",
    "efficiency": "If this number moves, <what user-visible outcome moves>?"
  },
  "discoveredAt": "2026-04-15T23:00:00Z"
}
```

### 0a.5. Validate metric → product linkage

Before writing the eval, for EACH dimension in `config.json` write the one-sentence product-value claim and store it in `dimensionClaims`:

> "If this number moves, what user-visible product outcome moves with it?"

If you can't write it, the metric is wrong. **Stop and ask the operator.** Do not proceed to 0b until every dimension has a claim.

Multi-pursue will converge happily on proxy metrics that don't track product value — that is the default failure mode of offline evals. The skill has shipped "wins" that moved the eval without moving anything users care about. Force the linkage up front so the operator doesn't have to catch it at review.

- **Bad dimension:** "expected-capability jaccard" against a hand-authored expected list with no stated claim that matching the list improves downstream agent success.
- **Good dimension:** "turns-to-preview" with claim "fewer turns = user sees their feature sooner = lower abandon rate in session replay."
- **Bad dimension:** "p95 latency" on a path that already runs in microseconds with no stated downstream effect.
- **Good dimension:** "p95 latency" with claim "this path gates the user's first keystroke; p95 > 100ms shows up as jank in session replay."

If a dimension's claim is "it's in the existing dashboard, seems worth tracking" — that's not a claim, that's a habit. Kill it.

### 0b. Create evals if missing

If the project has no eval suite, CREATE ONE. This is non-negotiable — multi-pursue can't run without evals.

**Branch on goal shape:**

- **Objective goal** (route correctness, compile, test pass, string match, HTTP code): write tests or extend the existing test suite. Skip `/eval-agent`. LLM judges on objective criteria are overhead.
- **Subjective goal** (generated code quality, conversation fit, design match, user-intent preservation): dispatch `/eval-agent` to generate a rubric from real reference material and persist it under `.evolve/eval-agent/rubrics/`. Meta-harness then reads the rubric's scoring function as its eval.

**For objective evals, implement directly:**

1. Read the project's existing tests. Understand what's tested.
2. Create `tests/eval/` (or extend existing) with:
   - **Golden cases**: 5-10 inputs with known-good outputs (from existing tests, docs, or manual creation)
   - **Edge cases**: inputs that stress the harness's decision-making
   - **Per-scenario output** — the eval MUST report results per scenario, not just aggregate. The proposer needs to know WHICH scenarios fail and WHY, not just "accuracy=0.72". Output format:
     ```json
     {"scenario": "ambiguous_query", "passed": false, "score": 0.3, "output": "...", "expected": "...", "error": "retrieval returned 0 results"}
     {"scenario": "simple_lookup", "passed": true, "score": 0.95, "output": "...", "expected": "..."}
     ```
     Or equivalently: `SCORE:ambiguous_query=0.3` + `SCORE:simple_lookup=0.95`
   - **A scoring function** that outputs per-scenario JSON lines or `SCORE:dimension=value` lines
3. The eval must be runnable via a single command (e.g., `pnpm test:eval`)
4. Verify the eval runs and produces per-scenario scores before proceeding

### 0c. Seed baseline (median of ≥3 runs)

Run the eval **≥3 times** against the current harness. Record the MEDIAN scores (per dimension) in `.evolve/multi-pursue/frontier.json` as the baseline entry. Log the individual run values in a `baselineRuns` array on the entry.

First-run baselines drift ~5% from steady-state on noisy metrics (latency, sampling-based accuracy, LLM-judge variance). A single-run baseline causes false wins on the first variant and false regressions on the next; the frontier then chases noise. Median-of-3 makes the baseline steady before variants compete against it.

If the 3 runs have spread >10% of the mean on any dimension, run 5 more and report the stability. If the metric is still that noisy, the metric itself is too noisy to evolve against — either increase scenario count, switch to a deterministic judge, or drop the dimension.

The same rule applies to variants: any variant claiming frontier-dominance must be measured over ≥3 runs (5 if close to the margin) before overwriting the frontier entry.

### 0d. Initialize state

```
.evolve/
├── current.json           # update: mode = "multi-pursue"
├── multi-pursue/
│   ├── config.json        # harness path, eval command, dimensions, dimensionClaims
│   ├── frontier.json      # Pareto frontier (baseline = median of ≥3 runs)
│   ├── evolution.jsonl    # empty (will grow)
│   ├── runs/              # per-run eval JSONL, keyed by variant name
│   └── variants/          # per-variant source + meta.json (before merge)
└── progress.md            # append: "Meta-harness initialized"
```

**Pre-dispatch hygiene** (do this before Phase 1 parallel proposers):

- Commit `.evolve/multi-pursue/` on main so worktrees inherit the config + baseline.
- Commit any `scripts/` additions (eval runner, collectors, helpers) so worktrees inherit them too. Proposers dispatched before a script is committed will not have it, silently fall back to re-implementing it, and diverge.
- Add `.claude/worktrees/` to `.gitignore`.

## Phase 1: Propose — Read, Reason, Write

For each iteration, you ARE the proposer. Read the full diagnostic state, then write a variant.

### 1a. Read the frontier

`.evolve/multi-pursue/frontier.json` — which variants are non-dominated. What dimensions are they strong/weak on.

### 1b. Read the evolution history

`.evolve/multi-pursue/evolution.jsonl` — every prior proposal. What was the hypothesis? Did it work? WHY did it fail? Look for:
- **Confounds**: a change that helped on some dimensions but hurt others
- **Dead ends**: 3+ proposals on the same mechanism all failed → pivot
- **Lineage merging**: two successful variants with complementary strengths → combine

### 1c. Read raw traces — triage protocol

The paper's key finding: **raw traces (10M tokens) >> summaries >> scores-only**. The proposer reads 82 files per iteration. But don't read randomly — triage:

1. **Start with per-scenario scores.** Read the eval output to identify WHICH scenarios fail and which pass. A variant that fails scenario_7 and scenario_12 tells you where to look.
2. **Read failing scenario traces.** For the 2-3 worst-scoring scenarios, read the raw execution output (`.log` files, stdout captures). Look for: what input was given, what the harness produced, what was expected, where the harness made a wrong decision.
3. **Read passing scenario traces for the same variant.** What's different about the passing cases? The contrast reveals which harness mechanism is responsible.
4. **Read the SAME failing scenarios for frontier variants.** How does the best variant handle scenario_7? What mechanism is different?

This triage gets you from "accuracy=0.72" to "scenario_7 fails because the retrieval misses contrastive examples when the query is ambiguous" — which is a diagnosable, fixable root cause.

### 1d. Read prior variant source code

Read the top 2-3 frontier variants AND the 2-3 worst failures. Understand their mechanisms.

### 1e. Form a falsifiable hypothesis

```
"Changing [mechanism X] to [mechanism Y] will improve [dimension Z] 
because [evidence from traces/evolution.jsonl shows W]"
```

NOT: "increase N from 16 to 32" (parameter variant — rejected)
NOT: "try a different approach" (vague — rejected)
YES: "Add a verification stage after draft prediction to catch false positives by retrieving challengers" (structural, falsifiable)

### 1f. Write the variant

A complete, compilable source file at `.evolve/multi-pursue/variants/<snake_case_name>.<ext>`. Not a diff. Not a partial. Complete file that replaces the harness.

Match the codebase style exactly — imports, naming, error handling. Read 3 existing files first.

### 1g. Write pending_eval.json

```json
{
  "name": "draft_verification",
  "hypothesis": "Adding a verification stage...",
  "base_system": "baseline",
  "changes": ["Add second retrieval stage", "Retrieve challengers"],
  "axis": "exploration",
  "file": ".evolve/multi-pursue/variants/draft_verification.ts"
}
```

## Phase 2: Validate + Benchmark

1. **Compile check**: run the validate command with the variant swapped in
2. **Benchmark**: run the eval command, parse scores
3. **Pareto check**: is this variant non-dominated on the frontier?

## Phase 3: Record + Iterate

Append to `.evolve/multi-pursue/evolution.jsonl`:
```json
{"iteration":1,"name":"draft_verification","hypothesis":"...","scores":{"accuracy":0.85},"outcome":"frontier"}
```

Update `frontier.json` if the variant is non-dominated.

Update `.evolve/progress.md` with the iteration results.

### Post-merge compaction

Once a variant is merged to main (commit exists in the project repo), its source file in `.evolve/multi-pursue/variants/<name>.<ext>` duplicates what's now in git. Compact:

- **DELETE** `.evolve/multi-pursue/variants/<name>.<ext>` (source duplicate)
- **KEEP** `.evolve/multi-pursue/variants/<name>.meta.json`
- Add to the meta JSON:
  ```json
  {
    "merged": true,
    "commit": "<sha>",
    "targetPath": "<in main, e.g. src/lib/keywords.ts>",
    "linesChanged": N
  }
  ```

This stops the archive from drifting from the code it supposedly represents. Scores, hypothesis, and mechanism — the parts that matter for future proposers — live in the `.meta.json`; the code is reproducible from the commit.

Non-merged variants (rejected, or still pending) keep their source file for frontier comparison.

## Parallel dispatch pattern

When the operator wants multi-proposer generation (N proposers evaluating in parallel):

1. **Use git worktrees for isolation.** Dispatch with `Agent(isolation: "worktree")` — each proposer gets an independent working tree, so edits don't conflict.

2. **Assign each proposer a different code region.** Before dispatch, identify N disjoint files or subsystems. Proposer A targets file X, Proposer B targets file Y. **If two proposers target the same file, serialize them** — parallel edits on the same file block composition and the best-of-N becomes tournament-style (one winner, others thrown away) instead of a compose.

3. **Pre-dispatch brief must include:**
   - The proposer's target file(s)
   - The OTHER proposers' target files (so this proposer knows what NOT to touch)
   - The config dimensions + dimensionClaims (so the proposer reasons about product effect, not just metric movement)
   - The current frontier + last 3 evolution.jsonl entries

4. **Collection**: after all proposers complete, read each worktree's `.evolve/multi-pursue/variants/*.meta.json`, copy the variant source + run JSONL back to main. Worth having a `scripts/multi-pursue-collect.mjs` that scans `git worktree list` and gathers artifacts — otherwise this step is error-prone manual `cp`.

5. **Composition = lineage merge for generation N+1.** If proposers targeted orthogonal files, the next generation starts by applying each winning variant to its own file, rebuilding, and re-running the full eval ≥3 times. This composed variant IS the next-gen baseline.

6. **Conflict — if two winning variants touch the same file**: do NOT blindly concatenate. Write a third proposer whose brief is "merge the mechanisms from A and B, both of which edit file X" — same protocol as single-proposer Phase 1.

## Rules

### REQUIRED: Structural mechanism changes

The most common failure mode is parameter variants. DO NOT:
- Change numbers (N=16→32, threshold=0.5→0.7)
- Add more examples to a prompt
- Rename variables
- Reorder existing steps

DO:
- Change the retrieval algorithm
- Add a new processing stage
- Change the memory architecture
- Change control flow (sequential→parallel→conditional)
- Add a new information source
- Change error handling strategy

### REQUIRED: Causal reasoning from traces

Every hypothesis must cite evidence:
- "Scenario X fails because trace Y shows Z"
- "Prior attempt {name} regressed because [confound in evolution.jsonl]"
- "Iterations 1-6 all regressed on prompt changes → pivoting to additive change"

### REQUIRED: Learn from history

Read evolution.jsonl. If the last 3 proposals targeting the same component all regressed, DON'T target that component again. Pivot.

**Worked example — the pattern from the paper (TerminalBench-2, 10 iterations):**

- Iterations 1-2: hypothesized marker-fix and single-confirm changes. Both regressed (-5.6pp, -6.7pp). Why: prompt template changes caused the agent to delete necessary state before completion. The bugfixes were confounded with harmful prompt changes.
- Iteration 3: identified the confound explicitly. Isolated the structural fix from the prompt change.
- Iterations 4-6: tested isolated fixes (completion-flag reset, softer cleanup language, smart-waiting). All still regressed. Lesson: "modifications to prompts and completion flow are high risk."
- **Iteration 7: STRATEGIC PIVOT.** "All 6 prior iterations regressed because they modified completion flow. evo_env_bootstrap takes a different approach — purely additive." → Became the winning candidate.
- Iteration 8: composed environment bootstrap with a structural fix, avoiding prompts/confirmation flows.

**The pattern: confound → isolation → dead end → pivot to different mechanism class.**

### REQUIRED: Lineage merging

When two frontier variants have complementary strengths (A excels on dimension X, B excels on dimension Y), write a variant that combines their mechanisms. The paper's math harness is literally a merge of two search lineages — one contributed a stronger geometry route, the other a stronger combinatorics route. The proposer autonomously combined them.

Read the frontier. If two entries dominate different dimensions, your next proposal should be: "Combine mechanism from variant A (which handles X) with mechanism from variant B (which handles Y)."

### REQUIRED: Smoke test before full benchmark

Before running the full eval suite on a variant, run it on 1-2 scenarios first. If the variant fails those, skip the full benchmark. A full eval run is expensive (minutes, API calls, compute). A smoke test on one scenario takes seconds and catches compile-time failures, import errors, and obvious regressions early.

### RECOMMENDED: Generalization check at convergence

When the frontier hasn't changed in 3 iterations (converged), test the top variants on held-out inputs:
- Different dataset distributions than the eval suite
- Different model versions (if the harness wraps an LLM)
- Edge cases not in the golden set

A harness that scores well on the eval suite but fails on unseen inputs is overfit to the eval. Log generalization results in evolution.jsonl with `"type": "ood_check"`.

### Language agnostic

Write variants in whatever language the project uses. TypeScript, Python, Rust, whatever. Match existing conventions exactly.

## Connecting to Foreman

If Foreman service is running (`http://localhost:7374`):

```bash
# Start a multi-pursue evolution job via Foreman API
curl -X POST http://localhost:7374/api/evolve-code -H 'Content-Type: application/json' -d '{
  "repo": "/path/to/project",
  "harness": "lib/agent-scaffold.ts",
  "eval": "pnpm test:eval",
  "iterations": 10,
  "parallelism": 2,
  "dimensions": ["accuracy", "efficiency"],
  "backend": "tangle"
}'
```

This dispatches N parallel proposers (via tmux locally or Tangle Sandbox containers remotely), each reading the shared frontier, each writing variants. Foreman tracks goals, costs, sessions, and taste signals.

Without Foreman: run the loop manually in a single CC session using this skill. Phase 1→2→3 repeated.

## When to stop

- Frontier hasn't changed in 3 iterations → converged (if the metric is real — see below)
- Budget exhausted (cost or iteration count)
- All N dimensions exceed target thresholds
- Proposer can't form a novel hypothesis (all mechanisms explored)
- **Metric-linkage broken**: the dimensions are moving but there's no product signal that the user-visible outcome moved with them. At this point, convergence is meaningless. Stop, flag the proxy-metric problem, and either redesign the eval against a product-grounded metric or hand off to a skill that can (e.g., an end-to-end A/B harness in the system that consumes this code).

Update `.evolve/current.json`:
```json
{"mode": "evolve", "generation": N, "note": "multi-pursue converged, hand off to /evolve for fine-tuning"}
```

## Related skills

```
/multi-pursue    ← automated code architecture evolution (this)
  ├── /evolve    ← parameter tuning AFTER multi-pursue converges
  ├── /pursue    ← manual generational design BEFORE multi-pursue automates
  └── /reflect   ← extract learnings from evolution history
```
