# Agent work process

Read only the relevant sections; [shared defaults](../../claude/AGENTS.md) own universal rules.

## Delegation

Use existing task ownership; reconcile overlapping scope before assigning each worker a coherent set of related outcomes.
Specify ownership, interfaces, checkout, authority, resources, and completion evidence.
The integrating agent owns consumer proof and delivery.
Send updates when a decision, blocking dependency, ownership conflict, finding, or completed artifact changes another owner's next action.
Include the change, evidence pointer, and required action; use the existing task record for unchanged status.
Delegate independently useful deliverables; keep dependent fragments and routine heartbeats with their owner.
Brief the complete set of goals and expect it finished in one go: the worker designs the shape once, carries it out, merges, and proves the results. A coherent PR may solve multiple related outcomes and shared causes across consumers. Do not slice it into small PRs, line quotas per PR, "one PR at a time" or hourly check-ins.

### Brief template

Every delegated task carries this brief, and the worker's report answers it field by field.
The Safety block makes the brief the spec, so the review confirms it rather than writing it.

```text
Outcome:  <the user-visible result, in the requester's words>
Metric:   <name>: baseline <value, source, date> → target <value>
Scope:    <repo and worktree>; files you own: <...>; out of scope: <...>
Constraints, all binding:
  [ ] no force-push, no `gh pr merge --admin`, no `--no-verify`, no change to Git identity
  [ ] never print, log or paste a secret; read keys from their vault
  [ ] the repo's gate selects the full suite for prompt or chat paths and runs before a deploy, never before a merge
  [ ] no new unit or mock tests, and a unit or mock test broken by a new API is deleted, not updated; prove with integration tests and a live proof
  [ ] <this task's limits: spend, production state, who approves what>
Safety, required when the change can delete data, send bytes off a box, or change a release gate:
  Invariants:   <each law the change must keep, e.g. "no box deleted without a whole-workspace export">
  Do not undo:  <earlier decisions this change must not reverse, each with its link>
  Red first:    <each failure the change must prevent, as a test the worker shows failing before the fix>
  Review:       opens with `hold` and a comment naming the review and its owner; an independent adversarial review passes before `hold` comes off
Done when: <observable condition>, proven by <command and output, URL, receipt or SHA>
Report back:
  status:      done | partial | blocked
  outcome:     <metric before → after, with source and date>
  evidence:    <commands with exit codes, SHAs, PR URLs, receipts>
  changed:     <files and PRs>
  constraints: <each box above: kept, or what broke and when>
  open:        <what remains, its owner and the next check>
```

## Choose the checkout

Reuse the owning clone and worktree after checking origins, Git common directories, and worktree lists.
New Linux checkouts belong under ~/code; worktrees under ~/code/_wt.

## Preserve concurrent work

Check the relevant checkout's status, base, and ownership before editing; inspect history, reflog, or PRs when changes or conflicts need explanation.
Investigate unexpected edits or commits; preserve active merges, rebases, and dirty detached checkouts.
Keep mixed scope explicit when separating work.
Delete branches only after proving retention or abandonment; ignored worktree files may contain work.
Before committing, check Git identity; report a mismatch instead of changing it during the task.

## Deliver through GitHub

Fetch the PR target, verify `git merge-tree --write-tree BASE HEAD`, and resolve conflicts.
Use Conventional Commits and repository hooks; dotfiles git/install.sh owns global hooks.
Write a multi-line commit or PR message to a file and pass it with `git commit -F <file>` or `--body-file <file>`; an inline `-m` with unbalanced quotes ran message text as shell commands.

One accountable owner carries each coherent PR and all its outcomes through review, merge, release, and requested consumer proof.
After a push, read available comments, reviews, and inline threads; fix actual findings without waiting for optional automation.
Separate change defects, unrelated defects, and infrastructure failures; repair the first and track the others with their owners.
For a blocked requirement, record its owner, next action, and completion check in the existing task record.
Deleting a live path requires independent review and one live proof.
Do not push a workflow, on any branch, to qualify, capture, or prove something once; run that and paste the command and output in the PR.
A backlog finishes with every PR merged, closed, or actively owned.
Before claiming completion, check GitHub state and `git rev-list --count HEAD --not --remotes`.

## Establish evidence

Inspect the installed path and maintained sources before changing an existing environment or relying on changing APIs.
Retain exact revisions and update affected documentation rather than copying version catalogs.
Reproduce defects through the affected user or consumer path.
For performance work, use [speed evidence](../anti-patterns/speed.md).
For test selection or retirement, use the [test-value policy](../../claude/skills/simplify/SKILL.md#retire-low-value-tests).
Protect shared state; establish minimal execution and capture before expensive verification.

Record starting state, actions, outcome, persistence, revision, target, failures, and missing coverage.
Distinguish local, published, installed, and served evidence.
For visible changes, use [UI evidence](../anti-patterns/ui-evidence.md).
Unknowns remain unknown; a failed instrument requires another instrument, not an inferred success.
Investigate surprising or null results before attributing causes; a negative verdict needs a check capable of detecting improvement.
Preserve the required user experience while changing metrics.

## Report clearly

Report work state and decisions, with links to existing artifacts.
For long runs, include native execution, the last productive event, and the reason for waiting; controller liveness proves no research result.
Use `report` for substantive comparisons: scope, denominators, distributions, uncertainty, exclusions, and unequal conditions.
Separate observation, interpretation, and projection; internal proof spending is not customer revenue.
Keep unresolved decisions in one current record rather than repeated status narratives.

## Use skills and owning guidance

Discover installed skills; load the relevant guide and finish its task before following optional next-skill suggestions.
For UI, use product-design; for public writing or design, read the relevant [pattern guide](../anti-patterns/README.md).
Use [engineering writing](../green-patterns/engineering-writing.md) for PRs and issues.
Follow repository code conventions; comments explain decisions, invariants, constraints, or risks.
Default security and data integrity to fail-closed.

## Protect the host

Start unattended chains, watchers, measurements and mirrors through `unattended --name <lane> -- <command>`: CPUWeight 20 and nice 10 under interactive sessions and gates, and at most 12 per host (`UNATTENDED_MAX`). A watcher that only polls and sleeps adds `--watch` and counts against its own limit of 48 (`UNATTENDED_WATCH_MAX`), so idle watchers never queue a build, test or measurement; a watcher that builds, tests or moves data stays a job. Stopping a user service that started it, or sending SIGTERM to the wrapper, stops the command's scope too; a terminal or `setsid` start stays detached. I/O heavy jobs also carry their own limits (`rsync --bwlimit`, restic `--limit-upload`), because the hosts' disk schedulers ignore `ionice`.
Keep scratch, logs, and evidence outside repository checkouts, in `~/.local/state/agent-work/<repo>/` (`skill-run-log --dir`), the session scratch directory, or /tmp.
A checkout holds only files its next pull request commits; a main checkout stays clean and on its default branch.
For existing screenshots, check ~/.claude/image-cache/ and ~/.tmux/clipboard/images/.
Mount namespaces do not isolate underlying file operations.
Run root storage or host experiments in a throwaway VM.
This includes fsfreeze, dmsetup, real-disk LVM, mount --move, unshare --mount, mkfs, wipefs, reboot, and shutdown.
A guard refusal must be resolved through the supported path, never another shell, interpreter, executable path, or guard-disable variable.
