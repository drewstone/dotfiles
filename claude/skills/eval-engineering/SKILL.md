---
name: eval-engineering
description: Build and calibrate agent evaluations through the production entrypoint, including semantic model judges, System One question sets (decisionPoint) over traces, and the pre-spend check against a simple baseline.
---

# Eval engineering

An excellent evaluation separates the behavior that matters from its most plausible failure, beats a trivial baseline by more than its own noise, and agrees with labels it was never tuned on.
Prove the first executable case, then complete the coverage the task requests.

## Set the bar

Before building, [set the bar](../be-ambitious/SKILL.md#set-the-bar) for the instrument: the best public benchmark, published judge agreement or human inter-rater agreement for this behavior with its source, our current coverage or agreement, the target that beats it, and the labeled set that will show it.
When no existing benchmark measures the requester's goal, build the one that does, at the size it needs.

## Map the behavior

Read the production entrypoint and execution path (user job, outcome, prompts, tools, data, state, permissions, existing coverage), searching by behavior before adding a case; a reconstruction names the behavior it cannot preserve.
For each target specify a realistic request, an independently observable success condition, a plausible failure the case must reject, and the data, services, credentials, initial state and side effects it needs.
Read [trace selection and suite expansion](references/trace-cases.md) when mining recorded runs or building coverage across cases.

## Build the case

Use the project's runner and record format, and isolated fixtures or authorized live dependencies with a reversible reset.
An adapter may translate inputs and capture outputs; it never chooses agent actions, supplies hidden answers or invents effects, and answers, scoring instructions and judge credentials stay hidden from the target.
Answer keys and judge personas state no conclusion on the decision the work is meant to reach: a key that answers "build nothing" for a build mandate, or a lender persona that prefers caution, scores the thesis instead of the work.
Use code for objective checks and a calibrated model judge only for semantic requirements ([semantic judges](references/judge-calibration.md)), and keep infrastructure and measurement failures apart from agent outcomes.
Capture requested and observed execution identity, errors, usage, cost and latency, marking missing values; pair comparisons on equivalent cases and keep candidate development apart from final decision cases.
When evaluating authored instructions (a skill, prompt or profile), compare against a length-matched neutral control and confirm the delivery method reaches the agent.
For a question set a System One model answers over traces, read [System One question sets](references/system-one.md).

## Calibrate before measuring

This guard applies to any evaluation, including one this task did not build; reuse calibration while its cases, scoring path and conditions still apply.

Before spending on measurement, run [the pre-spend check](references/calibration.md) through the exact scoring path: acceptable and realistic unacceptable fixtures separate by more than scoring noise, inputs carry no leaked answers or setup, the simplest plausible solution (a constant answer, a direct lookup, one unguided attempt) is run under the same conditions, and one real attempt's output, effects, traces and usage are captured.
A tie with the simple solution is a finding about the cases or the task, never a reason to make the task harder so the intended system wins; a check tests substance, not presence.

Do not broaden spending while a case's required behavior or evidence cannot be assessed.

## Completion

Report case paths, commands, calibration fixtures and label sources, scores with sample counts and variation, the baseline result, real attempt records, and coverage and blind spots against the bar; for a judge, every measured error rate and its decision scope.
Files alone do not complete an evaluation: the case must execute and reject its intended failure with recorded evidence.

## Log the run

```bash
skill-run-log /eval-engineering --target "<capabilities and case scope>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| An existing result may be contaminated, misclassified or suspect | `/diagnose` | the run IDs and suspect stage |
| Valid cases expose a gap to the bar | `/evolve` | the baseline, bar, failures and proposed mechanism |
| Shared judge types or package execution must change | `/agent-eval`, in the agent-eval checkout | the affected API and consumers |
