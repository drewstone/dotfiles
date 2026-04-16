---
name: meta-harness
description: "Automated code-level evolution. Drop into any project, discover the harness (the code around the model/agent), create evals if missing, then run parallel CC proposers that evolve the architecture — not the parameters. State lives in .evolve/meta-harness/. Use when /evolve plateaus on parameter tuning and the system needs structural code changes, or when the user says 'meta-harness', 'evolve the architecture', 'improve the harness', 'make this code better structurally'."
---

# Meta-Harness — Automated Code Architecture Evolution

Drop into any project. Discover what to evolve. Create evals if missing. Run parallel proposers that write structurally different code. Track a Pareto frontier. Converge.

State lives in `.evolve/meta-harness/` — part of the evolve ecosystem, not separate.

**Use meta-harness when** /evolve has plateaued on parameter tuning and the gap is architectural. **Use /evolve when** the goal is a measurable metric and parameter changes can move it. **Use /pursue when** you need to design a generation before building. Meta-harness IS automated /pursue — N parallel proposers instead of one human directing CC.

## How it relates to /evolve and /pursue

```
/evolve         → tight experiment loop, parameter tuning, metric optimization
/pursue         → generational architectural shift, human-directed
/meta-harness   → automated /pursue — CC proposes architectural shifts, eval judges them
```

When /evolve runs and hits a plateau (3+ rounds, <1% improvement), it should recommend: "Run /meta-harness — parameter tuning is exhausted, need structural changes."

When /pursue designs a generation, it can dispatch meta-harness as the builder: "I designed the generation, now meta-harness finds the best implementation."

## Start Here — Full Bootstrap

If `.evolve/meta-harness/` exists, read in order:
1. `.evolve/meta-harness/frontier.json` — what variants are non-dominated
2. `.evolve/meta-harness/evolution.jsonl` — what's been tried, what worked, why
3. `.evolve/meta-harness/variants/` — prior variant source code
4. `.evolve/current.json` — current evolve state

If `.evolve/meta-harness/` does NOT exist, bootstrap from scratch (Phase 0).

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

Write the discovery to `.evolve/meta-harness/config.json`:
```json
{
  "harnessPath": "lib/agent-scaffold.ts",
  "evalCommand": "pnpm test:eval",
  "validateCommand": "npx tsc --noEmit",
  "dimensions": ["accuracy", "efficiency"],
  "discoveredAt": "2026-04-15T23:00:00Z"
}
```

### 0b. Create evals if missing

If the project has no eval suite, CREATE ONE. This is non-negotiable — meta-harness can't run without evals.

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

### 0c. Seed baseline

Run the eval against the current harness. Record scores in `.evolve/meta-harness/frontier.json` as the baseline entry. This is what all future variants compete against.

### 0d. Initialize state

```
.evolve/
├── current.json           # update: mode = "meta-harness"
├── meta-harness/
│   ├── config.json        # harness path, eval command, dimensions
│   ├── frontier.json      # Pareto frontier (baseline seeded)
│   ├── evolution.jsonl    # empty (will grow)
│   └── variants/          # empty (will grow)
└── progress.md            # append: "Meta-harness initialized"
```

## Phase 1: Propose — Read, Reason, Write

For each iteration, you ARE the proposer. Read the full diagnostic state, then write a variant.

### 1a. Read the frontier

`.evolve/meta-harness/frontier.json` — which variants are non-dominated. What dimensions are they strong/weak on.

### 1b. Read the evolution history

`.evolve/meta-harness/evolution.jsonl` — every prior proposal. What was the hypothesis? Did it work? WHY did it fail? Look for:
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

A complete, compilable source file at `.evolve/meta-harness/variants/<snake_case_name>.<ext>`. Not a diff. Not a partial. Complete file that replaces the harness.

Match the codebase style exactly — imports, naming, error handling. Read 3 existing files first.

### 1g. Write pending_eval.json

```json
{
  "name": "draft_verification",
  "hypothesis": "Adding a verification stage...",
  "base_system": "baseline",
  "changes": ["Add second retrieval stage", "Retrieve challengers"],
  "axis": "exploration",
  "file": ".evolve/meta-harness/variants/draft_verification.ts"
}
```

## Phase 2: Validate + Benchmark

1. **Compile check**: run the validate command with the variant swapped in
2. **Benchmark**: run the eval command, parse scores
3. **Pareto check**: is this variant non-dominated on the frontier?

## Phase 3: Record + Iterate

Append to `.evolve/meta-harness/evolution.jsonl`:
```json
{"iteration":1,"name":"draft_verification","hypothesis":"...","scores":{"accuracy":0.85},"outcome":"frontier"}
```

Update `frontier.json` if the variant is non-dominated.

Update `.evolve/progress.md` with the iteration results.

If running in parallel (multiple CC sessions), each proposer reads the SAME frontier but writes to a unique variant file. Results are merged after all proposers complete.

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
# Start a meta-harness evolution job via Foreman API
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

- Frontier hasn't changed in 3 iterations → converged
- Budget exhausted (cost or iteration count)
- All N dimensions exceed target thresholds
- Proposer can't form a novel hypothesis (all mechanisms explored)

Update `.evolve/current.json`:
```json
{"mode": "evolve", "generation": N, "note": "meta-harness converged, hand off to /evolve for fine-tuning"}
```

## Related skills

```
/meta-harness    ← automated code architecture evolution (this)
  ├── /evolve    ← parameter tuning AFTER meta-harness converges
  ├── /pursue    ← manual generational design BEFORE meta-harness automates
  └── /reflect   ← extract learnings from evolution history
```
