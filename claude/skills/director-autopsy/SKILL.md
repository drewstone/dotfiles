---
name: director-autopsy
description: Audit recursive research directors from run records, including profile changes, artifact use, recovery, costs, and research outcomes.
---

# Director autopsy

Explain how research directors behaved and what the evidence implies for the next run.
This audit does not perform their research or launch a new campaign.

## Collect the complete record

In a lab with the director census, run `node tools/director-census.mjs --json` and `disco inspect`.
Inspect raw details with `disco report <runId>` for unexplained results and exceptions in the census.
Use `node tools/disco.mjs` from the checkout when the installed CLI is unavailable.
If the project uses a different record interface, locate its census and run-detail commands in the current project source.
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
When parallel readers would help, give them disjoint run sets and reconcile their findings against the complete record.
Do not infer coverage from the number of readers.

## Interpret

Separate whether the mechanism ran, whether its output passed independent checks, and whether it improved research outcomes under the registered resource comparison.
Report resource and sampling differences before a comparative verdict.
An inactive mechanism leaves its quality claim untested, while its execution failure remains an observed outcome.
File presence, citations, and self-reported success cannot establish novelty or useful research progress.

Give the run IDs and evidence for each conclusion, the unresolved checks, and changes supported by the audit.

## Log the run

```bash
skill-run-log /director-autopsy --target "<runs or all>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| An outlier needs a causal explanation | `/autopsy` | The run ID and raw artifacts |
| Directors may share a failure cause | `/diagnose` | The complete rows and confirmed example |
| The claimed mechanism did not execute | `/discovery-lead` | The missing event and smallest live proof |
| Valid records support an architecture comparison | `/arena-experiment` | The cases, matched rows, and resource accounting |
