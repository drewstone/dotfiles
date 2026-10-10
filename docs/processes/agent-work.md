# Agent work process

Read only the relevant sections; [shared defaults](../../claude/AGENTS.md) own universal rules.

## Delegation

Use existing task ownership; reconcile overlapping scope before assigning one independent outcome per worker.
Specify ownership, interfaces, checkout, authority, resources, and completion evidence.
The integrating agent owns consumer proof and delivery.
Send updates when a decision, blocking dependency, ownership conflict, finding, or completed artifact changes another owner's next action.
Include the change, evidence pointer, and required action; use the existing task record for unchanged status.
Delegate independently useful deliverables; keep dependent fragments and routine heartbeats with their owner.

### Brief template

Every delegated task carries this brief, and the worker's report answers it field by field.
Early briefs without the constraints led to a force-push, an `--admin` merge, keys printed into a session, builds that overloaded the Mac, and an affected-tests gate that turned master red.

```text
Outcome:  <the user-visible result, in the requester's words>
Metric:   <name>: baseline <value, source, date> → target <value>
Scope:    <repo and worktree>; files you own: <...>; out of scope: <...>
Constraints, all binding:
  [ ] no force-push, no `gh pr merge --admin`, no `--no-verify`, no change to Git identity
  [ ] no installs, builds or test suites on the Mac; run them on a Beelink or gtr
  [ ] never print, log or paste a secret; read keys from their vault
  [ ] a chat or prompt change runs the full suite before merge, not only affected tests
  [ ] <this task's limits: spend, production state, who approves what>
Done when: <observable condition>, proven by <command and output, URL, receipt or SHA>
Report back:
  status:      done | partial | blocked
  outcome:     <metric before → after, with source and date>
  evidence:    <commands with exit codes, SHAs, PR URLs, receipts>
  changed:     <files and PRs>
  constraints: <each box above: kept, or what broke and when>
  open:        <what remains, its owner and the next check>
```

## Choose the host and checkout

Use the Mac for lightweight work and pushes; prefer beelink1-wsl or beelink2-wsl for full installs, builds, types, and tests.
Reuse the owning clone and worktree after checking origins, Git common directories, and worktree lists.
New Linux checkouts belong under ~/code; worktrees under ~/code/_wt.
GTR is resource-constrained; inspect its existing ~/code and ~/webb checkouts before adding work.
Run Discovery research through the maintained CLI in Tangle sandboxes so it survives workstation disconnects.

From GTR, gate an executable revision with `beelink-gate beelink2 <repo-url> <full-sha> -- <command> [args...]` after the revision is pushed. Run the repo's typecheck and affected tests in that command; the gate itself fetches the SHA with complete history, refreshes `origin/` refs for the remote default branch, `main` or `develop`, and any branch whose remote head matches the SHA, checks out the requested SHA detached, and runs `pnpm install --frozen-lockfile` or `npm ci` against the beelink's shared store before the command. For dependency-free documentation checks, use `beelink-gate --no-install beelink2 <repo-url> <full-sha> -- <command> [args...]` to verify the SHA and run the check without an install. It streams output and prints a SHA, command, exit-code, and duration receipt. The gate owns one locked cache checkout per repo under `~/.cache/beelink-gate/` on that beelink, so concurrent lanes for the same repo wait their turn. Existing partial caches are rebuilt once under their repo locks. Its 40 GiB total cache cap evicts the least recently used idle checkout; keep proof and other retained files outside that cache. It refuses to start below 100 GiB free on beelink1 or 162 GiB on beelink2. It also reads the host's Windows Update policy and refuses new starts from 60 minutes before its scheduled local update until 30 minutes after, reporting the next allowed time; gates already running continue. Do not create a beelink worktree for this gate or use a beelink's main checkout. A dependency-free package with no lockfile skips installation; a package with dependencies and no pnpm/npm lockfile fails the gate.

## Preserve concurrent work

Check the relevant checkout's status, base, and ownership before editing; inspect history, reflog, or PRs when changes or conflicts need explanation.
Investigate unexpected edits or commits; preserve active merges, rebases, and dirty detached checkouts.
Keep mixed scope explicit when separating work.
Delete branches only after proving retention or abandonment; ignored worktree files may contain work.
Before committing, check Git identity; report a mismatch instead of changing it during the task.

## Deliver through GitHub

Before mutations, `gh-drew api user --jq .login` must return `drewstone`.
Missing DREW_GH_TOKEN requires restoring its owner, not switching accounts; SSH transport does not establish API identity.
Fetch the PR target, verify `git merge-tree --write-tree BASE HEAD`, and resolve conflicts.
Use Conventional Commits and repository hooks; dotfiles git/install.sh owns global hooks.
Use the [shared merge gate](../../claude/AGENTS.md#own-the-outcome); apply authorized waivers through the permitted path.

One owner carries the PR through review, merge, release, and requested consumer proof.
After a push, read available comments, reviews, and inline threads; fix actual findings without waiting for optional automation.
Separate change defects, unrelated defects, and infrastructure failures; repair the first and track the others with their owners.
For a blocked requirement, record its owner, next action, and completion check in the existing task record.
Deleting a live path requires independent review and one live proof.
Private-repo workflows run only on the beelink self-hosted runners; `ubuntu-latest`, `macos-*`, and `windows-*` bill per minute there and are retired.
A private repo's only exception is an npm trusted-publish job, which npm accepts only from GitHub-hosted runners: it starts only when a version is actually published.
Public tangle-network repos run on GitHub-hosted runners, which are free for public repos.
Do not push a workflow, on any branch, to qualify, capture, or prove something once; run that on a beelink and paste the command and output in the PR.
The runner contract (labels, no sudo, installed tools, rootless Docker) is in tangle-devops `tangle/inventory/infrastructure.md`.
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
Before GTM, sales, customer, operations, or strategy work, read ~/company/CLAUDE.md and ~/company/gtm/CLAUDE.md; check `ops-board list` ownership.
For UI, use product-design; for public writing or design, read the relevant [pattern guide](../anti-patterns/README.md).
Use [engineering writing](../green-patterns/engineering-writing.md) for PRs and issues.
Follow repository code conventions; comments explain decisions, invariants, constraints, or risks.
Default security and data integrity to fail-closed.

## Protect the host

Keep scratch, logs, and evidence outside repository checkouts, in `~/.local/state/agent-work/<repo>/` (`skill-run-log --dir`), the session scratch directory, or /tmp.
A checkout holds only files its next pull request commits; a main checkout stays clean and on its default branch.
For existing screenshots, check ~/.claude/image-cache/ and ~/.tmux/clipboard/images/.
Mount namespaces do not isolate underlying file operations.
Run root storage or host experiments through `hostlab run -- '<command>'` in its throwaway VM.
This includes fsfreeze, dmsetup, real-disk LVM, mount --move, unshare --mount, mkfs, wipefs, reboot, and shutdown.
The VM provides scratch disk /dev/vdb and the caller's directory at /work.
A guard refusal must be resolved through the supported path, never another shell, interpreter, executable path, or guard-disable variable.
