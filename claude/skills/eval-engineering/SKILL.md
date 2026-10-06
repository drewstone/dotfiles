---
name: eval-engineering
description: Build and calibrate agent evaluations through the production entrypoint, including model judges for semantic quality and the pre-spend check that scoring separates required behavior from failure and a simple baseline.
---

# Eval engineering

Build cases that distinguish required agent behavior from realistic failure, and check that any evaluation can answer its question before broader spending.
Prove the first executable case before expanding, then complete the coverage the task requests.

## Map the behavior

Read the public entrypoint and relevant execution path.
Identify the user job, final outcome, prompts or profiles, tools, data, mutable state, permissions, dependencies, and existing evaluation coverage.
Search by behavior before adding a case that may already exist.
Use the production entrypoint; if a reconstruction is necessary, identify the behavior it cannot preserve.

For each target, specify:

- a realistic request;
- an independently observable success condition;
- a plausible failure the case must reject;
- required data, services, credentials, initial state, and side effects.

Choose an uncovered gap by consequence and relevance when the user has not specified one.
Clarify only a product-intent or authority choice that cannot be inferred.
Read [trace selection and suite expansion](references/trace-cases.md) when mining recorded runs or building coverage across cases.

## Build the case

Define the execution identity and limits, environment and reset behavior, evidence to capture, checks, and result classification.
Use isolated fixtures or authorized live dependencies with a reversible state reset.
Prevent writes outside the case's authority.

Use the project's existing runner and record format.
An adapter may translate inputs and capture outputs; it must not choose agent actions, supply hidden answers, or invent effects.
Keep expected answers, scoring instructions, and judge credentials unavailable to the target.
Use code for objective checks and a calibrated model judge only for semantic requirements.
Separate infrastructure and measurement failures from agent outcomes.

## Calibrate before measuring

This guard applies to any evaluation, including one this task did not build.
Reuse existing calibration while its cases, scoring path, and relevant conditions remain applicable.

1. State the required behavior and the decision the result controls.
2. Send independently justified acceptable and realistic unacceptable fixtures through the exact scoring path.
   Include borderline cases when the decision depends on a boundary.
3. Check inputs and intermediate results for leaked setup data, filenames, fixtures, answers, or scoring instructions, and for missing evidence, constant output, and unrelated proxy measures.
4. Confirm that acceptable behavior passes and the relevant failure fails with adequate separation for the observed scoring variation.
   Use the domain's decision boundary and error costs; do not invent a universal score cutoff.
5. Run the simplest plausible solution under the same conditions, such as a constant answer, a direct lookup, or one unguided attempt.
   If it ties the intended system: retain the result when the user task is solved adequately; add a case when the claim concerns a capability or difficult condition the case omits; repair leaked answers or scoring defects before comparing systems.
   Do not make a task harder solely to ensure that the intended system wins.
6. Run a real target attempt and confirm that final output, required effects, traces, usage, and scoring evidence were captured.
   Inspect what the target actually saw and did, and what evidence each check used.
   Repair cases that reward assertions, intermediate artifacts, or irrelevant proxies instead of the required outcome.
7. Complete the remaining requested cases and verify each distinct execution or scoring path.

Do not broaden spending while a case's required behavior or evidence cannot be assessed.

## Semantic judges

Use a model judge when code cannot decide a required semantic property, such as usefulness or faithfulness.
A semantic score cannot override a deterministic failure.
State what artifact is judged, what decision the result controls, which evidence is allowed, and the consequences of false passes and false failures.

| Need | Judgment |
|---|---|
| Requirements met | Classification by named criteria |
| Preference between outputs | Pairwise comparison with randomized order |
| Source support | Claim-level support classification |
| Explanation of a multi-turn failure | Turn or outcome classification from recorded evidence |

Use separate dimensions only when they affect a decision, and avoid an unanchored quality score.
Collect real acceptable, unacceptable, and borderline examples from feedback, incidents, domain references, and prior runs, labeled independently of the judge being built.
Use qualified human labels and retain disagreements for consequential judgments.
Provide the evidence needed for each criterion; do not infer file changes, tool effects, citation support, or execution success from the target's assertions.
Require a structured decision, criterion results, evidence references, a short reason, and an explicit cannot-judge outcome.

When building or changing a judge, read [judge calibration](references/judge-calibration.md) and run it through the actual scoring path.

- Delimit untrusted target content as data and test attempts to influence the judge.
- Limit input and reference sizes without silently dropping required evidence.
- Remove secrets before model calls and persistence.
- Validate structured output; malformed or missing results cannot pass.
- Record the actual model and provider identity, prompt, input digest, evidence, raw and parsed results, errors, latency, tokens, and cost.
- Reuse cached judgments only when the input, evidence, and judging configuration match.

Readiness depends on the decision's recorded error tolerance and required integrity checks, not a universal agreement percentage.

## Completion

Report case paths, commands, production entrypoint, environment boundary, calibration fixtures and label sources, scores, sample counts, scoring variation, baseline result, real attempt records, coverage, and blind spots.
For a judge, also report all measured error rates, known blind spots, and the supported decision scope.
Files alone do not complete an evaluation; the case must execute and reject its intended failure with recorded evidence.

## Log the run

```bash
skill-run-log /eval-engineering --target "<capabilities and case scope>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| An existing result may be contaminated, misclassified, or suspect | `/diagnose` | The run IDs and suspect stage |
| Architectures need a resource-controlled comparison | `/pursue` | The calibrated cases and resource contract |
| Valid cases expose a known improvement to test | `/evolve` | The baseline, failures, and proposed change |
| Shared judge types or package execution must change | `/agent-eval` | The affected API and consumers |
