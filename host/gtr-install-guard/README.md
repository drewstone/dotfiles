# GTR package install guard

On `drew-GTR-Pro`, `host/gtr-install-guard/install.py` wraps the existing PATH
entrypoints for `pnpm`, `npm`, `yarn`, `uv` and `corepack` in `~/.local/bin`, `~/bin`, the
pnpm home, and installed nvm Node versions. Each original executable stays next to its
wrapper as `<name>.gtr-original`; allowed commands delegate to it.

The wrapper refuses pnpm, npm and yarn installs (frozen included, and the same through
`corepack`) in any git checkout on GTR, not only inside `~/code/_wt` and `~/webb/_wt`: on
2026-10-10 an agent refused in `_wt` cloned `~/code/gate-gtm-20261010` and gated there. It
points to `beelink-gate beelink1|beelink2 <repo-url> <full-sha> -- <command>`. Exempt: the
deploy-managed service checkouts tangle-tools-deploy installs (`~/.config/fleet/checkouts`,
`DISCO_LAB` in `~/.config/fleet/lab.env`, the tangle-tools deploy clone), the beelink-gate cache,
global installs, lockfile-only resolution, and directories that are not checkouts. `uv` installs
stay refused only inside `_wt`, because GTR's tools run through `uv run` from their checkouts.

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

On beelink1 and beelink2, `host/install.sh` installs the same Git entrypoint at `/usr/local/bin/git`
with `git.worktree-cap.json` beside it ([beelink-worktree-cap.json](beelink-worktree-cap.json)).
There it applies only the worktree cap; package installs are not refused, since Beelinks are where they run.

- A `git worktree add` into `~/code/_wt` or `~/webb/_wt` must name its fleet lane: `FLEET_LANE=<operator>:<lane>`,
  or the `FLEET_STATUS_FILE` that GTR's ssh client sends (`host/ssh/20-fleet-lane-send.conf`, accepted by
  `host/ssh/20-fleet-lane-accept.conf`). The lane is recorded as `fleet-lane` in the new worktree's admin directory.
- A lane holding `cap` (4) recorded worktrees is refused; so is any add while the filesystem has less than
  `floor_bytes` (200 GiB) free. The refusal lists the longest-idle trees as `OWNER_RELEASED=1 wt-remove <path>` lines.
- Counting, checkout and the lane record run under one per-lane lock, and the record is written whenever the tree exists,
  so parallel adds and a failing post-checkout hook still count. Trees nested up to 3 levels under a root count.
- Trees outside `_wt` (tool caches, `tangle-ops ship`, the adc-wt pool, `~/company/_wt`) and every other Git command pass through.
- This is a guardrail for cooperating agents, not a sandbox: a new `FLEET_LANE` value, a Git alias, or `worktree move`
  into `_wt` gets past it. Trees made before installation carry no lane and are not counted.

Measured 2026-10-11: beelink1 gained 49 `_wt` worktrees in 6 h and held 73 GB of `_wt` data unique beyond the pnpm store;
the idle reapers cannot touch a tree younger than 12 h.
