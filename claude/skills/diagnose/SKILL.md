---
name: diagnose
description: Find the cause of a broken, flaky or slow code path, a live system's latency or reliability, or a suspect result or eval; reproduce with a red loop, measure the real path's breakdown, rank fixes.
---

# Diagnose

Excellent diagnosis reproduces the exact symptom on the real path, measures where every millisecond or failure goes, and names a cause a discriminating check confirmed, so the fix removes the whole class rather than one instance.
For a slow or unreliable path, [set the bar](../be-ambitious/SKILL.md#set-the-bar) before fixing: the best known latency or failure rate for this kind of path with its source, ours, and the target the fix must reach.

## Debug a bug or regression

Derived from mattpocock/skills diagnosing-bugs (MIT).

1. **Loop**: name one command you have already run that drives the real code path and goes red on the user's exact symptom (a failing test at the reaching seam, a script against a fixture, a replayed request, a fuzz loop, `git bisect run`, an old-versus-new differential), fast and deterministic; raise a flaky bug's rate with repetition and stress. With no loop possible, name the access or instrumentation that would make one.
2. **Minimize**: cut inputs, callers, configuration and steps one at a time while it stays red.
3. **Hypothesize**: rank three to five falsifiable causes, each with the change that would make the bug disappear.
4. **Instrument**: change one variable per probe. Prefer a debugger; tag temporary logs with a unique prefix such as `[DEBUG-a4f2]`. For performance, measure a baseline and bisect before changing code.
5. **Fix**: turn the minimal repro into a failing integration test at a seam that exercises the real pattern, fix the cause in the code that owns it and in every caller and path that shares it, watch the test pass, and rerun the original loop. No correct seam is itself a finding.
6. **Clean up**: remove tagged logs and prototypes; state the cause in the commit or PR.

Redact secrets in every command and output you show.

## Measure a slow or unreliable live path

1. Follow one request from its user-visible start to finish through every material stage, correlating records by request or run identity and separating queueing, active work, external waits and retries.
2. Measure the whole path from its real caller as well as the stages, labeling environment, observation point, warm or cold state, concurrency, sample count and command.
3. Reconcile the stages with total elapsed time (never sum concurrent work or stage percentiles as sequential time), then name the dominant cost or failure source with its share of the whole and each candidate fix's maximum gain.

A local result supports a local claim until the real environment confirms it, and an unobserved segment is a gap, never charged to the nearest visible stage.
When the only test procedure needs unrepeatable shared edits, build a reversible test path on isolated resources first.

## Reconstruct what ran

Identify what actually ran (command, code, configuration, model, cases, seeds, environment, run IDs; missing fields recorded as unknown), and recompute the headline from raw rows, reconciling every outcome class with attempted totals and keeping service and measurement failures apart from agent failures.
Confirm the intended change reached the measured path: check for no-ops, cached output, missing backends, leakage, saturated scores and differences between groups.
For an evaluation score, or a null comparison that may not have tested its mechanism, read [evaluation results](references/eval-results.md) and find the first stage where raw rows disagree with the claim.

## Explain and test causes

Group cases by shared cause, not error wording, and compare failing with passing cases of the same behavior.
Run the smallest check whose outcomes distinguish the competing explanations, stating beforehand what would refute each ([discriminating checks](references/discriminating-checks.md) when the cause stays unclear); a fixed number of reruns is not proof of a root cause.

## Rank and correct

Rank confirmed causes by user consequence, scope, recurrence and dependencies; a cheap minor fix never outranks a severe integrity defect.
When fixes are authorized, correct the earliest shared cause across every path it reaches, reproduce the original failure, rerun the affected cases, and recompute every comparison the correction could change with cases and thresholds fixed, naming the conclusions it invalidates.

## Report

Verdicts: `ROOT_CAUSE_CONFIRMED` (a discriminating check supports the cause for the stated scope), `PARTIAL` (name what remains open), `INSUFFICIENT_DATA` (name the missing evidence and the check that resolves it).
Distinguish product, agent, execution, comparison design, measurement and service failures from a valid result; a null estimate alone does not prove an effect is absent.
Report every outcome class's count with zeros and unknowns, causes with case IDs, the breakdown against the bar, rerun commands and verification; a single run that needs a durable record goes to `.agent/autopsies/YYYY-MM-DD-<run-slug>.md`.

## Log the run

```bash
skill-run-log /diagnose --target "<failure set, run or path>" --verdict <PASS|PARTIAL|BLOCKED> --detail "<confirmed cause, or the missing data>" \
  --metric "<measured quantity>" --unit <unit> --before <baseline> --after <result> --source <evidence> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Confirmed causes require driving CI to completion | `/converge` | the reproductions, branch and live checks |
| The cause is known and the target needs a new mechanism or an improvement experiment | `/evolve` | the breakdown, baseline, bar and testable change |
| Case design or scoring cannot distinguish required behavior | `/eval-engineering` | the affected cases and invalid assumptions |
| The correction belongs in the shared evaluation package | `/agent-eval`, in the agent-eval checkout | the module, consumers and failing path |
| The agent ignored state, tools or user intent | `/critical-audit` | the trace and missed requirement |
