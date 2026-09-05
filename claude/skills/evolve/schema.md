# Experiment and progress records

Read this before writing `.agent/experiments.jsonl` or updating the associated result snapshot.
Use an adopted project record format when one already owns this state.
Preserve existing field meanings and actual evidence identities.

## `.agent/experiments.jsonl`

Append one JSON object per completed comparison.

| Required field | Type | Meaning |
|---|---|---|
| `id` | string | Unique experiment identity |
| `project` | string | Project name |
| `goal` | string | Active improvement goal |
| `round` | number | Experiment cycle |
| `hypothesis` | string | Tested causal claim |
| `category` | enum | `prompt`, `config`, `code`, `infra`, `model`, or `criteria` |
| `lever` | string | What changed |
| `targets` | string[] | Affected agents, files, services, or other targets |
| `baseline` | object | Before values with the chosen measurement summary |
| `result` | object | After values with the same measurement summary |
| `delta` | number | Primary metric change, with units and direction stated in the analysis |
| `verdict` | enum | `KEEP`, `ITERATE`, `ABANDON`, or `REGRESSION` |
| `durationMs` | number | Observed experiment duration |
| `timestamp` | string | ISO 8601 timestamp |
| `reasoning` | string | Evidence and decision rule supporting the experiment |
| `learnings` | string[] | Findings supported by this experiment |

| Optional field | Type | Meaning |
|---|---|---|
| `variation` | number | Attempt within the hypothesis |
| `parentId` | string | Prior experiment identity |
| `deploymentVerified` | boolean | Whether the deployed change was confirmed before measuring |
| `failureMode` | string | Observed execution, scoring, or approach failure |
| `crossPollinated` | boolean | Whether the change came from another target's result |
| `promptVersionId` | string | Tested prompt identity; use the project registry when present |
| `costUsd` | number | Experiment cost; distinguish estimates in the supporting analysis |
| `reps` | number | Actual repetitions; record unequal group counts in the evidence |
| `productValueClaim` | string | Relationship between the metric and user outcome |
| `transcriptPath` | string | Path to the producing session transcript |
| `traceDir` | string | Path to run-scoped evidence |
| `rejected` | array | Objects with `hypothesis` and `reason` for rejected alternatives |

Store raw observations, sample counts, analysis, and errors in the referenced evidence.
Do not invent a numeric `delta` or duration to satisfy this schema.
Record incomplete or failed attempts in the run artifacts and `.agent/progress.md` when a valid comparison row cannot yet be written.
Include those attempts in total coverage and resource accounting.

## `.agent/current.json`

Preserve `mode`, `goal`, `status`, `round`, `generation`, `activePursuit`, `updatedAt`, and `metricClaims`.
Update the active state without replacing unrelated fields.
A checkpoint must identify the ongoing work and how to resume it.

## `.agent/scorecard.json`

Preserve the existing `product`, `timestamp`, `flows`, `aggregate`, `coverage`, and `evolveHistory` fields.
Each flow retains `name`, `score`, `target`, and `status`.
Use `null` scores and `unmeasured` status when a flow has not been measured.
A score below a required minimum cannot have `pass` status.
Apply the metric's actual direction and decision rule rather than assuming all scores improve upward.

Compute an aggregate only over compatible measurements and report the measured coverage.
Do not convert unmeasured flows to zero, silently remove them, or claim complete product coverage from a partial aggregate.
