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
   - **A scoring function** that outputs `SCORE:dimension=value` lines or JSON `{scores: {...}}`
3. The eval must be runnable via a single command (e.g., `pnpm test:eval`)
4. Verify the eval runs and produces scores before proceeding

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

### 1c. Read raw traces

If eval produces detailed output (logs, per-case results), read them directly. The paper's key finding: **raw traces (10M tokens) >> summaries (34.9 acc) >> scores-only (34.6 acc)**. Don't summarize. Read the raw output and diagnose.

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
