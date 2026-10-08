# Reflection: operating Discovery, Terraform DC play d→f-c1, 2026-10-06 to 10-08

## Scope and sources
- **Scope:** the coordinator session (me) running the Terraform DC play (d, e, e-codex1, f, f-c1), platform fixes (deploys, parked sandboxes, session durability), the run page, and my coordination.
- **Inspected:**
  - this session's record and its compaction summary;
  - the trace post-mortem (gist f911d5be50cf492093a49c75863f8d8d: 32,542 fleet tool calls, all five runs);
  - the ruler validation (Lab #1518);
  - the run-page cold-reader scores;
  - the release logs from 10-08;
  - auto-memory feedback files;
  - the `operate`, `eval-engineering` and `report` skills.
- **Not inspected:** Codex reasoning for e-codex1, f and f-c1 (not captured); d and e sessions (partial); my own token use (not metered per turn).

## Outcomes for Drew
| Goal | Result | Evidence |
|---|---|---|
| A world-class build-for model and report for Casey | **Not delivered** | Goal score 23–28/100 (post-mortem); ruler 43/100; first draft scored highest |
| Measured improvement across versions | Checks only: 1/16 → 14/18; the goal score didn't move | Post-mortem |
| Runs survive limits, deploys and forks | Partly: one run id, recovered sessions, a keeper; f still died (knowledge lock → report_blocked) and f-c1 lost 2 h of versioning | Lab #1475/#1486/#1484 |
| Platform fixes live in production | Mostly not: deploys blocked 4 times on 10-08, and parked, drain and durability fixes are not live as of 23:40Z | Release logs |
| Readable run page | 3→6/10 on the cold-reader test | Run-page agent |

## What repeated
Counts are approximate, from the session record, so treat them as estimates.

**Drew's critiques**
| What he asked for | Times | Cause on my side |
|---|---|---|
| Merge, ship or deploy now; stop waiting | about 11 | I held ships for live runs; release-path gates broke; I reported "queued" instead of shipping |
| "Where are the results / this is useless / unreadable" | about 6 | I never judged the output as the customer before reporting |
| Waste: old models, idle agents, idle hosts, subscription usage | about 7 | No cost signal tied to the goal; agent sprawl; capacity alarms missing |
| First principles, simplify, best design | about 8 | Each failure got a new mechanism; nothing measured end-to-end |
| "Why so long / status?" | about 9 | No outcome dashboard; the operator learned state by hand |

**My failures**
| Failure | Count | Evidence |
|---|---|---|
| Reported activity (PRs merged, agents started) as progress | most status replies | The f-c1 8-hour stall went unseen |
| Stated a cause before verifying it | 2 | "A deploy killed f" (it was a knowledge lock); the f-c1 sync stall blamed on the template (it was rescoring) |
| Framed the commission against the goal | 1, decisive | "A decision for Casey: build it…" |
| Built and approved rulers that encode a conclusion | 2 | Reader answer key "Build nothing now"; a lender judge |
| Overspent Claude | 1 | Monthly limit hit; 4–6 Opus agents at 400k–900k tokens each |
| Introduced gates that blocked everyone | 1 | The agent CLI freshness gate (#9623) blocked all pushes |

## Causes that survived prior corrections
These memory entries existed before this session and were still violated:
- [[feedback-judge-the-output-as-the-customer]]
- [[feedback-objective-is-the-signal]] (test the scorer before spend)
- [[feedback-merge-fast]]
- [[feedback-no-llm-waiting]]

Why: memory is passive. In a long session with many parallel fires, I prioritized infrastructure firefighting, and nothing forced a goal check before spend or before a status report.

The `operate` skill's "define excellent first" section sent directors to write 50–100 expectations, with a partner raising the bar. That produced an audit machine, because nothing required the bar to measure the requester's actual goal.

## Changes, highest working level first
1. **Code-level forcing functions in Lab:**
   - (a) A registration states `acceptance.design.goal` in the requester's own words. Preflight refuses one without it.
   - (b) `disco steer` prepends that goal line to every steer.
   - (c) Preflight refuses a commission whose release evaluators lack a validation receipt: a hand-written target scores above the incumbent, a degraded copy scores below, and the answer keys are free of conclusions.
   - (d) The keeper raises a stall alarm when the best score hasn't improved for 2 h.
   - (e) Every settled run's readout carries the post-mortem battery: goal fulfillment, thesis origin, effort by activity, data quality, ruler validity, fork carry-over, agent behavior, ranked causes.
2. **Release path:** a release-path ledger and scoped gates (#9766 done; ledger being built). A gate that blocks without catching a defect gets deleted.
3. **Skill text, for judgment calls only:**
   - `operate`: a goal contract, steer with the goal, and "build-for vs evaluate" framing; the engagement-spec bar is measured against the requester's goal; post-mortem battery reference.
   - `eval-engineering`: answer-key neutrality; substance over presence; validate against a hand-written target when public exemplars aren't like-for-like (Lab #1518 finding).
4. **My operating rules** (memory, already written):
   - at most 3 Opus agents;
   - small tasks on Sonnet;
   - status leads with outcome metrics (goal score, production state);
   - verify a cause before stating it.

## Unresolved
- No world-class like-for-like exemplar exists for the ruler; a private infrastructure-fund model would anchor it.
- Whether g, prepared from the post-mortem's 11 changes, actually raises the goal score is unproven until it runs.
- Production deploy of 176d104 is still refused ("kept hosts require more than one retained generation").
