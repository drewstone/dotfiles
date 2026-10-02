# Agent work process

Read the sections relevant to the task.
Shared AGENTS.md retains the entry rules; this file owns detailed procedures.

## Delegation

Give each worker a substantial independent deliverable with one owner and observable completion evidence.
Define scope, interfaces, branch or worktree, authority, resource limits, and the handoff artifact.
The integrating agent owns the first consumer proof and final delivery.
Use existing Runtime records, PRs, and retained evidence for status.
Send messages when a decision, unavailable artifact, or new blocker requires an answer.
A routine heartbeat does not require another message.
Reconcile existing work before creating another lane.
Do not split one dependent change across workers merely to increase agent count.
Return the result and its proof; distinguish unfinished dependencies.
Coordination is useful only when it advances the user outcome.

## Choose the host and checkout

Use the Mac for sessions, lightweight reads, edits, and pushes; reuse one worktree per repository.
Use GTR for new worktrees, full installs, builds, type checks, tests, and retained traces.
Prefer `beelink1-wsl` and `beelink2-wsl` for full installs, builds, type checks, and test suites.
Each has 16 cores, 93 GB, the operator keyset, and gh-drew; GTR is memory- and disk-constrained.
Repositories live in ~/code there; put worktrees in ~/code/_wt.
Run Discovery research in Tangle sandboxes through the maintained CLI.
A working local CLI can submit directly.
Research must continue when the Mac or GTR disconnects.

Before cloning or creating a worktree, inspect existing checkouts on that host.
Match origin URLs, resolve Git common directories, and read worktree lists.
On GTR, inspect ~/code and existing ~/webb checkouts; reuse the owning clone.
Put genuinely new repositories under ~/code.
Directory prefixes do not establish Git ownership.

## Preserve concurrent work

At session start, inspect Git status, recent commits, reflog, and open PRs.
Investigate unexpected work before changing it.
Preserve unrelated edits.
Before a PR, check live peer sessions and assign one owner per surface.
Preserve active merges, rebases, and dirty detached checkouts.
If an edit leaves clean status, inspect the latest commit for automatic commits.
Report mixed PR scope; preserve others' work when separating changes.

- Force-push requires explicit authorization.
- Preserve uncommitted work; never reset it away.
- Run hooks; inspect and fix failures instead of using --no-verify.
- Delete branches only after proving merge or abandonment.
- Remove worktrees only with `wt-remove PATH`; ignored files can contain work.
- Preserve Git identity and omit co-authorship trailers.
  Check `git config user.email` before the first commit.
  Use global `drewstone329@gmail.com`; remove conflicting local overrides.

## Deliver through GitHub

For Drew and Tangle repositories, use `gh-drew`.
Before PR mutations or reviews, `gh-drew api user --jq .login` must return `drewstone`.
Report missing DREW_GH_TOKEN; preserve credential ownership instead of switching accounts.
SSH transport does not establish API identity.
Keep credentials isolated between organizations and personal and company environments.

Fetch the actual PR target and verify the merge with `git merge-tree --write-tree BASE HEAD`.
Resolve conflicts now.
Use Conventional Commits and the checked-in .ai-agent-hooks.mjs.
Global hooks belong to dotfiles git/install.sh.

One owner drives the PR, conflicts, review fixes, authorized merge/release, and requested consumer or live proof.
After each push, read PR comments, submitted reviews, and inline threads.
Apply user-authorized CI or review waivers immediately through a permitted delivery path.
Preserve hooks, enforced protections, release authority, and applicable findings.
Fix newer findings; earlier approval does not cover them.
Classify failures as change defects, unrelated defects, or infrastructure failures.
Fix change defects before delivery; track unrelated failures separately and continue permitted delivery.
An enforced blocking check requires an authorized resolution; a waiver alone does not override repository protection.
Additive or flagged changes can merge quickly.
Deleting a live path requires independent review and one live proof.
A backlog finishes with every PR merged, closed, or in an active lane.
Check pending results when they can change the next action; continue independent work meanwhile.
For a genuine blocker, name the failed requirement, owner, next action, and completion check.
Before claiming completion, check the PR and `git rev-list --count HEAD --not --remotes`.

## Establish evidence

