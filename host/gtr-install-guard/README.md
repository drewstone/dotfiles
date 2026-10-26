# GTR package install guard

On `drew-GTR-Pro`, `host/gtr-install-guard/install.py` wraps the existing PATH
entrypoints for `pnpm`, `npm`, `yarn`, `uv` and `corepack` in `~/.local/bin`, `~/bin`, the
pnpm home, and installed nvm Node versions. Each original executable stays next to its
wrapper as `<name>.gtr-original`; allowed commands delegate to it.

The wrapper refuses pnpm, npm and yarn installs (frozen included, and the same through
`corepack`) in any git checkout on GTR, not only inside `~/code/_wt` and `~/webb/_wt`: an
agent refused in `_wt` cloned `~/code/gate-gtm-20261010` and gated there. It
points to `beelink-gate auto <repo-url> <full-sha> -- <command>`. Exempt: the
deploy-managed service checkouts tangle-tools-deploy installs (`~/.config/fleet/checkouts`,
`DISCO_LAB` in `~/.config/fleet/lab.env`, the tangle-tools deploy clone), the beelink-gate cache,
global installs, lockfile-only resolution, and directories that are not checkouts. Outside
the fallback root, `uv` installs stay refused only inside `_wt`, because GTR tools use
`uv run` from their checkouts.

`beelink-gate` owns the fallback: a gate no Beelink admits within 5 minutes runs under
`storage-lifecycle run-lane` in a fresh clone under `~/.cache/gtr-gate` and removes it before the lease ends
([agent work](../../docs/processes/agent-work.md#choose-the-host-and-checkout)).

Recognized package installs in the fallback root require the lifecycle owner
`storage_lifecycle.admission.lease_receipt` from the installed Tangle Tools. The
`TANGLE_STORAGE_LEASE`, `TANGLE_STORAGE_LANE` and `TANGLE_STORAGE_PATH` environment
values identify a lease; they do not authorize it. `run-lane` exports them for its
foreground child. A controller using direct `admit` must bind the returned token,
its lane and the exact admitted path while the real lease owner supervises the child.
The owner checks canonical policy and registry, matching paths, native process identity
and ancestry. Missing, released, stale or unrelated leases refuse. This cooperating
agent PATH guard does not claim protection against a same-user attacker rewriting
the canonical registry. Existing deployment exemptions remain separate.

Install after updating the durable `~/code/dotfiles` checkout:

```sh
python3 host/gtr-install-guard/install.py
python3 host/gtr-install-guard/install.py --check
```

The host guard installer also invokes it on GTR during normal provisioning.
Run `--uninstall` to restore every preserved original. New Node versions add
new entrypoints; rerun the installer or provision check after installing one.
This is a PATH guard for ordinary package manager commands, not a replacement
for the fleet rule to run dependency installs and gates on a Beelink.

Node provisioning can pass repeatable `--prefix` paths to install or check only
its prepared or installed nvm versions. Each path must be a directory within
this user's `~/.nvm/versions/node` store. A prepared prefix may be in a hidden
extraction directory: finish guard enrollment and `--check` there before
publishing a new canonical version, since a broad nvm default alias selects the
highest version as soon as it appears. Other global managers and their retained
originals are outside this scoped operation; the default full check still
reports their drift.

`~/bin/git` also refuses direct `git worktree add` destinations under either GTR `_wt` root.
The budgeted `storage-lifecycle create` path passes its scoped marker to Git; other Git
commands and pinned checkouts outside `_wt` delegate to `/usr/bin/git`.

GTR noninteractive SSH commands can omit `~/bin` and `~/.local/bin` from PATH.
`host/install.sh` also installs a root-owned copy of the same Git wrapper at
`/usr/local/bin/git`, with `/usr/local/bin/git.gtr-original` pointing to
`/usr/bin/git`. This location precedes `/usr/bin` in the SSH command PATH;
`host/install.sh --check` reports drift in either installed copy.

When a full host install check also reports unrelated drift, use
`host/install.sh --git-guard-only` to update just these two GTR Git files.
The full installer continues to maintain them during normal provisioning.

## Beelink worktree cap

On beelink1 and beelink2, `host/install.sh` installs [beelink-git](beelink-git) at `/usr/local/bin/git`: a shell shim that
sends only `worktree` commands to this guard (`/usr/local/lib/beelink-worktree-cap/git`, with
[beelink-worktree-cap.json](beelink-worktree-cap.json) beside it) and every other call straight to `/usr/bin/git`.
Routing every call through Python cost 76 ms against 8 ms native on beelink2. The guard applies only the worktree cap there;
package installs are not refused, since Beelinks are where they run.

- A `git worktree add` into `~/code/_wt` or `~/webb/_wt` must name its fleet lane: `FLEET_LANE=<operator>:<lane>`,
  or the `FLEET_STATUS_FILE` that GTR's ssh client sends (`host/ssh/20-fleet-lane-send.conf`, accepted by
  `host/ssh/20-fleet-lane-accept.conf`). The lane is recorded as `fleet-lane` in the new worktree's admin directory.
- A lane at its configured `cap` is refused, listing its longest-idle trees: `OWNER_RELEASED=1 wt-remove <path>` for the lane's own,
  plain `wt-remove <path>` (which keeps its idle guard) for another lane's.
  An add that does not fit Tangle Tools' size-aware admission (free - live reservations - the tree's tracked bytes >= the
  lifecycle minimum, `admission_headroom` in `/usr/local/libexec/tangle-fleet-disk-policy.py`, the rule `beelink-gate` uses)
  is refused; an unreadable owner admits with a note. Its message points to the existing read-only
  `storage-lifecycle run --exclusive-inventory --max-seconds 20`; the guard does not duplicate allocation or salvage scans.
- Counting, checkout and the lane record run under one per-lane lock, and the record is written whenever the tree exists,
  so parallel adds and a failing post-checkout hook still count. Trees nested up to 3 levels under a root count.
- Trees outside `_wt` (tool caches, `tangle-ops ship`, the adc-wt pool, `~/company/_wt`) and every other Git command pass through.
- This is a guardrail for cooperating agents, not a sandbox: a new `FLEET_LANE` value or a Git alias gets past it.
  A `worktree move` into `_wt` is checked like an add (lane-10080 moved a 4.6 GB tree in under the floor). Trees made before installation carry no lane and are not counted.

beelink1 once gained 49 `_wt` worktrees in 6 h and held 73 GB of `_wt` data unique beyond the pnpm store;
the idle reapers cannot touch a tree younger than 12 h.
