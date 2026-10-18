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
  [ ] no new unit or mock tests, and a unit or mock test broken by a new API is deleted, not updated; prove with integration tests and a live proof
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

Gate a pushed revision from any host, including the Mac, GTR or either beelink, so a lost GTR stops nothing. A repo with `scripts/ship.sh` gates with `beelink-gate --ship auto <repo-url> <full-sha>`, which runs exactly the release's `scripts/ship.sh verify` (full lint, peer floors, design drift, typecheck, tests, build and bundle check) with the repo's `.nvmrc` Node, so a green gate cannot fail the deploy's verify. Other repos use `beelink-gate auto <repo-url> <full-sha> -- <command> [args...]` with their typecheck and affected tests. `auto` runs on whichever beelink is free for that repo, preferring a warm cache, and waits for the first to free when both are busy; name `beelink1` or `beelink2` to pin a host. Any spelling of a repo's URL (https or `git@`, with or without `.git`) uses the same cache, which keeps fetching with the origin it was created with; a different repo at that path is refused. Each gate holds its lock for at most `BEELINK_GATE_MAX_HOLD` (default 45m). The gate prints a gate ID before submission to the Beelink user manager. If the launcher or SSH connection dies, the submitted gate keeps running within the same hold budget; `beelink-gate --attach <gate-id>` replays its output and returns its recorded exit code. Completed reconnect logs are kept for 24 hours; the receipt remains in `receipts.jsonl`. A waiter still names the checkout holder. Receipts print host, wait and duration, and append to `~/.local/state/beelink-gate/receipts.jsonl` on the beelink. For the other commands, the gate itself fetches the SHA with complete history, refreshes `origin/` refs for the remote default branch, `main` or `develop`, and any branch whose remote head matches the SHA, checks out the requested SHA detached (or, with `--branch <name>`, that branch at the SHA with `origin/<name>` as upstream, refusing unless origin's branch is at the SHA; ADC's `pnpm signoff` needs this), and runs `pnpm install --frozen-lockfile` or `npm ci` against the beelink's shared store before the command. Every gate installs and runs with the repo's `.nvmrc` Node when it has one, and a login shell in the command keeps it. A `.nvmrc` that the host's nvm cannot honor refuses the gate. Before the command, the gate rebuilds any native addon the gate's Node cannot load: one built for another ABI, or one the repo allows to build that has no `.node` file. Its build output is unlinked first, so the store's shared copy is untouched. An addon still stale after the rebuild fails the gate. The receipt records `node` and `rebuild`. For dependency-free documentation checks, use `beelink-gate --no-install beelink2 <repo-url> <full-sha> -- <command> [args...]` to verify the SHA and run the check without an install. It streams output and prints a SHA, command, exit-code, and duration receipt. The gate owns one locked cache checkout per repo under `~/.cache/beelink-gate/` on that beelink, so concurrent lanes for the same repo wait their turn. Existing partial caches are rebuilt once under their repo locks. Its 40 GiB total cache cap evicts the least recently used idle checkout; keep proof and other retained files outside that cache. A repo keeps tracked paths its gated commands never read out of its gate checkouts by committing `.beelink-gate/sparse-checkout` (`git sparse-checkout --no-cone` patterns, `#` comments; a commit without the file or its patterns gets a full checkout); Discovery Lab's excludes `/pursuits/`. The gate sets the patterns under the repo lock before checkout, and applies them to idle checkouts whenever it prunes the cache, before any eviction, reading the file at each checkout's HEAD; the prune only shrinks a checkout, and only a gate's checkout of a commit without patterns restores the full tree. The receipt records `sparse=repo`. Rust builds default to `CARGO_TARGET_DIR` inside the checkout's `.git/beelink-gate-target` and `CARGO_INCREMENTAL=0`, so the cap counts and evicts their output; a command that sets its own target dir keeps it. After each gate, cargo target dirs at `~/.cache/<repo>-build` (marked by `CACHEDIR.TAG`) lose entries untouched for 24 hours, skipped while a `<repo>` gate or a cargo build holds its lock. At most 6 gates run per host (`BEELINK_GATE_MAX_CONCURRENT`, forwarded from the caller); a gate takes a slot after its repo lock and prints while it waits. A gate starts only while the CPU pressure its own tasks feel (`some avg10` of its top-level cgroup, `/sys/fs/cgroup/non-systemd/cpu.pressure` for a gate over SSH into WSL; else `/proc/pressure/cpu`) is at most `BEELINK_GATE_MAX_CPU_PRESSURE`, else `max_cpu_pressure=` in the beelink's `~/.config/beelink-gate/limits` (re-read at every admission check, so waiting gates pick up a change), else 20% (twice that for a light gate); where that file is missing, the limit is a 1-minute load of 1.5x its cores. Receipts record both the pressure and the load. A gate that has waited `BEELINK_GATE_STARVE_AFTER` (default 10m, counted across re-placements) is admitted on the host `auto` chose, over the limit, with `SHIP_MAX_WORKERS` halved and `starved=1` in its receipt. On the Beelinks, `host/install.sh --gate-priority-only` gives CI runner jobs (`ci.slice`) CPU weight 25 and creates a weight-400 `beelink-gate` cgroup that admitted gates move into; rollback lines are in `host/cgroup/`. For iterative "does it pass yet" runs (affected tests), use `beelink-gate --dev`: its own checkout and slots, a weight-25 cgroup and no starvation backstop, so merge gates go first; gate the final head without it. `beelink-gate --report [hours]` prints gate runs per merged PR by repo, with modes, exit classes and exact-input repeats. It waits up to `BEELINK_GATE_LOAD_WAIT` (default 30m) with the reason printed, then refuses. `auto` prefers a beelink under that limit, and a named beelink over it hands the gate to the other when that one is under its own limit. For host-specific hardware such as KVM, add `--pin-host` with a named Beelink. It prevents handoff while preserving every admission limit; `--pin-host auto` is refused. It refuses to start below 100 GiB free on beelink1 or 162 GiB on beelink2. It also reads the host's Windows Update policy and refuses new starts from 60 minutes before its scheduled local update until 30 minutes after, reporting the next allowed time; gates already running continue. Every refusal, and a preempted or inconclusive preview, exits 75 (EX_TEMPFAIL) with a last line `beelink-gate: TEMPFAIL next_allowed=<UTC> <reason>`; a caller asks again at that time and never records a 75 as red. A small check (no dependency install, no browser, at most 120 core-seconds of CPU) runs as `beelink-gate --light …`: it is admitted up to 2.5x the cores, has its own host slots and `<repo>@light` checkout, and fails loudly if it uses more CPU than it declared (`BEELINK_GATE_LIGHT_CPU`). `auto` gives back a host that has not admitted a gate within 60 s and places it again on whichever host admits first; `--urgent` puts a fix for a red default branch ahead of every waiting gate for the next free checkout. Do not create a beelink worktree for this gate or use a beelink's main checkout. A dependency-free package with no lockfile skips installation; a package with dependencies and no pnpm/npm lockfile fails the gate. A step ends with its command: every process it started, even one that detached with `setsid`, is stopped when the step returns, and the receipt counts them as `reaped`. Commits a command made that reach no remote are saved to a bundle under `~/.local/state/beelink-gate/bundles/` before the checkout goes to the next gate, and the receipt names it as `bundle`. No gate, urgent or starving included, is admitted while the host-wide CPU pressure (some avg60) is over its ceiling (default 40, `host_pressure_ceiling=` in the limits file); an `auto` gate that finds its host below the disk floor gives the host back and is placed again.

