---
name: eval-harness-diagnose
description: Trace suspect eval results through execution, evidence, scoring, comparison, and reporting.
---

# Eval Result Diagnosis

Use this when an existing eval result may reflect broken measurement, service failure, drift, or invalid comparison rather than agent quality.
Start from raw case artifacts, not a summary.

## Reconstruct The Run

Record the exact command, commit, package versions, model snapshot, profile, cases, repetitions, seeds, split labels, environment, run ID, and artifact locations.
If any value is unknown, mark it unknown rather than inferring it.

For each case, collect:

- status, score, pass reason, and failure reason;
- deterministic check results and model-judge result;
- trace and raw provider-call coverage;
- final user-visible artifact;
- tokens, cost, latency, retries, and timeout state;
- service, credential, quota, routing, and parsing errors.

## Check Integrity In Order

1. **Execution:** the intended backend, pinned model, profile, entrypoint, and dependencies actually ran.
2. **Capture:** every scored model call and required tool or state change has evidence; every run has an outcome.
3. **Artifact:** scoring reads the final deliverable users receive, not a prompt, partial file, or intermediate JSON.
4. **Scoring:** objective facts use code; semantic scoring has the required evidence and distinguishes known good and bad fixtures.
5. **Comparison:** baseline and candidate use paired cases, compatible seeds, matching split labels, and equivalent runtime conditions.
6. **Decision:** deterministic failures cannot be overridden by a semantic score; missing evidence cannot become a passing zero or default.

For `@tangle-network/agent-eval`, read the installed source and exports before naming checks.
Do not trust remembered API names or a copied primitive catalog.

## Classify Every Case

Use exactly one primary class per case:

| Class | Meaning |
|---|---|
| Product failure | The final product behavior failed the user requirement. |
| Agent failure | The agent chose a bad strategy in a valid run. |
| Measurement failure | Execution, capture, scoring, comparison, or reporting was wrong. |
| Service failure | Credentials, quota, transport, capacity, or an external dependency prevented a valid run. |
| Inconclusive | Evidence is missing or the case cannot distinguish the claimed behavior. |

Do not count measurement, service, or inconclusive cases as agent regressions.

## Find The Root Cause

Cluster cases by the first failing stage:

```text
setup -> agent execution -> tool or dependency -> artifact capture
-> objective checks -> semantic scoring -> comparison -> release decision -> report
```

Read source only after the rows identify the failing stage.
Fix the earliest shared cause that restores the largest number of honest outcomes.
Only optimize the agent after execution, capture, scoring, and comparison are valid.

## Rerun

Start with the smallest affected case set.
State the expected artifact change and the exact result that would disprove the diagnosis.
After the focused rerun passes, rerun the full comparison without changing cases, seeds, or thresholds.

## Output

Report the run identity, cases analyzed, count in every class, root causes with case IDs and artifact paths, exact focused rerun command, and full-rerun condition.
Include zeros and unknowns.
Do not stop at “rate limited” or “unavailable”; include the failed probe, status or error class, affected cases, and retry command.

## Then consider

- `agent-eval` when the root cause requires package-internal changes.
- `eval-engineering` when the case design or scoring contract must be rebuilt.
- `evolve` when measurement is valid and the remaining failures belong to the agent.
- `diagnose` when the failure is outside evaluation or benchmarking.
