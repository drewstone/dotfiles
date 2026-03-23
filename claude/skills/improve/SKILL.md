---
name: improve
description: "Analyze any codebase, then BUILD the experiment infrastructure it needs to become self-improving. Discovers quality signals, tunable surfaces, and feedback loops — then scaffolds the actual scripts, runners, and evaluators that make autonomous A/B testing possible. Not just analysis — code output. Use when the user says 'how do I improve this', 'make this self-improving', 'add experiments', 'create a feedback loop', 'optimize this systematically', 'bootstrap experiments', or wants to create the infrastructure for autonomous improvement in any software project."
---

# Improve — Build the Experiment Framework

You are a staff research engineer. Your job is two parts:
1. **Analyze** the project to understand what to measure and what to tune
2. **Build** the experiment infrastructure that makes the improvement loop possible

The output is NOT a report. It's working code — scripts, runners, evaluators — that anyone (human, CI, agent) can use to run experiments and promote winners.

## Phase 1: Discover the Shape

Use parallel subagents to explore simultaneously.

### 1a. Project Classification

Read project structure, entry points, README, config. Determine:
- **Type**: CLI tool, web app, API, library, agent, pipeline, ML model, infrastructure
- **Language/stack**: determines tooling choices
- **Core loop**: what happens on every invocation/request/run
- **What users care about**: correctness, speed, cost, UX, reliability

### 1b. Existing Quality Signals

Search exhaustively for anything that produces measurable numbers:

| Signal Type | Where to Look |
|---|---|
| **Test suites** | `test/`, `tests/`, `__tests__/`, vitest/jest/pytest/cargo config |
| **Benchmarks** | `bench/`, `benchmark/`, `perf/`, `*bench*` dirs |
| **CI gates** | `.github/workflows/`, `.gitlab-ci.yml`, `Makefile` |
| **Metrics** | OpenTelemetry, Prometheus, custom counters |
| **Linting/types** | ESLint, tsc, clippy, mypy |
| **Load testing** | k6, Artillery, wrk |
| **Eval harnesses** | LLM evals, accuracy benchmarks, A/B infra |
| **Cost tracking** | Token usage, API costs, compute billing |

For each: what it measures, exact command, how often it runs, what acts on the result.

### 1c. Existing Experiment Infrastructure

Look specifically for:
- A/B test runners, experiment scripts
- Research pipelines, hypothesis queues
- Benchmark comparison tools
- Seeded/reproducible test execution
- Statistical analysis (bootstrap CI, significance tests)
- Hypothesis queue formats

**If experiment infrastructure already exists**: understand it thoroughly. The goal is to enhance it, not replace it.

### 1d. Tunable Surfaces

Map every knob:

| Surface | Where |
|---|---|
| **Config** | `*.config.*`, `.env`, YAML/JSON configs, feature flags |
| **Parameters** | Timeouts, thresholds, batch sizes, retries, cache TTLs |
| **Models/prompts** | LLM selection, system prompts, temperature |
| **Architecture** | Strategy patterns, plugins, middleware, feature flags |
| **Code paths** | Branching logic, strategy selection, fallback chains |

### 1e. Metric Categories

Classify what matters for THIS project into categories:

- **Product metrics**: what the user experiences (accuracy, latency, reliability)
- **Technical metrics**: what the system consumes (tokens, CPU, memory, cost)
- **Quality metrics**: what developers care about (test pass rate, type safety, coverage)

## Phase 2: Score Readiness

```
Improvement Loop Readiness — <project name>

Quality Signals:       X/5
Tunable Surfaces:      X/5
Experiment Infra:      X/5
Feedback Loops:        X/5
Overall:               X/20
```

- **16-20**: Experiment infra exists. Enhance and use it.
- **11-15**: Strong signals. Build the experiment layer.
- **6-10**: Tests exist but no experiment infra. Build measurement + experiment layers.
- **1-5**: Greenfield. Build everything from scratch.

## Phase 3: Build the Infrastructure

This is the core output. Based on the readiness score and project type, BUILD the missing pieces. Not blueprints — working code.

### What to Build (by readiness tier)

**Tier 1-5 (Greenfield):**
1. Baseline measurement script — runs existing tests/benchmarks, outputs structured JSON
2. Experiment runner — control vs treatment, same inputs, delta computation
3. npm/make scripts to invoke both

**Tier 6-10 (Has tests, no experiments):**
1. A/B experiment runner adapted to the project's test framework
2. Hypothesis queue format (JSON) for the project's tunable surfaces
3. Result analyzer — reads experiment output, classifies delta, recommends decision

**Tier 11-15 (Has signals, partial experiment infra):**
1. Fill the gaps — whatever's missing from the experiment pipeline
2. Failure trace analyzer for the project's specific output format
3. Research pipeline orchestrator if one doesn't exist

**Tier 16-20 (Full infra exists):**
1. Enhance: add missing evaluators, improve statistical analysis
2. Add external benchmarks if applicable
3. Build the outer loop automation (hypothesis generation → experiment → promotion)

### Architecture: The Three Layers

Every project needs these three layers, adapted to its stack:

#### Layer 1: Measure

A script that runs the project's core quality check and outputs structured JSON.

```
scripts/measure.{mjs,py,sh}
  Input:  optional config overrides
  Runs:   the project's test suite / benchmark / eval
  Output: JSON with {passRate, metrics: {name: value}, failures: [{id, error, category}]}

  This is the project's "thermometer" — one command, one number.
```

The measure script must:
- Be runnable with zero arguments (sensible defaults)
- Accept config overrides for experiment variants
- Output machine-readable JSON (not just human text)
- Include failure details (not just pass/fail count)
- Track cost if applicable (tokens, API calls, compute time)

