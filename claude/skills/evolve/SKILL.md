---
name: evolve
description: Improve a measured target past the best known result: find the limiting constraint, choose a mechanism (a paper, rival system or architecture change), test it at equal resources and keep what wins; also when progress stalls or an outside idea appears.
---

# Evolve

Excellent improvement work names the result to beat, finds the constraint that actually limits the number, changes the mechanism behind it, and keeps only what an outside check confirms.
When the target needs an architecture change, a rewrite or several mechanisms at once, build them; the size of the change follows the gap, not the request's wording.

## 1. Set the bar

Before reading local state or running anything, [set the bar](../be-ambitious/SKILL.md#set-the-bar): the best result anyone has reached on this task class with its source (the leader of the nearest public benchmark or leaderboard, a paper's reported number, a rival system's published result), our number on the real path, a target that beats it or the measured limit that stops it, and the check that decides.
An internal test set still has an outside bar: the nearest public benchmark's best result, with how its cases differ from ours; an oracle ceiling, a human-agreement ceiling or our own last number is our limit, never the bar.
Search for that result first; without search, write the strongest result you already know with its source, marked to verify, because a promise to look it up later leaves the target unset.
A target at our own last number is not a target.

## 2. Establish the comparison

1. Read `.agent/current.json`, `.agent/progress.md`, recent `.agent/experiments.jsonl`, `.agent/hypotheses/`, `.agent/pursuits/` and the hill's rows in [the climb](../../../docs/processes/climb.md) ledger; resume active work and keep rejected approaches.
2. Record the outcome, completion criteria, regression limits and, in `metricClaims`, how each metric relates to the outcome; fix an unsupported, saturated or diverged metric before optimizing it.
3. Run the existing measurement on the real execution path for a comparable baseline ([comparison design](references/STATS.md) for noisy measurements or several candidates).

## 3. Find the limiting constraint

Measure the actual path before naming the cause (`/diagnose` when the breakdown is unknown), and sort what limits the number into physical or information limits with evidence, required security, integrity and product behavior, choices an authorized decision could change, and historical choices or untested assumptions.
An implementation limit is not a fundamental bound.
Read [constraint-changing options](references/constraint-options.md) when the target needs a different formulation, dependency, execution model or metric; change a metric only when it fails to represent the outcome.

## 4. Choose the mechanism

Research by mechanism, not by our project's vocabulary: methods sections, reference implementations, benchmarks and rival systems; finding no accessible research is not proof that none exists.
For a paper, post, repository or technique that may change the decision, read [outside claims](references/outside-claims.md) and give it `ADOPT`, `ADAPT`, `REJECT` or `DEFER`.

For each candidate record the mechanism, evidence, expected effect in real units, cost, risk and the observation that would refute it ([candidate comparison](references/candidate-comparison.md) when order is unclear).
Deleting work and reusing an existing solution are candidates beside new mechanisms, not a gate in front of them; never invent alternatives, probabilities or multipliers to fill a table.
Before ranking, run the climb's red-team, bigger and unasked-question [passes](../../../docs/processes/climb.md#how-to-think-the-level-up-passes): why the leading candidate failed two weeks from now, what would make the result ten times better (asked again from that answer), and the most important question nobody has asked.
Write `.agent/hypotheses/<date>-<slug>.md` with each candidate's number to beat, deciding test, resource limits, acceptance criteria, permitted regressions and stopping condition.

## 5. Run the experiment

- **Scoped change.** Isolate independent experiments, test coupled changes together, and confirm the required checks exercised the changed artifact; for a deployed experiment, verify the live revision and routing before reading scores.
- **Architecture change.** Build the complete behavior with its dependencies, remove the paths it makes obsolete after checking their callers, review trust boundaries, payments, creation and deletion, external interfaces, concurrency and recovery in proportion to risk, and record it in `.agent/pursuits/<date>-<slug>.md`.
- **Independent variants.** Give each proposer the goal, traces, baseline and rejected mechanisms in an isolated workspace, require a causal architectural change, compare at equal measured resources (proposer and coordination work included), and promote through one owner ([variant state](references/variant-state.md)).
- **Organization comparison.** Follow [the architecture comparison protocol](references/arena.md) after `/eval-engineering`'s pre-spend check.
- **Production speed or infrastructure.** Run the loop in production ([live-system hills](references/live-system-hills.md)).

Preserve failed and invalid attempts; never tune on hidden decision cases or move thresholds after seeing results.

## 6. Decide

Apply the recorded comparison rule, useful-effect requirement and regression limits, and record `KEEP`, `ITERATE`, `ABANDON` or `REGRESSION` with uncertainty and deployment limits; retaining a candidate and proving it fits the deployment are separate claims.
Change approach when evidence rejects it; rerun unchanged work only to resolve recorded uncertainty.
A hill flat for three measurements changes mechanism, not effort: return to step 4.
The run ends when the outside check shows the target met, or at an explicit limit, a cancellation, or an evidenced dead end that explains the miss; a met target gets the next one ([ratchet](../../../docs/processes/climb.md#the-engine-what-makes-the-climb-run-without-us)).

## Preserve and report

After each decision update `.agent/current.json` and `.agent/progress.md`, append `.agent/experiments.jsonl` ([schema](schema.md)) and the climb ledger row (`layer`, `hill`, a `prediction` block, the `result`), and refresh `.agent/scorecard.json`; read [durable unattended runs](references/unattended-runs.md) before handing control to a runner.
Report the bar, before and after against it, coverage, uncertainty, regressions, resource use and decision evidence, with projections labeled apart from measurements.

## Log the run

```bash
skill-run-log /evolve --target "<outcome and experiment scope>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --detail <KEEP|ITERATE|ABANDON|REGRESSION|ADOPT|ADAPT|REJECT|DEFER> \
  --prediction "<number to beat>" --metric "<metric>" --unit <unit> --before <baseline> --after <result> --source <experiment id> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A result is null, surprising or suspect, or the limiting cause is unmeasured | `/diagnose` | raw observations, exact command and baseline |
| The check that decides does not exist, or changed scoring invalidates calibration | `/eval-engineering` | the pass and fail lines, changed path and fixtures |
| Independent tracks must be built and integrated together rather than compared | `/orchestrate` | track scopes, shared comparison and limits |
| A proven change is ready for release | `/ship` | tested revision, decision evidence and release target |