Gate JSON receipts include the fetched default-branch tip as `base_sha`, `pr_number` when the caller sets `BEELINK_GATE_PR`, and `lane` from `FLEET_LANE` or `FLEET_STATUS_FILE`. Set `BEELINK_GATE_PR=<number>` for a PR gate; a commit SHA alone may belong to several PRs, so the gate does not guess. Invalid PR numbers are refused before contacting a host. Their `reason` describes the previous matching run among the last 10,000 receipts on that host: `first`, `different_command`, `after_red`, `after_green`, or `after_base_move` (same head and command after a green run with a different base). A missing prior base is `after_green_base_unknown`. `beelink-gate --report` recomputes those reasons across both hosts and prints metadata coverage. It counts a renamed repo under the name GitHub resolves. A host whose receipts stay unreadable after one retry marks the report `PARTIAL` and exits 75, so a scheduled reader never takes one host's counts for both. A missing PR or lane stays null rather than being guessed.

To land an agent-container PR, push it and stop: `merge-on-green` on drew-gtr-pro merges it once Fast Checks, Build and Type Check are green on its head (see [tools README](../../claude/tools/README.md#merge-on-green)). Develop runs the full test fan after merge; fix a red develop forward.

An `auto` gate reserves its normal FIFO place on both Beelinks before probing. The reservation stays while it re-places and is handed to the submitted gate's ticket, so a new gate cannot take the first checkout that frees during a probe gap. The submitted gate's ticket takes the reservation's epoch, found by its token, and a gate's place is the oldest (epoch, pid) among its tickets, so an auto gate and a newer gate never wait for each other. Urgent gates keep their priority markers. Admission still observes the host disk, CPU and slot limits.

When a gate does not run, submit it once more at most, and only as the gate says:
- Exit 75 (`TEMPFAIL next_allowed=<UTC>`): ask once at that time, or pass `--retry <minutes>` and let the gate wait. A shell loop of resubmissions is never the answer.
- A launch that cannot reach a host (SSH exit 255, a banner timeout, an empty log) is a host outage, not admission. Stop submitting until the operator announces the hosts are back. Use `beelink-gate --attach <gate-id>` for a gate that already has an ID.
- Run the gate in the background with its output unfiltered. Never wrap it in `timeout` or pipe it through `tail`: on 2026-10-18 that pairing killed a queued gate and dropped its whole log.
- Report each refusal once to `gtr-disk` with `fleet send`, giving the gate ID, host, exit code and reason line, then do other work. Do not retry `wt-remove` or a main-checkout lock yourself.

For a gate that installs dependencies, each host's probe and final admission require free disk at least equal to its floor plus that repo's last measured install reserve from a host-local receipt. The reserve is the existing 10 GiB install headroom plus the gate's own bytes: the most its checkout and the package stores grew from just before its fetch through its install. One bounded `du` measures them and counts a node_modules file hardlinked into the store once. Host free space also moves with other lanes' writes, so it decides only the floor; receipts record both numbers. A measurement that fails or runs past 60 s records the cold reserve. With no measured receipt, the gate uses 10 GiB. A receipt records the checkout shape it measured (`sparse_spec`: `full` or a digest of the repo's sparse patterns). The launcher reads the gated commit's shape before any host fetches it. Receipts also record `checkout_temperature`: `warm` when the checkout already had that shape, `cold` when the gate cloned it. A cold gate uses its host's newest cold receipt of the shape, else the other Beelink's, else 10 GiB. A warm gate uses its host's newest warm receipt of the shape, else the other Beelink's, else the cold value. A gate is warm only if its checkout is present with the gated commit's shape when it is admitted under its checkout lock. A checkout its own prune evicts before the install is judged again on the cold reserve before anything is fetched. When the shape cannot be read, a host uses its newest receipt; receipts from before temperatures count as cold. A malformed receipt never counts, and an older one never overrides a newer one. A gate short only of that reserve first applies sparse patterns to idle checkouts and evicts nothing more for it. A host's probe that finds it short of floor plus reserve first measures its idle gate cache (checkouts no gate holds, one `du`); when that cache can close the gap, the probe runs the same recovery an admitted gate runs, re-measures and then decides, so `auto` does not pass by a host its own cache could free. A shortfall the cache cannot cover is refused with the cache kept warm, and that host is not re-measured for 15 minutes. The probe line reports `recovered=<bytes>`, and the recovery's prune line goes to the host's `~/.local/state/beelink-gate/capacity.log`. A refusal exits 75 before fetch, and `auto` can place on the other host. No-install and light gates keep the plain host floor. Receipts record `install_reserve_bytes` for runs that reach the install check.

### Host disk rule

This is the single definition of disk use on GTR and the Beelinks, and of gate admission, checkout locks and worktree removal. Its owner is op-company's `gtr-disk` lane, which also runs host cleanup (fleet steward, 2026-10-18; `beelink-gate-caps` and `beelink-worktree-growth` no longer have windows). Every other lane removes only its own finished worktree, with `wt-remove`, and sends any disk problem to the owner instead of sweeping, re-checking free space or acknowledging cleanups.

| Host | Limit | Enforced by |
|---|---|---|
| GTR | At least 200 GiB free on `/` | `gtr-disk`: maintained producers and cleanup paths |
| GTR | Each lane's worktrees within 1 GiB; no new worktree below 36 GiB free | `storage-lifecycle create` (rules below) |
| Beelinks | At most 4 `_wt` worktrees per lane; none created below 200 GiB free | the Git shim, from [`beelink-worktree-cap.json`](../../host/gtr-install-guard/beelink-worktree-cap.json) |
| Beelinks | Gate cache at most 40 GiB, least recently used idle checkout evicted first; idle checkouts first shrink to their repo's sparse patterns; Rust output inside it | `beelink-gate` |
| Beelinks | Cargo output in `~/.cache/<repo>-build` untouched for 24 h is removed after each gate | `beelink-gate`, holding the repo's gate locks and cargo's own locks |
| Beelinks | No gate starts below 100 GiB free on beelink1 or 162 GiB on beelink2; a host may raise its floor with `disk_floor_gib=` in `~/.config/beelink-gate/limits` | `beelink-gate` |

Gate checkout claims hold `~/.cache/beelink-gate/.locks/.capacity.lock` shared through repo-lock selection and release it once the repo flock is held. Cache sizing and sparse updates share that capacity lock with new claims; sparse updates also require the checkout's repo lock. For each LRU eviction, the pruner takes the repo lock without waiting, then takes `.capacity.writer.lock`, creates `.capacity.writer.intent`, and takes `.capacity.lock` exclusively. Both exclusive acquisitions are nonblocking: contention defers pruning rather than advertising an intent while waiting. Under intent it rechecks ownership and last use, renames the idle checkout into `.locks/.evicted-*`, then removes intent and releases exclusive capacity before recursive removal. Each removal is bounded by the timeout in `prune_cache`; interrupted removals stay counted in cache size and the next prune retries them. A new gate checks writer-lock ownership before and after its shared claim, including the gaps before marker creation and after unlink. A gate clears an abandoned intent only while holding the writer lock; a PID or marker age alone cannot prove abandonment. Active gates remain protected by their repo locks. Cleanup keeps its own age, lock, and live-file checks. `beelink-gate --report [hours]` includes capacity-intent refusals counted once per retained job stderr log, with the scan window and oldest retained log; expired logs are unavailable.

`wt-remove` refuses to salvage while `/mnt/traces` is not mounted and responsive. Change a limit through a pull request to its enforcing file, then tell the owner.

The gate reads `disk_floor_gib` at each admission check, including after a wait. A value below the host minimum holds the minimum and the gate says so; a non-numeric, duplicated or over-1024 value refuses admission. Set a raised floor only after the gate change has passed on a Beelink and deployed to both hosts; remove the override when the host owner confirms the capacity recovery.

### GTR worktree rule

- If hooks need installed dependencies, author in a Beelink worktree under `~/code/_wt`, install and commit there with hooks, push, gate the SHA with `beelink-gate`, then use `wt-remove` there after merge.
  Run test suites only through `beelink-gate auto`, never raw in that worktree: the gate admits by host load so CI keeps moving, and on 2026-10-11 raw worktree tests held 9 of beelink1's 16 threads against CI's 4.
- Otherwise create a sparse GTR worktree with `storage-lifecycle create`. Attach a named local branch through `--ref`, or run `git switch <branch>` or `git switch -c <branch>` before committing from a detached checkout. Confirm the branch with `git status -sb`.
- When the 1 GiB lane quota is full, reuse the lane's worktree with `git switch -c` after pushing its previous branch, or use `OWNER_RELEASED=1 wt-remove <path>` after that work is pushed and merged or abandoned. Keep all owner-tool retention checks.
- When GTR creation refuses for space below its 36 GiB admission floor, author in a Beelink worktree as above. Never bypass hooks through the GitHub git-data or contents API, or through plumbing commits (`commit-tree`, `merge-tree` with a temporary index), and never symlink another checkout's `node_modules` into a GTR worktree. All of these skip the commit hooks.

Discovery Lab scratch checkouts must use a linked worktree of the owning shared clone, or a sparse checkout. A standalone full clone or plain export materializes historical `pursuits/` and preregistration inputs on the host even when the scratch task needs only source. For an isolated Lab clone, set `scratch_path` and `ref` to the intended directory and branch or commit, then set sparse patterns before the first checkout:

```sh
git clone --filter=blob:none --no-checkout git@github.com:tangle-network/discovery-lab.git "$scratch_path"
git -C "$scratch_path" sparse-checkout set --no-cone '/*' '!/pursuits/' '!/prereg/**/input.json'
git -C "$scratch_path" checkout "$ref"
```

Keep actual run directories at `DISCO_PURSUITS_ROOT`, outside Git checkouts. Retire finished scratch worktrees through `wt-remove`; a standalone clone or export needs its owner's retention and release check before removal.

## Preserve concurrent work

Check the relevant checkout's status, base, and ownership before editing; inspect history, reflog, or PRs when changes or conflicts need explanation.
Investigate unexpected edits or commits; preserve active merges, rebases, and dirty detached checkouts.
Keep mixed scope explicit when separating work.
Delete branches only after proving retention or abandonment; ignored worktree files may contain work.
Before committing, check Git identity; report a mismatch instead of changing it during the task.

## Deliver through GitHub

gh-drew refuses any token that is not `drewstone`; to show the identity without spending core quota, run `gh-drew api graphql -f query='{viewer{login}}'`.
A loop or service that only reads GitHub (runs, statuses, compares, PR files) uses `gh-read`, which reads as `tangletools` and keeps Drew's quota for writes.
Missing DREW_GH_TOKEN requires restoring its owner, not switching accounts; SSH transport does not establish API identity.
Fetch the PR target, verify `git merge-tree --write-tree BASE HEAD`, and resolve conflicts.
Use Conventional Commits and repository hooks; dotfiles git/install.sh owns global hooks.
Write a multi-line commit or PR message to a file and pass it with `git commit -F <file>` or `--body-file <file>`; on 2026-10-15 an inline `-m` with unbalanced quotes ran message text as Mac shell commands.
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

Start unattended chains, watchers, measurements and mirrors through `unattended --name <lane> -- <command>`: CPUWeight 20 and nice 10 under interactive sessions and gates, and at most 12 per host (`UNATTENDED_MAX`). I/O heavy jobs also carry their own limits (`rsync --bwlimit`, restic `--limit-upload`), because the hosts' disk schedulers ignore `ionice`.
Keep scratch, logs, and evidence outside repository checkouts, in `~/.local/state/agent-work/<repo>/` (`skill-run-log --dir`), the session scratch directory, or /tmp.
A checkout holds only files its next pull request commits; a main checkout stays clean and on its default branch.
For existing screenshots, check ~/.claude/image-cache/ and ~/.tmux/clipboard/images/.
Mount namespaces do not isolate underlying file operations.
Run root storage or host experiments through `hostlab run -- '<command>'` in its throwaway VM.
This includes fsfreeze, dmsetup, real-disk LVM, mount --move, unshare --mount, mkfs, wipefs, reboot, and shutdown.
The VM provides scratch disk /dev/vdb and the caller's directory at /work.
A guard refusal must be resolved through the supported path, never another shell, interpreter, executable path, or guard-disable variable.
