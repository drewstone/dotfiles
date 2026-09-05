---
name: autopsy
description: Explain one null, surprising, or suspect run from raw data and test the competing explanations.
---

# Autopsy

Use this for a completed run whose result may be misleading or unexplained.

## Reconstruct and test

1. Identify the actual run, command, artifact paths, tested code/configuration, environment, and expected result.
2. Read raw rows and traces, then recompute the headline result.
   Reconcile every attempted, completed, failed, invalid, and missing observation with the reported totals.
3. Confirm that the intended change and inputs reached the measured execution path.
   Inspect no-ops, cached output, missing backends, leakage, saturated scores, and differences between comparison groups.
4. Form competing explanations and choose a check whose outcomes would distinguish them.
   Use [the discriminating checks](references/discriminating-checks.md) when the cause remains unclear.
5. Run the smallest available check within the authorized scope.
   Record which explanations it rejects, supports, or leaves open.
6. If fixes are authorized, correct the demonstrated cause and reproduce the affected result before relying on it.
   Preserve the original run and identify conclusions that the correction invalidates.

## Record the finding

Write `.agent/autopsies/YYYY-MM-DD-<run-slug>.md` with run identity, sources, recomputed result, explanations tested, check results, and resulting decision.
Distinguish execution failure, comparison design failure, measurement failure, a valid result, and insufficient evidence.
Record contributing causes when one label would conceal them.
A null estimate alone does not prove an effect is absent.
If a decisive check cannot run, name the missing data, resource, or authority and the check that would resolve it.

## Log the run

```bash
skill-run-log /autopsy --target "<run ID>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Other failures may share the confirmed cause | `/diagnose` | The failure set and confirmed example |
| Corrected measurement permits the active experiment to continue | `/evolve` | The corrected command and invalidated result |
| The result was never measured on the real execution path | `/ground-truth` | The missing segment and actual environment |
| The claimed architecture was tested outside its relevant conditions | `/dont-collapse-the-architecture` | The claim, tested conditions, and mechanism records |
| The agent ignored state, tools, or user intent | `/agent-behavior-audit` | The trace and missed requirement |
