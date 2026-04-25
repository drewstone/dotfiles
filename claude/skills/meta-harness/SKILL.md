---
name: meta-harness
description: "Automated code-level evolution. Discover the harness, create evals if missing, run parallel CC proposers that evolve architecture (not parameters). State in `.evolve/meta-harness/`. Triggers: 'meta-harness', 'evolve the architecture', evolve plateau on parameters."
---

# Meta-Harness — Automated Code Architecture Evolution

Drop into any project. Discover what to evolve. Create evals if missing. Run parallel proposers that write structurally different code. Track a Pareto frontier. Converge.

State lives in `.evolve/meta-harness/` — part of the evolve ecosystem, not separate. Shared conventions in `_common.md`.

**Use meta-harness when** `/evolve` has plateaued on parameter tuning and the gap is architectural.
**Use `/evolve` when** the goal is a measurable metric and parameter changes can move it.
**Use `/pursue` when** you need to design a generation before building (human-directed). Meta-harness IS automated `/pursue` — N parallel proposers instead of one operator directing CC.

## Resume / bootstrap

If `.evolve/meta-harness/` exists, read in order:
1. `config.json` — dimensions AND `dimensionClaims`. Any dimension lacking a claim → fix that before proposing anything.
2. `frontier.json` — non-dominated variants
3. `evolution.jsonl` — what's been tried, what worked, why
4. `variants/` — prior variant source + `.meta.json`
5. `.evolve/current.json` — current evolve state

If `.evolve/meta-harness/` does NOT exist, bootstrap (Discover phase).

## Prerequisites

Meta-harness is the most expensive skill in the library (N parallel proposers, full repo compute each). Don't dispatch prematurely:

1. **`/evolve` has plateaued.** 3+ rounds with cumulative delta <2%. Otherwise dispatch `/evolve` first — parameter tuning is cheaper than structural rewrites.
2. **Stable median-of-≥3 baseline exists.** Without it, parallel proposers can't tell noise from signal. Single-run or >10% drift → re-seed.
3. **At least one dimension has a `productValueClaim`.** N×cost on proxy metrics is wasted compute.
4. **No other skill mid-flight.** If `.evolve/current.json` names a `/pursue` generation in flight, parallel edits conflict — dispatch `/governor` first.
5. **Repo shape fits.** Optimization repos (model harnesses, agent platforms) work well. Library/service repos: confirm a single highest-blast-radius file exists before committing.

## Discover + bootstrap

Goal: from "improve this project" to a running evolution loop with zero manual setup.

### Discover the harness

The harness is the code that wraps core logic — scaffolding that determines behavior without changing the underlying model/algorithm. Find it:

1. Read project structure. Look for: agent scaffolds (`lib/agent-scaffold.ts`, `agent/*.py`), pipeline orchestration, prompt templates with retrieval/memory logic, tool configs and routing, context/memory systems.
2. The harness is NOT: model weights, test fixtures, config constants, CI scripts.
3. Pick the file with highest blast radius on output quality. One file. Proposers evolve THIS.

