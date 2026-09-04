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

## Log the run

On completion, append one line so later analysis can grade this skill:

```bash
skill-run-log /autopsy --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| ≥5 failures share the symptom you just root-caused | `/diagnose` | the failure list + the root cause you confirmed for this one |
| Root cause was the metric or harness, and it is now fixed | `/evolve` | the corrected measurement command + the pre-fix number to discard |
| Root cause names a mechanism that caps the current approach | `/pursue` | the named cap + the evidence it is structural, not a parameter |
| The number was never measured on the real path (local stand-in, warm cache, wrong env) | `/ground-truth` | the hop that was dark + the real-path command that would measure it |
| Root cause is the agent ignoring state, skipping tools, or reporting unearned success | `/agent-behavior-audit` | the transcript span + the state it failed to read |
| The run succeeded and produced well-formed output that discovered nothing — its acceptance criterion could not fail | `/operate` | the task text + the command that should have decided it |
