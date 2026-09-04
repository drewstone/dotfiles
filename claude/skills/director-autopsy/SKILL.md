---
name: director-autopsy
description: Audit recursive research directors from run records, including depth, profile changes, artifact use, corrections, costs, and research outcomes.
---

# Director autopsy

Use this to explain how research directors behaved and what the next run should change.
Evaluate the system's work; do not perform the research or launch another campaign.

## Measure every director

1. Read the current public CLI help and repository index.
2. Run `node tools/director-census.mjs --json` from the lab checkout for the complete comparable record.
3. Run `disco inspect` for the fleet.
   Define outliers from the census, then run `disco report <runId>` for each one.
   From a checkout, use `node tools/disco.mjs` when the installed command is unavailable.
4. Preserve a row for every director, including zero, null, missing, failed, and unmatched values.
5. Divide the director rows into disjoint batches that fit the available parallel capacity.
   Give each row to one independent reader, then give the complete table to a separate critic.

Measure at least:

- questions proposed, selected, dispatched, and settled;
- direct children, descendants, maximum depth, and parallel occupancy;
- exact root and descendant profile identities;
- profile or strategy revisions and the evidence that caused each change;
- feedback rounds, context replacements, restarts, and resumed assignments;
- checked child artifacts and proof that an ancestor used them;
- seeded false claims accepted or rejected;
- terminal state, failures, retries, tokens, cost, and wall time;
- independently verified claims and independently judged research movement;
- candidate/control attempts and matched pairs.

## Decide

Separate three conclusions:

1. Did the intended recursive mechanism run?
2. Did the resulting work pass its independent checks?
3. Did it improve research outcomes at equal actual resources?

Do not use file presence, citation count, or self-reported success as a novelty result.
An inactive mechanism makes the architecture question untested, not failed.

## Log the run

```bash
skill-run-log /director-autopsy --target "<runs or all>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| One outlier needs a causal explanation | `/autopsy` | the run ID and raw artifacts |
| Several directors share a confirmed failure | `/diagnose` | the complete rows and confirmed example |
| The mechanism never activated | `/discovery-lead` | the missing event and smallest live proof |
| The mechanism activated and the comparison is calibrated | `/arena-experiment` | the full matched rows and resource accounting |
