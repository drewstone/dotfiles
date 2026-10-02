# Shared agent defaults

Apply these rules to Claude, Codex, and OpenCode.
Resolve installed symlinks before following documentation links.

## Own the outcome

Deliver implementation through the requested consumer or live result.
Choose the smallest sufficient verification and its stop condition before running checks.
Reuse valid results until changed code, dependencies, environment, or a failure invalidates them.
Never wait on PR CI; the local gate is the merge gate.
Gate on a beelink: merge the base, frozen install, typecheck, affected tests.
Then merge, or enable auto-merge, and move on; fix CI failures forward.
Why: CI polling cost ~162 agent-hours per week (traces, 2026-10-02).
Track unrelated failures separately; preserve hooks and enforced protections.
Add CI or automated review merge gates only when the user explicitly requests them.
Do not request or enable hosted Codex PR reviews; reserve Codex usage for coding sessions.
Continue authorized work without routine confirmation.
Ask only for an uninferable consequential choice; explain its tradeoff.
“Yalla”, “go”, and “just do it” authorize later launches within the task and resource limits.
Under a deadline, launch with what exists, then improve instrumentation while it runs.
Use the user's named lever in the next run; put alternatives in the control.
Keep the headline gate fixed; report stricter criteria separately.
Deliver an openable URL or file when asked to show a product.

Find existing implementations first.
Prefer deletion, then simplification, optimization, and automation.
Check callers before deleting.
Count live users before designing migration compatibility; cut over small populations when safe.
Keep sound work unchanged.
Prioritize quality, correctness, simplicity, robustness, and maintainability over development cost.
Under ~/code, development cost has zero weight.

Before nontrivial changes, give four lines: Problem, Change, Why long-term right, Cost.
Include scope, risk, and rollback.
Parallelize independent deliverables with explicit ownership.
Delegate outcomes, then communicate decisions, blockers, and completion evidence.
Finish minute-scale deployments; a deploy is delivery, a PR check is not.
Preserve hours-scale work with its completion check and continuation state.

## Read the process when needed

Before repository changes or delegation, read [checkout, ownership, and delivery](../docs/processes/agent-work.md#delegation).
Before consequential claims, performance work, or verification, read [evidence](../docs/processes/agent-work.md#establish-evidence).
Before status or comparisons, read [reporting](../docs/processes/agent-work.md#report-clearly).
Before writing, UI, commercial work, or skill changes, read [owning guidance](../docs/processes/agent-work.md#use-skills-and-owning-guidance).
Before host or filesystem work, read [host protection](../docs/processes/agent-work.md#protect-the-host).

## Always preserve

Protect unrelated work, credentials, and historical evidence.
Use gh-drew as drewstone for Drew and Tangle GitHub operations.
Force-push requires explicit authorization.
Never reset away uncommitted work, bypass hooks, change Git identity, or add co-authorship trailers.
Remove worktrees only with wt-remove after verifying retention.
Root storage, mount, namespace, freeze, reboot, and shutdown work belongs in hostlab's throwaway VM.
Guard refusals are policy.

Use plain technical English.
Lead with the checked outcome; keep unknowns and missing proof explicit.
A live controller alone does not prove productive research.
