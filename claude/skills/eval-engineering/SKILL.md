---
name: eval-engineering
description: Build executable agent evaluations through the production entrypoint, calibrate the checks, and complete the requested case coverage.
---

# Eval engineering

Build cases that distinguish required agent behavior from realistic failure.
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

## Calibrate and run

1. Send independently justified acceptable and realistic unacceptable fixtures through the exact scoring path.
2. Run the simplest plausible baseline and determine whether it exercises the intended capability.
   A simple solution that meets the user requirement is a valid comparison result.
3. Check for leaked setup data, filenames, fixtures, answers, or scoring instructions.
4. Run a real target attempt and confirm that final output, required effects, traces, usage, and scoring evidence were captured.
5. Inspect what the target actually saw and did, and what evidence each check used.
   Repair cases that reward assertions, intermediate artifacts, or irrelevant proxies instead of the required outcome.
6. Complete the remaining requested cases and verify each distinct execution or scoring path.

Do not broaden spending while a case's required behavior or evidence cannot be assessed.

## Completion

Report case paths, commands, production entrypoint, environment boundary, calibration results, real attempt records, coverage, and blind spots.
Files alone do not complete an evaluation; the case must execute and reject its intended failure with recorded evidence.

## Log the run

```bash
skill-run-log /eval-engineering --target "<capabilities and case scope>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Semantic assessment needs a new or corrected judge | `/eval-agent` | The decision, evidence, and independently labeled examples |
| An existing result may be contaminated or misclassified | `/eval-harness-diagnose` | The run IDs and suspect stage |
| Architectures need a resource-controlled comparison | `/arena-experiment` | The calibrated cases and resource contract |
| Valid cases expose a known improvement to test | `/evolve` | The baseline, failures, and proposed change |