#### Layer 2: Experiment

A script that runs control vs treatment and computes the delta.

```
scripts/experiment.{mjs,py,sh}
  Input:  --control <config> --treatment <config> [--branch <git-ref>] [--reps N] [--seed S]
  Runs:   measure.{mjs,py,sh} for both arms, N times each
  Output: JSON with {control: metrics, treatment: metrics, delta: {metric: diff, ci: [lo, hi]}, decision: promote|reject|inconclusive}

  This is the project's "comparator" — same inputs, two configs, statistical delta.
```

The experiment script must:
- Support config-based experiments (two config files)
- Support branch-based experiments (control=main, treatment=feature branch)
- Use fixed seed for reproducible ordering
- Compute bootstrap 95% CI on the primary metric
- Classify: promote (CI lower > 0), reject (CI upper < 0), inconclusive
- Track cost per arm

#### Layer 3: Analyze

A script that reads experiment results and produces actionable output.

```
scripts/analyze.{mjs,py,sh}
  Input:  --results <dir>
  Reads:  experiment output JSON + individual test/benchmark results
  Output: {clusters: [{name, failures, rootCause, fixComplexity, impact}], hypotheses: [{id, name, treatment, rationale}]}

  This is the project's "diagnostician" — turns data into hypotheses.
```

The analyze script must:
- Read the project's specific result format
- Classify failures by root cause
- Cluster similar failures
- Rank clusters by impact / fix complexity
- Output hypotheses in the project's experiment format (so they can be fed directly back to the experiment script)

### Adapt to the Stack

**Node/TypeScript projects:**
- Scripts in `.mjs` (ESM, no build step needed)
- npm scripts in `package.json` for all three layers
- JSON for hypothesis queues and results

**Python projects:**
- Scripts in `.py` with `click` or `argparse`
- `Makefile` or `pyproject.toml` scripts entries
- JSON for results, YAML acceptable for config

**Rust projects:**
- Shell scripts wrapping `cargo test` / `cargo bench`
- `Makefile` targets
- JSON output via `--format json` or custom reporter

**Go projects:**
- Shell scripts wrapping `go test -bench` / `go test -run`
- `Makefile` targets

### Wire the npm/make Scripts

Always add runnable entry points:

```json
{
  "scripts": {
    "measure": "node scripts/measure.mjs",
    "experiment": "node scripts/experiment.mjs",
    "experiment:estimate": "node scripts/experiment.mjs --estimate",
    "analyze": "node scripts/analyze.mjs"
  }
}
```

Or in Makefile:
```makefile
measure:
	python scripts/measure.py

experiment:
	python scripts/experiment.py --control $(CONTROL) --treatment $(TREATMENT)
```

## Phase 4: Intervention Map

After building the infrastructure, document WHERE to use it:

```
Intervention Map — <project name>

<Area 1>
  Files:       <exact paths>
  Metrics:     <what measure.mjs tracks here>
  Knobs:       <what's tunable>
  First experiment: <specific hypothesis to test>

<Area 2>
  ...
```

## Phase 5: Verify

After building:
1. Run `measure` — does it produce valid JSON output?
2. Run `experiment --estimate` — does cost estimation work?
3. Run a trivial experiment (control=default, treatment=default) — does the pipeline complete?
4. Run `analyze` on any existing test results — does it classify correctly?

If any step fails, fix it before reporting.

## Output Checklist

At the end of `/improve`, the project should have:

- [ ] `scripts/measure.{mjs,py,sh}` — baseline measurement, structured JSON output
- [ ] `scripts/experiment.{mjs,py,sh}` — A/B runner with seeded reproducibility and bootstrap CI
- [ ] `scripts/analyze.{mjs,py,sh}` — failure classification and hypothesis generation
- [ ] Package scripts / Makefile targets for all three
- [ ] One successful test run of the measure script
- [ ] Intervention map documenting where to experiment first
- [ ] Readiness score and what the first `/evolve` cycle should target

## Rules

- **Build, don't blueprint.** The output is working scripts, not a design doc.
- **Match the project's stack.** Node project → .mjs scripts. Python → .py. Rust → shell + cargo.
- **Match the project's patterns.** If they use vitest, use vitest. If they use pytest, use pytest. Don't introduce foreign tooling.
- **Start minimal.** The first version of each script can be 50 lines. It just needs to work. Sophistication comes from iterating on it via `/evolve`.
- **Don't duplicate existing infra.** If the project already has an A/B runner, don't write another one. Enhance what's there or write the missing layer.
- **The infra must be agent-runnable.** Every script must work with zero interactive input. An agent should be able to invoke `experiment --control A --treatment B` and get a machine-readable result.
- **Use parallel subagents** for Phase 1 discovery — don't serialize exploration.

## Decision Capture & Reflection

After completing work, capture significant decisions and reflect on the session:

- **During work**: when you make an architectural choice, pivot, or reject an alternative, note it. These become `/capture-decisions` records.
- **After each round/generation**: run `/reflect` to meta-analyze what happened — what worked, what didn't, what patterns emerged.
- **Decision records**: create `research/decisions/NNN-*.md` for any decision that changes direction, introduces new concepts, or rejects alternatives. Include rationale, alternatives, origin analysis (human vs AI contribution), and outcomes.
- **Failure records**: when something fails, create `research/failures/NNN-*.md` with root cause, debugging journey, fix, and prevention.

This is how the system learns across sessions. The structured records feed into Foreman's learning loop, inform future dispatches, and accumulate into publishable methodology documentation.
