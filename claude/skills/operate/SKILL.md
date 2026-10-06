---
name: operate
description: Launch, observe, intervene, resume, and settle discovery runs while the profiled system performs the research.
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

Freeze the profile, sources, acceptance criteria, development checks, bounds, and required evidence.
Keep final acceptance outside the authoring lineage.
Register whether agents choose the problem, decomposition, or team.
Verify the smallest real execution and capture path before committing substantial resources.
Distinguish source changes, published packages, installed packages, and observed live behavior.

For continuation or outside assessment, read [progress and settlement](references/progress-and-settlement.md).
For recursion, learning, artifact reuse, or recovery claims, read [mechanism evidence](references/recursive-proof.md).

## While running

1. Inspect authoritative execution state before acting.
   Silence and an old transcript do not establish that a run died.
2. Observe through maintained journals, events, and liveness queries.
   Include observation cost when comparing resource use.
3. Intervene through the installed stack's supported message or steering API.
   Preserve the request, recipient, acknowledgment, and evidence of consumption separately.
4. Attribute supplied sources, answers, and corrections to the operator.
   A queued message establishes dispatch; later trace evidence establishes use.
5. Preserve useful artifacts, tool sources, and rejected attempts outside ephemeral scratch space.
6. Apply cancellation through the supported owner and verify terminal state and remaining descendants.
   When that owner cannot respond, use its documented recovery procedure within existing authority.
7. Recover through the execution owner's maintained resume path.
   Reconcile completed work before replacing a process or starting a successor.

If the fleet is idle, report that fact and its cause.
Continue the next authorized action that advances the objective, subject to shared leases and resource limits.
Name the specific missing authority or evidence when it prevents action.

## At settlement

Read the recorded stop cause before interpreting the outcome.
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
skill-run-log /operate --target "<pursuit/campaign>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A new profile or immutable successor is needed | `/profile-authoring` | Acceptance, available capabilities, and the observed reason for change |
| A play settled | `/play-report` | Run records, artifacts, and operator contributions |
| A result or stop cause is surprising, or several runs share a failure | `/diagnose` | The run identities, raw evidence, and confirmed examples |
| A claimed execution event cannot be observed | `/ground-truth` | The missing event and actual path |
| A worker ignored state, tools, or user intent | `/agent-behavior-audit` | The trace and missed requirement |
| A mechanism comparison is ready | `/pursue` | Cases, arms, and actual resource measurements |
