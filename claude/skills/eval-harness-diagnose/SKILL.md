---
name: eval-harness-diagnose
description: "Diagnose and improve eval harnesses built on @tangle-network/agent-eval or similar trace-first systems. Use when success/failure rates, scorecard deltas, judge outputs, promotion gates, benchmark rows, or improvement campaigns may be contaminated by harness bugs, evaluator drift, routing/auth failures, missing traces, or invalid baselines."
---

# Eval Harness Diagnose

Find out whether an eval result measures the agent, the product, or the harness failing to observe reality. This skill extends `/agent-eval` and `/agent-eval-adoption` in the diagnostic dimension: once a harness exists, use this to interpret failures, improve measurement integrity, and decide what change should run next.

## Fit Check

Use this when the user asks why an eval/benchmark/improvement loop is failing, whether a scorecard moved for real, how to improve success/failure measurement, or how to close a harness integrity gap.

Trigger phrases include:

- eval harness, agent-eval, benchmark, scorecard, run records, traces, held-out gate, promotion gate, GEPA, autoresearch, analyst loop, judge, verifier, semantic score, reviewer, contamination, baseline drift
- framework-specific suites such as SWE-Bench adapters, sandbox harnesses, production-loop campaigns, product eval gates, or custom benchmark runners

Use `/agent-eval` when writing framework internals. Use `/agent-eval-adoption` when installing the harness into a product for the first time. Use this skill when the harness already exists or partially exists and its results need diagnosis or improvement.

## Evidence Order

1. Explicit artifact path, run ID, PR, or command from the user.
2. Latest run artifacts: `RunRecord[]`, scorecard JSONL, trace store, raw provider sink, judge output, verifier layer reports, promotion-gate reports, campaign manifests.
3. Harness state: `.evolve/scorecard.json`, `.evolve/experiments.jsonl`, `.evolve/skill-runs.jsonl`, `.evolve/pursuits/`, `.bench/`, `eval/`, `tests/eval/`, or repo-specific equivalents.
4. Memory/pitfall files for known harness bugs in the current repo.
5. Source code only after artifacts identify the failing phase.

Do not diagnose from summaries alone. A summary says "failed"; the row, trace, raw call, and gate report say why.

## Integrity Gates

Before optimizing prompts, models, tools, or agent strategy, prove the harness is measuring a real run.

- Backend integrity: token usage, raw provider calls, model snapshot, and route preflight prove the backend was not stubbed, bypassed, or pointed at the wrong provider.
- Capture integrity: every LLM span has raw HTTP coverage; every run has an outcome; every judge span is captured when a judge influenced the score.
- Baseline integrity: compared cells share scenario ID, profile hash, seeds, split tags, and model snapshot semantics.
- Gate integrity: deterministic build/runtime/verifier failures cannot be overridden by LLM judges; held-out gates pair the intended baseline and candidate seeds.
- Artifact integrity: the evaluator judges the final deliverable users see, not an intermediate JSON, prompt, scaffold, or partial report.

For `@tangle-network/agent-eval`, check these primitives first:

- `assertRealBackend`
- `assertLlmRoute`
- `assertRunCaptured` / `throwIfRunIncomplete`
- `RunRecord` validation and model snapshot pinning
- `AgentProfileCell` stamping and scorecard append keys
- `HeldOutGate` split/seed pairing
- raw provider sink coverage for judged LLM calls

## Failure Taxonomy

Classify every row or case into one of these buckets:

| Class | Meaning |
|---|---|
| Product failure | The product or generated artifact failed the real user-visible requirement. |
| Agent failure | The agent chose the wrong strategy despite valid harness observation. |
| Harness failure | The test/eval scaffold, assertion, verifier, browser driver, trace sink, scorecard, or report renderer is wrong. |
| Evaluator contamination | Judge/reviewer/auth/quota/routing/model-format errors affected scoring. |
| Baseline invalid | The comparison is unpaired, drifted, too noisy, undersampled, or uses incompatible profile cells. |
| Infra blocked | External services, credentials, capacity, or transport failures prevent a valid measurement. |

Rows in the last four classes must not be treated as product or agent regressions until fixed or excluded with a documented reason.

## Procedure

1. Reconstruct the run.
   - Capture command, commit, model/profile, scenario set, seeds, split tags, environment, run ID, and artifact locations.
2. Build a case ledger.
   - For each scenario or row: status, score, pass/fail reason, verifier layers, judge status, trace URI, raw-call coverage, token/cost, infra markers, and final artifact pointer.
3. Check integrity before quality.
   - Run or inspect backend/capture/baseline/gate checks before reading semantic scores as signal.
4. Cluster failures by phase.
   - Preflight, scenario selection, agent execution, tool/runtime, artifact capture, deterministic verifier, semantic judge, reviewer/critic, scorecard, promotion gate, reporting.
5. Rank improvements by truth gained.
   - Highest value is removing contamination that turns many rows into honest pass/fail outcomes. Next is tightening baseline/gate validity. Only then optimize the agent.
6. Produce a rerun plan.
   - Include the exact command, focused scenario subset, required env vars, expected metric movement, and the artifact that will prove the harness is now honest.

## Repo Adapters

When the current repo has project-specific memory, benchmark artifacts, or custom runner terminology, read the local index first and map those names back to the generic taxonomy above. Keep the public skill generic; repo-specific failure classes belong in that repo's memory or harness docs.

Common adapter fields worth preserving in the case ledger: scenario ID, attempt ID, turns used, stream event count, scaffold/build status, semantic judge status, reviewer status, infra-contamination marker, trace URI, and report output path.

## Output

```markdown
## Eval Harness Diagnosis

Run: <id/path>
Command: <original or reconstructed command>
Cases analyzed: <n>

| Class | Count | Evidence |
|---|---:|---|
| Product failures | <n> | <case ids> |
| Agent failures | <n> | <case ids> |
| Harness failures | <n> | <case ids> |
| Evaluator contamination | <n> | <case ids> |
| Baseline invalid | <n> | <case ids> |
| Infra blocked | <n> | <case ids> |

Ranked improvements:
1. <phase/root cause> — <count>, <truth gained>, <fix>
2. <phase/root cause> — <count>, <truth gained>, <fix>

Rerun:
`<exact command>`

Proof required:
- <artifact/metric that must change>

Next dispatch:
- `/agent-eval` for framework code changes, `/agent-eval-adoption` for product wiring, `/evolve` for optimizing a now-honest metric, or `/diagnose` for non-eval failures.
```

Never answer with only "rate limited", "unavailable", or "blocked." Include the exact failed probe, missing env var or HTTP status/body class, row/log path, and rerun command.