Write to `.evolve/meta-harness/config.json`:

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
  "discoveredAt": "2026-04-25T23:00:00Z"
}
```

### Validate metric → product linkage

For EACH dimension, write the one-sentence product-value claim and store in `dimensionClaims`. If you can't write it, the metric is wrong. **Stop and ask the operator.** Do not proceed until every dimension has a claim.

Meta-harness will converge happily on proxy metrics that don't track product value — that is the default failure mode of offline evals. The skill has shipped "wins" that moved the eval without moving anything users care about.

- **Bad:** "expected-capability jaccard" with no claim that matching the list improves downstream agent success.
- **Good:** "turns-to-preview" with claim "fewer turns = user sees their feature sooner = lower abandon rate."
- **Bad:** "p95 latency" on a path running in microseconds with no stated downstream effect.
- **Good:** "p95 latency" with claim "this path gates the user's first keystroke; >100ms shows up as jank in session replay."

If a claim is "it's in the existing dashboard, seems worth tracking" — that's not a claim, that's a habit. Kill it.

### Create evals if missing

If the project has no eval suite, CREATE ONE. Non-negotiable.

**Branch on goal shape:**
- **Objective** (route correctness, compile, test pass, string match, HTTP code): write tests. Skip `/eval-agent`.
- **Subjective** (generated code quality, conversation fit, design match): dispatch `/eval-agent` to generate a rubric from real reference material under `.evolve/eval-agent/rubrics/`. Meta-harness reads the rubric's scoring function as its eval.

For objective evals:
1. Read existing tests. Understand what's tested.
2. Create `tests/eval/` with golden cases (5–10 inputs with known-good outputs), edge cases, and **per-scenario output**:
   ```json
   {"scenario":"ambiguous_query","passed":false,"score":0.3,"output":"...","expected":"...","error":"retrieval returned 0 results"}
   ```
   Or `SCORE:scenario=value` lines. The proposer needs to know WHICH scenarios fail and WHY, not just "accuracy=0.72".
3. Single command (e.g., `pnpm test:eval`).
4. Verify it runs and produces per-scenario scores.

### Seed baseline (median of ≥3)

Run the eval ≥3 times. Record MEDIAN per dimension in `frontier.json` as baseline; log individual values in `baselineRuns`.

First-run baselines drift ~5% from steady-state on noisy metrics. Single-run baselines cause false wins on first variant and false regressions on the next; the frontier chases noise.

If the 3 runs have spread >10% of mean on any dimension, run 5 more. Still that noisy → metric is too noisy to evolve against; increase scenarios, switch to deterministic judge, or drop the dimension.

Same rule applies to variants: any variant claiming frontier-dominance must be measured ≥3 runs (5 if margin-close) before overwriting.

### Initialize state

```
.evolve/
├── current.json           # mode = "meta-harness"
├── meta-harness/
│   ├── config.json        # harness path, eval command, dimensions, dimensionClaims
│   ├── frontier.json      # baseline = median of ≥3
│   ├── evolution.jsonl    # empty (will grow)
│   ├── runs/              # per-run eval JSONL
│   └── variants/          # per-variant source + meta.json
└── progress.md            # append: "Meta-harness initialized"
```

**Pre-dispatch hygiene** (before parallel proposers):
- Commit `.evolve/meta-harness/` on main so worktrees inherit config + baseline.
- Commit any `scripts/` additions (eval runner, collectors, helpers) so worktrees inherit them. Proposers dispatched before a script is committed will silently re-implement it and diverge.
- Add `.claude/worktrees/` to `.gitignore`.

## Propose — read, reason, write

For each iteration, you ARE the proposer. Read full diagnostic state, then write a variant.

1. **Read frontier** — which variants are non-dominated, dimension strengths/weaknesses.
2. **Read evolution history** — every prior proposal. Hypothesis? Worked? WHY did it fail? Look for confounds (helped on X, hurt on Y), dead ends (3+ same-mechanism failures → pivot), lineage merges (two complementary variants → combine).
3. **Read raw traces — triage**. The paper's key finding: raw traces (10M tokens) >> summaries >> scores-only. Don't read randomly:
   1. Per-scenario scores → identify failing scenarios.
   2. Read 2–3 worst-scoring traces. What input, what produced, what expected, where did the harness make a wrong decision.
   3. Read passing scenarios for the same variant. Contrast reveals the responsible mechanism.
   4. Read the SAME failing scenarios for frontier variants. How do they handle it differently?
4. **Read top 2–3 frontier variants AND 2–3 worst failures**. Understand mechanisms.
5. **Falsifiable hypothesis**: "Changing [mechanism X] to [mechanism Y] will improve [dimension Z] because [evidence from traces/evolution.jsonl shows W]". NOT "increase N from 16 to 32" (parameter — rejected). NOT "try a different approach" (vague — rejected). YES "Add a verification stage after draft prediction to catch false positives by retrieving challengers" (structural, falsifiable).
6. **Write the variant** — complete, compilable source at `.evolve/meta-harness/variants/<snake_case>.<ext>`. Not a diff. Match codebase style exactly — read 3 existing files first.
7. **Write `pending_eval.json`**:
   ```json
   {"name":"draft_verification","hypothesis":"Adding a verification stage...","base_system":"baseline","changes":["Add second retrieval","Retrieve challengers"],"axis":"exploration","file":".evolve/meta-harness/variants/draft_verification.ts"}
   ```

## Validate + benchmark

1. **Compile check** with the variant swapped in.
2. **Benchmark** with eval command, parse scores.
3. **Pareto check** — non-dominated on the frontier?

## Record + iterate

Append to `evolution.jsonl`:
```json
{"iteration":1,"name":"draft_verification","hypothesis":"...","scores":{"accuracy":0.85},"outcome":"frontier"}
```

Update `frontier.json` if non-dominated. Update `progress.md`.

### Post-merge compaction

Once a variant is merged to main, source in `variants/` duplicates git. Compact:
- **DELETE** `variants/<name>.<ext>` (source duplicate)
- **KEEP** `variants/<name>.meta.json`
- Add `{merged: true, commit: "<sha>", targetPath: "<in main>", linesChanged: N}`

This stops the archive from drifting. Scores, hypothesis, mechanism live in the meta JSON; code reproduces from the commit. Non-merged variants keep source for frontier comparison.

## Parallel dispatch

When the operator wants multi-proposer generation:

1. **Worktrees for isolation.** Dispatch with `Agent(isolation: "worktree")` — independent working trees, no edit conflicts.
2. **Different code regions per proposer.** Identify N disjoint files/subsystems before dispatch. **Same-file proposers must serialize** — parallel edits block composition; best-of-N becomes tournament-style with winners thrown away.
3. **Pre-dispatch brief includes:** target file(s), other proposers' targets (don't touch), dimensions + claims (reason about product effect, not just metric movement), current frontier + last 3 evolution entries.
4. **Collection:** read each worktree's `variants/*.meta.json`, copy variant source + run JSONL back to main. A `scripts/meta-harness-collect.mjs` scanning `git worktree list` is worth having — manual `cp` is error-prone.
5. **Composition = lineage merge for Gen N+1.** Orthogonal-file winners → apply each to its file, rebuild, re-run full eval ≥3 times. Composed variant IS the next-gen baseline.
6. **Same-file conflicts:** don't blindly concatenate. Write a third proposer briefed to "merge mechanisms from A and B, both edit file X."

## Rules

### REQUIRED: structural mechanism changes

Most common failure: parameter variants. DO NOT change numbers (N=16→32, threshold=0.5→0.7), add prompt examples, rename variables, reorder steps.

DO change retrieval algorithms, add processing stages, change memory architecture, change control flow (sequential→parallel→conditional), add information sources, change error handling strategy.

### REQUIRED: causal reasoning from traces

Every hypothesis cites evidence:
- "Scenario X fails because trace Y shows Z"
- "Prior attempt {name} regressed because [confound in evolution.jsonl]"
- "Iterations 1–6 all regressed on prompt changes → pivoting to additive change"

### REQUIRED: learn from history

Read `evolution.jsonl`. Last 3 proposals targeting the same component all regressed → DON'T target it again. Pivot.

**Worked example (TerminalBench-2, paper, 10 iterations):**

- Iterations 1–2: marker-fix and single-confirm. Both regressed (-5.6pp, -6.7pp). Why: prompt changes caused the agent to delete necessary state before completion. Bugfixes confounded with harmful prompt changes.
- Iteration 3: identified the confound, isolated the structural fix.
- Iterations 4–6: tested isolated fixes (completion-flag reset, softer cleanup, smart-waiting). All regressed. Lesson: "modifications to prompts and completion flow are high risk."
- **Iteration 7: STRATEGIC PIVOT.** "All 6 prior iterations regressed because they modified completion flow. evo_env_bootstrap takes a different approach — purely additive." → Winning candidate.
- Iteration 8: composed environment bootstrap with a structural fix, avoiding prompts/confirmation flows.

Pattern: **confound → isolation → dead end → pivot to different mechanism class.**

### REQUIRED: lineage merging

Two frontier variants with complementary strengths (A excels on X, B on Y) → write a variant combining their mechanisms. The paper's math harness merged a stronger geometry route with a stronger combinatorics route. The proposer autonomously combined them.

### REQUIRED: smoke test before full benchmark

Before running full eval, run on 1–2 scenarios. Fails those → skip full benchmark. Full eval is expensive (minutes, API calls). Smoke test takes seconds and catches compile failures, import errors, obvious regressions early.

### RECOMMENDED: generalization check at convergence

Frontier unchanged for 3 iterations → test top variants on held-out inputs (different distributions, different model versions, edge cases not in golden set). A harness scoring well on the eval but failing on unseen inputs is overfit. Log as `"type": "ood_check"`.

### Language agnostic

Write variants in whatever the project uses. Match conventions exactly.

## Foreman integration

If Foreman is running (`http://localhost:7374`):

```bash
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

Dispatches N parallel proposers (tmux locally or Tangle Sandbox containers remotely), each reading the shared frontier. Foreman tracks goals, costs, sessions, taste signals.

Without Foreman: run the loop manually in a single CC session. Propose → Validate → Record, repeated.

## When to stop

- Frontier unchanged for 3 iterations → converged (if the metric is real).
- Budget exhausted (cost or iteration count).
- All N dimensions exceed targets.
- Proposer can't form a novel hypothesis (mechanisms exhausted).
- **Metric-linkage broken**: dimensions moving but no product signal → convergence is meaningless. Stop, flag the proxy-metric problem, redesign the eval against a product-grounded metric or hand off to a skill that can.

Update `.evolve/current.json`: `{"mode": "evolve", "generation": N, "note": "meta-harness converged, hand off to /evolve for fine-tuning"}`.

End with: `Next: /evolve targeting <dimension> at frontier <baseline>`.
