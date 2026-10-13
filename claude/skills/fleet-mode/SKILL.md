---
name: fleet-mode
description: Lead fleet dispatch and autopilot through bounded production outcomes, existing owners, verified merges, and consumer proof. Use for fleet dispatch, autopilot, mass shipping, or "turn it up".
---

# Fleet mode

Own delivery. Pursue the simplest maintainable production result with urgency and principal-engineer judgment. Finish authorized work through its consumer, remove causes, and make the next operator's job smaller.

Follow [shared defaults](../../AGENTS.md) and the relevant [work process](../../../docs/processes/agent-work.md). Urgency changes prioritization, never authorization, verification, hooks, branch protection, or release authority.

## Choose the outcome

1. Read `ops-board list` and current Fleet state. Reuse existing owners, sessions, checkpoints, and claims. Reconcile overlapping work before dispatch.
2. Name one consumer outcome, its measured baseline, acceptance target, resource limits, and finite stop condition. State Problem, Change, Why long-term right, and Cost before nontrivial changes, including risk and rollback.
3. Find the existing owner and caller. Prefer deletion and simplification, then reuse and optimization, before automation. Concentrate complex decisions behind a small interface; prove required behavior through its actual callers. Count live consumers before retaining compatibility.
4. Choose the smallest change that completes the outcome. Include cleanup needed for correctness or maintainability; retain unrelated improvements as owned follow-ups. A large PR is justified by inseparable behavior, never ambition alone.
5. Parallelize independently deliverable outcomes, one owner each. Keep dependent fragments with their owner. Use the product that owns the work: Discovery research goes through `disco run`; agent-app work goes through `agent-ask`.

Do not ask Drew for observable facts. Run the deciding check. Continue reversible work within existing authorization. Ask only for an uninferable consequential choice and explain its tradeoff. External messages, production changes, credential rotation, destructive actions, pricing changes, public statements, and new spend need authorization for that action; retain authorization already given in the session.

## Dispatch and continue

Use maintained Fleet commands and their current help, not raw terminal injection. Read `fleet send --help` before sending and `fleet messages --help` before inspecting delivery.

Every brief names the board item, owner, checkout, files owned, interfaces, concrete done condition, evidence required, and resource limits. Include the binding work-process constraints. Name existing assets and forbid unapproved purchases or provisioning. Assign one creator when a new asset is authorized.

Send through `fleet send`. Distinguish accepted delivery from actual consumption and execution using Fleet receipts and the recipient's evidence. An idle pane does not prove rate limiting. Diagnose recorded account, delivery, or harness state before retrying or moving work.

Continue the existing conversation with its checkpoint and later directives. Use maintained recovery or handoff when necessary. Replace a session only when its state cannot be recovered; retain its transcript, task ownership, and exact next action before starting the replacement. Never create a second owner to escape a slow dependency.

Choose the least costly supported subscription lane capable of the task. Use current model policy and availability, not a fixed model catalog. Escalate only when an observed failure demands additional capability. Standing work uses subscription surfaces, then the Router free test lane; queue, fail, or degrade on exhausted quota. Per-token overflow requires Drew's explicit approval for that use. Check account quota before changing models after quota or payment errors.

## Integrate and merge

1. Work only on the requested outcome's PRs. Read each PR's named preconditions, current base, head, and ownership. Keep it draft while any precondition remains unmet.
2. Merge the current base into the branch. For executable changes, pass frozen install, typecheck, and affected tests on a Beelink at the exact final head using the maintained gate. Apply stronger owning checks when required, including full suites for chat or prompt changes. Documentation-only changes use relevant content, link, and structural checks.
3. Match the receipt to that head and base. A queued, unavailable, refused, stale, or failed gate grants no merge authority. Preserve the pending work and finish independent delivery while the gate's maintained waiter handles admission.
4. When local checks and all named preconditions pass, mark ready and merge or enable auto-merge immediately through `gh-drew` as `drewstone`. Preserve enforced protections, hooks, and release authority. Never use admin merge, force-push, or hook bypass to make progress.
5. Never watch PR CI. Diagnose failures and fix forward through the existing enforced process. Add CI or automated review gates only when requested.
6. Deliver through the authorized deploy path. Prove the served revision and requested consumer outcome, with a screen recording for visible flows. A merge or package publication alone is not delivery.

Conflicts stay with the branch's owner, who merges the current base and pushes normally. Do not make every open draft ready or merge unrelated PRs as a batch.

## Measure and stop

Check outcome measures against the target before reporting progress. Commits, tags, agents started, messages accepted, and passing gates on incomplete runs are activity. A run that never completes cannot satisfy its success gates.

Build useful manual measurements into the owner's live instrument in the same session. Keep scripts as reference evidence. Diagnose causes instead of rerunning unchanged failures; reuse passed proof until changed inputs or a failure invalidate it.

Scripts or timers wait with an explicit stop condition. Agents perform work. When a watcher exits while work is still live, re-arm it before ending the turn and record unwatched gaps in minutes. Keep one checkpoint in the existing task with outcome, owner, next action, acceptance evidence, and blocker.

Settle when acceptance and consumer proof pass. Stop further dispatch and spending for that outcome. A stricter quality climb needs a separately declared target and budget; retain unrelated follow-ups on the board rather than expanding the finished job.

## Simplify retained work

Close board items only when their done criteria pass or their premise is explicitly retired. Close PRs with a recorded reason and retained useful work, never by age alone. Remove worktrees only through `wt-remove` after verifying retention. Retire production resources only through their platform's authorized retire path.

Audit recurring jobs for overlap and remove obsolete automation through its owner. Keep secrets and personal details out of dispatches, logs, artifacts, and public repositories. For nested remote commands or secret loading, use a script file and the vault rather than multiple inline quoting layers.

Write dispatches and reports in plain technical English. Name the consumer result first, attach evidence to claims, and state unknowns. Cut sentences that change no decision.

## Log the run

```bash
skill-run-log /fleet-mode --target "<owned outcome>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /stop
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The completed outcome needs a durable follow-up | `/session-continuity` | Existing checkpoint, evidence, owner, and next completion check |
| A repeated operator failure needs a higher-level correction | `/reflect` | Drew's words, observed behavior, and directing instruction |
