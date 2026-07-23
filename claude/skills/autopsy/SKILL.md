---
name: autopsy
description: Explain one null, surprising, or suspect run from raw data and choose the correct next action.
---

# Autopsy

Use this for one completed run whose result may be false, misleading, or unexplained.
Do not use it to triage many failures; use `diagnose` for that.

## Flow

1. Identify the exact run, artifact path, command, commit, model/config, and expected result.
2. Read raw rows/traces/logs before summaries.
3. Recompute the headline metric from raw data.
4. Check for no-ops, wrong inputs, cached results, stubbed backends, saturation, leakage, and unequal arms.
5. Classify the cause: infra bug, design flaw, dead metric, underpowered real result, or real result.
6. Propose the smallest verification that would distinguish remaining hypotheses.

## Output

Return cause class, evidence, disproven hypotheses, fix or rerun plan, and the decision to believe or reject the result.
Every claim needs a file, row, log line, or command result.

Use `references/full-reference.md` for the full classification table and report format.

## Then consider

- `diagnose` for many failures.
- `evolve` after fixing the metric or mechanism.
- `pursue` if the result shows the approach cannot work.
