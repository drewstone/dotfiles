---
name: eval-engineering
description: Turn production code and traces into one calibrated agent eval, then expand only after it works.
---

# Eval Engineering

Use this when creating a new eval, regression case, benchmark task, or training reward for an agent.
The unit of work is one executable case that distinguishes capable behavior from a realistic failure.

## Map The Real Agent

Read the public entrypoint and the code it reaches.
Record:

- the user job and final output;
- prompts, profiles, models, tools, memory, retrieval, retries, and routing;
- data sources, mutable state, permissions, network access, and side effects;
- existing tests, fixtures, incidents, feedback, and evals;
- the exact production call the case should exercise.

Do not turn private implementation details into the question unless understanding those details is the product behavior being tested.
Prefer the production entrypoint over an eval-only reconstruction.
If reconstruction is unavoidable, name the behavior it cannot preserve.

## Mine Real Runs

When traces or run records exist, sample recent successes, failures, and common requests.
Cluster them by user job and failure cause.
Use traces to find realistic inputs, dependencies, and failure modes.
Do not copy a recorded answer into hidden expected data or treat the agent's own output as truth.

## Choose One Target

For each candidate target, state:

```text
Capability: behavior the agent should demonstrate
Request: realistic input sent through the real entrypoint
Success: independently observable outcome
Failure: plausible wrong behavior the case must reject
Needs: data, credentials, services, state, and side effects
```

If the user already named the target, proceed.
Otherwise choose the highest-severity frequent gap that is not already covered.
Ask one decision question only when the choice changes product intent or side-effect authority.

## Design The Case

Specify these boundaries before implementation:

1. **Runtime:** real entrypoint, pinned profile and model, turn count, budget, and timeout.
2. **Environment:** frozen fixtures or approved live dependencies, initial state, reset behavior, and blocked production writes.
3. **Evidence:** output, tool calls, files, state changes, citations, traces, usage, cost, latency, and errors needed to judge success.
4. **Checks:** code for objective facts; a model judge only for semantic facts that code cannot decide.
5. **Result:** one primary pass or score, with infrastructure failures reported separately from agent failures.

Keep hidden answers, scoring instructions, and judge credentials unavailable to the target agent.
An adapter may translate inputs and capture outputs.
It must not choose actions, supply answers, or claim effects that were not observed.

## Build And Calibrate

Build one case before a suite.
Use the repo's existing eval package and run-record format instead of adding another runner or result schema.

Before spending on a full run:

1. Feed the checks a clearly capable fixture and require a pass.
2. Feed them a plausible wrong fixture and require a fail.
3. Run the simplest baseline that should fail the capability.
4. Confirm the task cannot be solved from leaked setup data, filenames, fixtures, or scoring text.
5. Run one real target attempt and confirm complete output, trace, usage, and scoring evidence were captured.

If the strong and weak fixtures do not separate, repair the case before running more attempts.

## Audit The Pilot

Inspect both sides of the result:

- what the agent saw, called, changed, and returned;
- what evidence each check read and why it passed or failed.

Reject or repair a case that rewards citation count instead of support, accepts claimed actions instead of observed state, exposes answers, grades an intermediate artifact, confuses service failure with agent failure, or can be passed without exercising the selected capability.

## Expand Only After The Case Works

Add independent cases across important users, task shapes, and failure modes.
Keep development cases visible for iteration and a held-back set unseen during candidate generation.
Compare baseline and candidate on the same cases and seeds.
Report sample count, paired change, uncertainty, critical regressions, cost, latency, and failure categories.

## Completion

Report:

- case path and exact run command;
- production entrypoint and environment boundary;
- strong, weak, and simple-baseline calibration results;
- real pilot result with artifact and trace paths;
- known blind spots and the next distinct case worth adding.

An eval is not complete because its files exist.
It is complete when the intended capability ran, the expected evidence was observed, a realistic failure was rejected, and the result can be reproduced.

## Then consider

- `eval-agent` when semantic scoring needs a calibrated model judge.
- `eval-harness-diagnose` when an existing result may be contaminated or misclassified.
- `arena-experiment` when comparing agent architectures at equal compute.
- `evolve` when the eval is valid and the next task is optimizing against it.
