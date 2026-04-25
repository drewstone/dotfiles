---
name: diagnose
description: "Analyze failure traces: cluster by root cause, rank by impact × fix complexity, generate concrete fix hypotheses. Works with JUnit XML, JSON reports, CI logs, benchmark results. Triggers: 'why is this failing', 'analyze failures', 'diagnose', 'triage results'."
---

# Diagnose — Failure Trace Analysis

Given test or benchmark results, figure out WHY things fail, cluster similar failures, produce a ranked list of what to fix. Shared conventions in `_common.md`.

## Input Discovery

Find the results to analyze. Check (in order):
1. Arguments passed after `/diagnose` (file path, directory, URL)
2. Most recent test/benchmark output in the project (check `agent-results/`, `test-results/`, `coverage/`, CI artifacts)
3. Ask the user if nothing found

Supported formats:
- JSON test reports (Jest, Vitest, custom)
- JUnit XML
- TAP output
- Raw CI logs
- Benchmark JSON/CSV
- Custom report formats (read and adapt)

## Extract failures

For each failure, extract:
- **Test/case ID**: which test failed
- **Error message**: the immediate error
- **Stack trace**: if available
- **Context**: what was happening before the failure (prior steps, state)
- **Timing**: how long it ran, when it failed relative to the test lifecycle
- **Environment**: what conditions were active (config, feature flags, external deps)

## Classify root causes

Assign each failure to a root cause category. Common categories (adapt to the project):

| Category | Pattern |
|---|---|
| **Logic error** | Wrong output, incorrect computation, off-by-one |
| **Timeout** | Hit time limit, hung waiting for something |
| **Crash/exception** | Unhandled error, null reference, type error |
| **External dependency** | Network failure, API error, service down |
| **Race condition** | Flaky, passes sometimes, timing-dependent |
| **Resource exhaustion** | OOM, disk full, connection pool depleted |
| **Configuration** | Wrong config, missing env var, wrong mode |
| **Stale state** | Cache poisoning, leftover data, mutation leak |
| **Verification error** | Test assertion wrong, not the code |
| **Environment mismatch** | Works locally, fails in CI (or vice versa) |

For LLM/agent systems, add:
| **Wrong strategy** | Agent took fundamentally wrong approach |
| **Navigation error** | Went to wrong page/element |
| **Snapshot stale** | Acted on outdated state representation |
| **Anti-bot/blocked** | External system rejected the agent |
| **Dialog obstruction** | Popup/modal blocked the intended action |
| **Model hallucination** | LLM produced incorrect/impossible output |

## Cluster

Group failures that share the same root cause. A cluster is actionable when:
- 2+ failures share the same root cause
- OR 1 failure is in a critical path

For each cluster:
```
Cluster: <name>
  Failures: <count> (<list of test IDs>)
  Root cause: <specific explanation>
  Affected code: <file:line or module>
  Fix complexity: trivial / moderate / significant / architectural
  Expected impact: fixing this would resolve <N> failures (<X>% of total)
```

## Rank

Sort clusters by **expected impact / fix complexity**. Best targets: high-impact, low-complexity.

## Generate hypotheses

For each top cluster, produce a concrete hypothesis:

```
Hypothesis: <id>
  Cluster: <which failure cluster this addresses>
  Diagnosis: <what's wrong and why>
  Proposed fix: <specific code change — files, functions, approach>
  Expected result: <which failures should turn to passes>
  Risk: <what could regress>
  Verification: <how to confirm the fix worked>
```

## Output

```
Failure Diagnosis — <source>
Generated: <date>

Summary:
  Total:    <N> tests/cases
  Passed:   <N> (<X>%)
  Failed:   <N> (<X>%)
  Skipped:  <N>

Failure Clusters (ranked by impact):
  1. <cluster name> — <N> failures, <fix complexity>
     <root cause explanation>

  2. <cluster name> — <N> failures, <fix complexity>
     <root cause explanation>

Top Hypotheses:
  1. <hypothesis with specific fix proposal>
  2. <hypothesis with specific fix proposal>

Unclustered / One-off Failures:
  <list of failures that don't fit a pattern>
```

## Rules

- **Read the actual traces**, not just the summary. The summary says "failed", the trace says WHY.
- **Be specific about code locations.** "The retry logic is wrong" → "The retry loop in `src/client.ts:142` doesn't backoff, causing rapid retries that trigger rate limiting."
- **Distinguish test bugs from code bugs.** If the assertion is wrong but the code is right, say so.
- **Don't guess.** If you can't determine root cause from the trace, say "insufficient data" and suggest what additional instrumentation would help.
- **Use parallel subagents** to read multiple failure traces simultaneously.

Append a `.evolve/skill-runs.jsonl` line on completion. See `_common.md`.
