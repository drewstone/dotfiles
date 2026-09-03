---
name: director-autopsy
description: Operator-level autopsy of every research director in discovery-lab — rounds, question portfolios, team topology, lead outcomes, cost per verified claim, the root-returned-early loss class, and what round 2 should change.
---

# Director autopsy

Use this when the operator asks how the research directors are doing, how their topologies are evolving, how many leads each spawns, or what to change before the next round.
It is an evaluation of the factory's outputs; it never does the research and never dispatches a run.

## Flow

1. Refresh the record on the host: `bash tools/kb-sync.sh` runs inside the container; pursuits/ lives only in the container (`disco-fleet`, `/lab2`).
2. Measure first, deterministically: `docker cp tools/director-census.mjs disco-fleet:/tmp/dc.mjs && docker exec disco-fleet node /tmp/dc.mjs --lab /lab2` prints one row per active line; add `--json` for the record the workflow takes.
3. Read the table before any agent runs: which lines got leads and which starved, the `rootEarly` column (leads whose root ended its turn with the contract unmet), `usd` per verified claim.
4. Run the qualitative reading as a workflow: `Workflow({ name: 'director-autopsy', args: { census: <the --json output> } })` from the discovery-lab checkout. One reader per line with a director round (Sonnet), one synthesis, one adversarial critique. Expect 10 to 20 minutes.
5. Report as the operator's artifact: verdict first, the census table, per-line outliers with question ids and file paths, ranked changes each with its evidence, register candidates, confounds (unequal leads per line, one round each, host interruptions).

## Read the numbers right

- `verified` counts oracle re-runs of the lead's own checks. It is not a novelty judgment; the judge column in grades/summary.txt says `not_evaluated` until the novelty sweep runs.
- `rootEarly` is the agent's act, not an outage (tools/failure-classes.mjs `root-returned-early`). Before agent-runtime 0.192.3 every child of such a run died at zero tokens.
- A line with 0 rounds is held by its charter (construct gate, no path-shaped evaluator); see `node tools/line-directors.mjs` stderr.
- Lead-profile candidates live in profiles/lines/lead-<line>-d<N>.json; adoption state is `leadProfileCandidate` / `leadProfile` on the line in lines/lines.json.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A ranked change is a loop or charter edit | `/implement` | the change and its evidence line |
| A register candidate is named | `/verify` | the claim page path and its check line |
| The operator wants the per-run story of one outlier | `/autopsy` | the run dir |

## Log the run

```bash
skill-run-log /director-autopsy --target "<lines or 'all active'>" --verdict <VERDICT> --next /<next-skill-or-stop>
```
