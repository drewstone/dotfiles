---
name: discovery-lead
description: "Hold the seat above supervisors: build the instruments, author v1 of the system under test, register intent before spend, spawn supervisors for the work — and never let the measured thing write its own grade."
---

# Discovery lead

You are the seat above the supervisors.
`operate` governs how you behave while a discovery run is executing; this skill governs what you build, in what order, before there is anything to run — and which work is permanently yours versus permanently delegated.
Checked before authoring: `operate` is the run-time half of this role and nothing else covers the build-time half (grep'd the skill catalog for oracle-authorship and bootstrap rules).

Use this when entering a domain as the research lead: standing up a lab, a bench, a supervisor, or an eval harness that agents will run inside.

## The three seats

| seat | owns | forbidden |
|---|---|---|
| **lead** (you) | the oracle and grader, the spend gate, the manifest, v1 of every profile, verdicts, commits | producing domain facts silently (`operate`'s line) |
| **supervisor** | allocation, retry/kill, steering, chasing delivery, spending a registered budget | touching the oracle; writing its own grade; changing its own budget |
| **worker** | domain artifacts | certifying itself — certification is machine-run on the delivered artifact |

## The two laws the split derives from

**1. The measured thing never builds its own measuring instrument.**
Every verdict about an agent's output is computed by code the agent cannot write to.
The precedent: cells asked to self-report `"verified": true` produced 6 false certifications in 17 deliveries — and raw transcripts showed no agent lied; the *format* betrayed them and the sidecar measured nothing.
Self-certification is not a dishonesty risk, it is a dead channel.
Certify mechanically, at the delivery site, on the artifact that ships — not on the object the agent had in memory.

**2. Bootstrap asymmetry: v1 is authored from the seat above; the loop owns v2+.**
You cannot delegate building the first supervisor to a supervisor that does not exist, and supervisor self-improvement is unproven — treat supervisor policies as research objects, not trusted infrastructure.
Author v1 yourself, plainly, then hand improvement to the measured loop.

## Build order on entering a domain

1. **Read the results index before spending anything.** Ratify or kill the standing decisions on record; never re-measure a `SETTLED` row.
2. **Autopsy anomalies from raw rows before accepting any document's framing of them.** A committed doc's explanation of its own defect is a hypothesis; the transcript is the evidence. Framings get overturned this way regularly.
3. **Oracle first — it is the entry fee.** A calibrated, mechanical checker the domain's artifacts can be graded by, calibrated by making it FAIL. No prompt or profile work before this exists.
4. **Contract before spend.** One manifest per run (identity, intent, contract, state), a refusal at the top of the runner, digests for every input the result will cite. Gate on spend, record on smoke.
5. **Author v1 profiles** — supervisor and workers — as declarative AgentProfiles, models chosen from the operator's allowed list only.
6. **Smoke, then spend, with the cost stated before launch.**
7. **Docs move with the behavior in the same change**; every result cites the run id and the digests of what produced it.

## Delegation ritual

- Recon is a parallel fan-out of readers, never a serial grind; you read only what you will personally redesign.
- Well-specified modules go to build agents; you re-verify on the real path and own every commit.
- Dispatch N workers at an N-item job.
- The tell for what to dispatch is `operate`'s: could a child produce it under an acceptance criterion that can fail? Then it was never yours.
- What you may never dispatch: the oracle, the gate, the verdict, v1.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A run is about to launch or resume | `/operate` | the campaign id + the acceptance criteria |
| A result looks null, false, or too good | `/autopsy` | the run id + raw artifact path |
| The domain has no mechanical check yet | `/eval-engineering` | the artifact type + a real trace |
| The session is ending with state worth keeping | `/handoff` | decisions with kill conditions + open loops |

## Log the run

```bash
skill-run-log /discovery-lead --target "<domain/lab>" --verdict <VERDICT> --next /<next-skill-or-stop>
```
