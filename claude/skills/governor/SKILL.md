---
name: governor
description: Read active work, choose the next applicable skill from evidence, record one dispatch, and return control to that work.
---

# Governor

Choose the next skill for the active objective.
This router records a decision; the selected skill owns execution.
Do not invent another task when the objective is complete or the evidence supports leaving the system unchanged.

## Read current work

Inspect the active user mandate, `.agent/current.json`, progress, recent skill runs, governor decisions, experiments, result snapshots, and relevant artifacts.
Use the project's adopted paths where they differ.
Treat unavailable state as unknown, not a measured zero.

Check the actual status of the previous dispatch before choosing again.
An older timestamp or absent new file does not prove that work failed to run.
Resume active work when appropriate; inspect execution records before duplicating a dispatch.
Honor cancellation, resource limits, and authority already granted.

## Choose by the blocking need

Prioritize what is necessary for the current objective and what has the greatest consequence if left unresolved.
Use the following distinctions when they apply:

| Need shown by evidence | Kind of work to select |
|---|---|
| Required CI or release checks fail | Reproduce and correct the failure through completion |
| A reported result cannot be trusted | Diagnose execution, measurement, or the specific suspect run |
| An optimization lacks observations on the actual path | Establish the missing measurement |
| An evaluation cannot distinguish required behavior | Repair its case or assessment |
| A security or integrity defect remains | Correct the affected boundary and verify it |
| Unnecessary work causes the problem | Delete or simplify it while preserving required behavior |
| A measured gap has a supported mechanism | Test the scoped improvement |
| The current mechanism cannot address the gap | Research alternatives or build the justified architectural change |
| Completed work lacks verification or an authorized release | Finish that work |
| Context replacement threatens active work | Preserve the state needed to resume |

Run `skills` or `skills <substring>` to discover installed capabilities and inspect the candidate skill's actual trigger.
This table is a set of decision distinctions, not a fixed skill catalog.
Do not route objective tests to a semantic judge merely because a score is missing.
Do not revert another writer's work or launch an architecture rewrite from a status label alone.

Compare the candidate with plausible alternatives using evidence, consequence, dependencies, and scope.
Explain uncertainty without inventing numeric thresholds or estimated turn savings.
If a prior chain repeats without a state change, investigate the unresolved need instead of dispatching the same cycle again.
A repeated skill can be appropriate when new evidence requires it.

## Record one decision

Give the selected skill, target, reason, source evidence, first useful check, and expected completion condition.
If no work is justified, record `stop` with the reason.
Ask for user input only when a material unresolved choice or missing authority actually prevents progress.

Append `.agent/governor.jsonl` with the existing fields `ts`, `repoShape`, `signals`, `decision`, `reason`, `priorChain`, and `operatorOverride`.
Keep `decision` a bare `/skill` token or `stop`; put explanation in `reason` and evidence in `signals`.
Build `priorChain` from actual recorded decisions.
Use `operatorOverride: null` unless an observed user instruction supports an override.
Never rewrite a prior decision to hide the chain.

## Log the run

```bash
skill-run-log /governor --target "<objective and selected work>" --verdict <DISPATCH|STOP> --next /<skill-or-stop>
```

## Then consider

Execute the recorded skill when it fits the active task and authority, passing the brief and evidence above.
Make no second selection in this invocation; the selected skill owns continuation after its work.
If the recorded decision is `stop`, finish with its supported reason.