Check maintained sources for changing APIs, models, commands, and deployments.
Inspect the actual installed path before changing an existing environment.
Retain exact revisions for reproducibility; avoid copied version catalogs.
Update affected documentation.

Reproduce bugs through realistic usage before fixing their cause.
Measure the actual path before changing performance or reliability.
For speed work, read [speed rules](../anti-patterns/speed.md).
Keep the numbered baseline, constraint target, deterministic counters, ratchet, and controlled rollout.
Protect shared state during boundary checks.
Before verification, choose the smallest sufficient checks and the condition that ends verification.
Reuse existing results for unchanged code, dependencies, and environment.
Rerun affected checks only when changes or failures invalidate their evidence.
After verification passes, continue delivery instead of broadening signoff.
Prove minimal execution and capture before expensive work.

Verify through the real product or consumer entrypoint.
Record starting state, actions, observed outcome, persistence, source revision, target, failures, and missing coverage.
Separate local, published, installed, and served proof.
A build hook does not prove deployment.
If logs fail, use inspectable infrastructure.

Before visible UI work and its PR, read [UI evidence](../anti-patterns/ui-evidence.md).
Retain before/after screenshots and video for changed interactions.
Open media as the reviewer; retain originals and label accelerated playback.
Keep credentials and unrelated personal data out.
Use concise execution receipts for nonvisual changes.

Keep unknowns, measurement errors, and exit status explicit.
Reconcile totals.
Separate actual customer revenue from internal proof spending.
A failed instrument needs another instrument, not an unsupported answer.
Investigate null, surprising, and unusually good results.
A negative verdict requires an isolated check capable of detecting improvement.
Repair in-scope failures and flakiness; give unrelated failures a separate follow-up.
Preserve required user experience while improving metrics.

## Report clearly

Lead with the checked answer or decision.
Use plain technical English and explain necessary terms.
Report work state, not process narration.
For long runs, include native execution, last productive event, and wait reason.
Controller liveness alone is insufficient.
Carry unresolved decisions in one place and act on them.
A correction is one clause in the current finding.

Query artifacts before analysis.
Use `report` for comparisons and deeper results.
Include scope, sources, observation units, denominators, distributions, uncertainty, exclusions, and unequal conditions.
Keep complete measured fields linked, including zeros, nulls, and gaps.
Separate observation, inferred cause, and projection.

## Use skills and owning guidance

Discover installed skills before concluding none applies.
Finish a skill before following its final “Then consider” footer; prerequisite guards are the exception.
Keep capability catalogs at their owner.

Before GTM, sales, customer, operations, or strategy work, read ~/company/CLAUDE.md and ~/company/gtm/CLAUDE.md.
Check `ops-board list` ownership.
Address named customers directly in sendable work.
For UI work, use product-design.
For public writing or design, resolve the global instructions symlink and read the relevant docs/anti-patterns guidance.
Start with blog-and-research.md, copywriting.md, product-design.md, or review-gates.md.
Inspect real references and verify visible results in the browser.
Remove redundant labels, dead panels, fake readiness, and repeated actions.
Organize research by claims and evidence.

Use active sentences, consistent terms, and Simplified Technical English.
Keep instructions within 20 words and descriptions within 25.
Put each sentence on its own Markdown line.
Create useful requested documentation.
Comments explain decisions, invariants, constraints, and risks.
TypeScript uses strict mode, single quotes, two spaces, and no semicolons unless repository conventions differ.
Default security and data integrity to fail-closed.

## Protect the host

For screenshots, check ~/.claude/image-cache/, then ~/.tmux/clipboard/images/.
Keep artifacts in the project, session scratch directory, or /tmp.
Use a container or VM for destructive filesystem experiments.
Mount namespaces do not isolate underlying file operations.

Root storage, mounts, namespaces, freezes, reboot, and shutdown never run on the host root.
Use `hostlab run -- '<command>'` in the throwaway VM.
This includes fsfreeze, dmsetup, real-disk LVM, mount --move, unshare --mount, mkfs, and wipefs.
The VM supplies root, lvm2, dm-thin, xfs, scratch disk /dev/vdb, and the caller's directory at /work.
Treat host-blast-guard or wrapper refusal as policy.
Never bypass it with sh -c, env, python, absolute executable paths, or HOST_BLAST_GUARD=off.

