# Variant state and coordination

Use this reference when maintaining `.agent/meta-harness/` or dispatching independent architectural proposals.
Adopt an existing project store when it already provides these records.
Do not introduce a second variant runner or archive.

## Preserve existing state

| Path | Content |
|---|---|
| `config.json` | Execution target, validation and evaluation commands, dimensions, and their user-outcome claims |
| `frontier.json` | Baseline and retained variants whose outcome tradeoffs remain useful |
| `evolution.jsonl` | Append-only hypotheses, lineage, results, and decisions |
| `runs/` | Actual evaluation observations and execution evidence |
| `variants/` | Reproducible unmerged variants and metadata |

Keep existing configuration fields such as `harnessPath`, `evalCommand`, `validateCommand`, `dimensions`, `dimensionClaims`, and `discoveredAt` when the project uses them.
The execution target identifies the assessed entrypoint; it does not require every architectural change to fit one source file.

Preserve `pending_eval.json` fields `name`, `hypothesis`, `base_system`, `changes`, `axis`, and `file` when that queue format is in use.
Keep pending files isolated per proposer so dispatches cannot overwrite one another.
Retain raw baseline observations, not only a summary in the frontier.

Update `.agent/current.json` with the actual active mode, goal, generation, status, and resumption state.
Append meaningful decisions and open work to `.agent/progress.md`.
Do not mark work terminal merely to hand control to another skill.

## Dispatch independently

Make the baseline, measurement code, and instructions available in each isolated workspace before dispatch.
Each brief names the edit scope, required behavior, evidence, limits, and result locations.
Independent alternatives may touch the same files because they are compared separately.
Changes intended for composition need explicit ownership of overlapping interfaces.

Collect exact source identities, metadata, and raw observations before deciding.
Preserve failing variants as evidence rather than silently omitting them from the comparison.
Keep one owner for accepted-baseline and shared-state updates.

## Retain useful alternatives

A retained frontier contains variants for which another measured variant is not better on every required dimension under the recorded comparison rule.
Account for uncertainty and regression limits before declaring one variant dominant.
Compare resource use as well as task outcomes.

Combining variants creates a new lineage node and requires measurement of the combined implementation.
Do not concatenate conflicting changes or reuse their separate scores as proof of the combination.

After source is durably merged and reproducible from Git, remove its duplicate archive copy when no active consumer needs it.
Retain metadata including `merged`, `commit`, `targetPath`, and `linesChanged`, plus hypothesis, measurements, and decision evidence.
Keep unmerged source or an equally reproducible artifact while it remains relevant to continuation or comparison.
