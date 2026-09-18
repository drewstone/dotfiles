---
name: director-autopsy
description: Audit recursive research directors from run records, including profile changes, artifact use, recovery, costs, and research outcomes.
---

# Director autopsy

Explain how research directors behaved and what the evidence implies for the next run.
The audit is an observer step: the outermost observer reads a fleet's records, and a director reads the fleet it spawned.
This audit does not perform their research or start a new run.

## Collect the complete record

Read the record through the project's actual command surface, checked in its current source before use.
In discovery-lab that surface is `disco run|resume|cancel|report`; use `disco report <runId>` for raw run detail.
The `director-census` and `disco inspect` commands earlier revisions named do not exist there.
If the project offers a different record interface, locate its census and run-detail commands in the current project source.
Report failed commands and unavailable records.

Preserve a row for every director in scope, including failed, inactive, unmatched, and missing results.
Collect every available measured field, including:

- questions proposed, selected, dispatched, and settled;
- children, descendants, depth, and parallel occupancy;
- root and descendant profile identities;
- profile or strategy revisions and their triggering evidence;
- feedback, context replacements, restarts, and resumed assignments;
- checked descendant artifacts and ancestor use;
- seeded false claims accepted or rejected;
- terminal state, failures, retries, tokens, cost, and elapsed time;
- independently checked claims and research progress;
- candidate/control attempts and matched pairs.

Reconcile the census totals with raw records.
Verify any model-backed analyst output against the raw records before you publish or act on it.
Where no per-child trace source exists, say so rather than infer the behavior from its absence.
Autopsy inputs expire, so collect native session data, rotated spans, and suspended sandbox rollouts before they are gone.
An autopsy that cannot cite retained bytes states that limit.
When parallel readers would help, give them disjoint run sets and reconcile their findings against the complete record.
Do not infer coverage from the number of readers.

## Interpret

Separate whether the mechanism ran, whether its output passed independent checks, and whether it improved research outcomes under the registered resource comparison.
Report resource and sampling differences before a comparative verdict.
An inactive mechanism leaves its quality claim untested, while its execution failure remains an observed outcome.
File presence, citations, and self-reported success cannot establish novelty or useful research progress.

Give the run IDs and evidence for each conclusion, the unresolved checks, and the changes the audit supports.
A supported change is a candidate for the next run, never an activation on its own.

## Log the run

```bash
skill-run-log /director-autopsy --target "<runs or all>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| An outlier needs a causal explanation | `/autopsy` | The run ID and raw artifacts |
| Directors may share a failure cause | `/diagnose` | The complete rows and confirmed example |
| The claimed mechanism did not execute | `/discovery-lead` | The missing event and the real research that would exercise it |
| Valid records support an architecture comparison | `/arena-experiment` | The cases, matched rows, and resource accounting |
