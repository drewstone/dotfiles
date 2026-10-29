---
name: operate
description: Use for any `disco` command on a Discovery run: write and press a play, watch, steer, cancel, resume, or settle it while the run's agents do the research.
---

# Operate

Operate from outside the run while its profiled agents perform the research.
A director operates its own descendants within delegated authority.
Keep operator contributions, agent discoveries, and outside assessments attributable.

## Before launch or resume

Read the active objective, existing runs, authority, available resources, and the installed execution contract.
Honor standing authorization for later launches within the same task and resource limits.
Reconcile an uncertain launch acknowledgment before issuing another launch.
Assign one operator to each shared launch surface.

A play's `roots:` and `search:` set its starting team, and each root reshapes its own team, depth and child profiles.
Write plays; never wrap them in a factorial grid or a campaign of arms you designed.
When Drew asks for more experiments without naming what they should answer, ask him what he wants to learn before writing any.

Press only with `disco`, which runs the service checkout that `disco-lab-deploy.timer` keeps on origin/master; never press from a worktree, a deploy copy or a press script.
When the run depends on a recent fix, confirm that checkout contains it before pressing (`git merge-base --is-ancestor <fix> HEAD` in the `DISCO_LAB` checkout named by the host's `~/.config/fleet/lab.env`).

Freeze the profile, sources, acceptance criteria, development checks, bounds, and required evidence.
Keep final acceptance outside the authoring lineage.
Register whether agents choose the problem, decomposition, or team.
Verify the smallest real execution and capture path before committing substantial resources.
Distinguish source changes, published packages, installed packages, and observed live behavior.

For continuation or outside assessment, read [progress and settlement](references/progress-and-settlement.md).
For recursion, learning, artifact reuse, or recovery claims, read [mechanism evidence](references/recursive-proof.md).

## Commissions: the goal contract

Before the brief, restate the requester's goal in their own words and register it (Discovery Lab: `acceptance.design.goal`, which preflight requires).
Decide whether it asks the team to build or produce something for the requester, or to evaluate whether to; the brief, checks and team keep that mandate, and the brief adds no premise or conclusion the goal does not state.
The condition to proceed: the goal line is registered and the brief's first paragraph asks for what it asks.

For a customer deliverable (a report, model or plan), the first milestone is the engagement spec: the directors, as the expert team for the domain, write the checkable expectations, the deliverable spec and a workplan.
An independent engagement partner on a current model raises that bar against named exemplars and drops every expectation that does not serve the goal; part of its additions stay held out.
Score the release against the compiled bar, measured against the goal, never against hygiene alone (present, reproduces, calculates).
Prove the evaluator set before the press: a hand-written target must outscore the incumbent and a degraded copy of it must score below ([eval-engineering](../eval-engineering/SKILL.md)).
Start from the class's best template and save the finished list with its grades as the next version.

## While running

1. Inspect authoritative execution state before acting.
   Silence and an old transcript do not establish that a run died.
2. Observe through maintained journals, events, and liveness queries.
   Include observation cost when comparing resource use.
3. Intervene through the installed stack's supported message or steering API, each steer opening with the goal line (`disco steer` adds it).
   Before sending a steer, write the change you expect in the next scored version, and score it when that version lands.
   Steer from the requester's view; never name what a held-out check tests (`disco steer` warns when a steer does).
   Preserve the request, recipient, acknowledgment, and evidence of consumption separately.
4. Attribute the requester's sources, answers, and corrections to the operator; research the run needs is the run's own work.
   A queued message establishes dispatch; later trace evidence establishes use.
5. Preserve useful artifacts, tool sources, and rejected attempts outside ephemeral scratch space.
6. Apply cancellation through the supported owner and verify terminal state and remaining descendants.
   When that owner cannot respond, use its documented recovery procedure within existing authority.
7. Recover through the execution owner's maintained resume path.
   Reconcile completed work before replacing a process or starting a successor.

When a play's check passes, the run is done: cancel it yourself (`disco cancel <runId> --reason solved`) unless Drew set a target beyond the check; nothing cancels it for you, and never spend its remaining hours.
When the best release tag has been flat for two hours, diagnose before steering: read the later tags' failing checks and the agents' recent work against the goal, then name the blocker.
Report the goal score and the best tag's checks against the bar.
A lead tick measures from execution records, not lane STATUS, and reports each open problem with its owner and the time since its first alarm.

If the fleet is idle, report that fact and its cause.
Continue the next authorized action that advances the objective, subject to shared leases and resource limits.
Name the specific missing authority or evidence when it prevents action; remove a failing dependency before asking anyone for money or access.
A failure that stops the product or a run is an incident: run it with [incident command](../tangle-ops/SKILL.md#run-an-incident).

## Before the deadline

Keep every version: each write a commit by its worker with trace trailers, each release candidate a tag scored by a frozen, pre-registered evaluator set in a fixed order (exact checks, held-out checks, coverage of a commission's expectations, open referee blockers, judges).
Send the root the release convention and the T−4h freeze, T−2h assembly and T−1h final-referee notes through the steering API (Discovery Lab: `disco wrapup`, `disco steer`).
At the deadline without an accepted result, turn in the best-scoring tag, not the latest; label it a deadline release, never success, and flag any tag that regressed or rose only on judges.

## At settlement

Read the recorded stop cause before interpreting the outcome.
When plays settle with no winner, or several runs fail alike, trace one run end to end before changing prompts, models or plays: did the root read its inputs, did its workers complete turns, did its steers reach them, did the check run, and what did it print.
Fix the first broken link at its owner, then press the contract canary (`disco run plays/canary-contract.md`) to prove the chain again.
Read the goal battery that opens the run's readout (the [Terraform post-mortem](https://gist.github.com/drewstone/f911d5be50cf492093a49c75863f8d8d) questions: goal fulfillment, thesis origin, effort, data quality, ruler validity, fork carry-over, agent behavior, ranked causes) before reporting.
For a flagship play, or when Drew asks how a run is really doing, run the Lab's [deep review](https://github.com/tangle-network/discovery-lab/blob/master/skills/deep-review/SKILL.md): the product on an absolute bar, the rulers, the traces, the system and operator, and the arms, in one ranked page with an owner for each change.
Separate execution settlement, measured research progress, and final acceptance.
A bounded run can end while its broader objective remains active.
Preserve its immutable record and carry checked work into an authorized successor.
Keep success, resource limits, cancellation, and evidenced dead ends distinct.

Commission acceptance outside the claim's authoring lineage.
Report partial artifacts, failed attempts, missing evidence, and resource differences beside the verdict.
Credit mechanisms only when their required events occurred.
A mechanism's execution alone establishes no quality advantage.
Hand over useful artifacts with their assessment status attached.

For the failures behind these distinctions, read the [continuation postmortem](references/2026-09-29-continuation.md).

## Log the run

```bash
skill-run-log /operate --target "<run or play>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A new profile or immutable successor is needed | `/profile-authoring` | Acceptance, available capabilities, and the observed reason for change |
| A play settled | `/report` | Run records, artifacts, and operator contributions |
| A result or stop cause is surprising, or several runs share a failure | `/diagnose` | The run identities, raw evidence, and confirmed examples |
| A claimed execution event cannot be observed | `/ground-truth` | The missing event and actual path |
| A worker ignored state, tools, or user intent | `/agent-behavior-audit` | The trace and missed requirement |
| A mechanism comparison is ready | `/pursue` | Cases, arms, and actual resource measurements |
