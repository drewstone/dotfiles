# dotfiles

Personal developer tooling: shared agent guidance and Git hooks.

## Agent setup

Run `./claude/install.sh` from the durable checkout that will own installed symlinks.
Use `--force` only when replacing existing configuration is intended.
The installer shares instructions, skills, commands, and tools across supported agent homes.
It also installs Claude settings, hooks, and plugins.
See [skills](claude/skills/README.md) and [tools](claude/tools/README.md) for their maintained guidance.

For Codex, add this top-level setting to `~/.codex/config.toml`:

```toml
project_doc_fallback_filenames = ["CLAUDE.md"]
```

This lets Codex discover repositories that use only `CLAUDE.md`.
If fallback names already exist, append this name to that list.
Codex prefers `AGENTS.override.md`, then `AGENTS.md`, then configured fallback names within each directory.
Keep shared repository guidance in `AGENTS.md` when both agents use it; a Claude entry can import `@AGENTS.md`.
See the [current Codex discovery rules](https://developers.openai.com/codex/guides/agents-md) for scope and limits.

## Host guards

`host/` keeps a Linux box alive under agents that hold passwordless sudo.
Install with `./host/install.sh` (sudo).

- Root wrappers in `/usr/local/sbin` refuse `fsfreeze`, `dmsetup`, LVM, `mkfs`, `mount`, and `unshare` forms that touch the root disk or a kernel filesystem; loop-backed work passes.
- `/etc/sudoers.d/zz-agent-blast-guard` closes the absolute-path route to the real binaries.
- The watchdog daemon runs `/etc/watchdog.d/root-write`; a frozen root blocks it and a kernel softdog resets the box in about four minutes (measured 247 s in a VM).
- `claude/hooks/host-blast-guard.sh` blocks the same verbs inside Claude Code before sudo sees them.
- `claude/tools/hostlab` boots a throwaway VM (root, lvm2, dm-thin, xfs, the cwd at /work) where the same commands are allowed.

The same installer places the cli-bridge LLM slice and its CPU cap in `~/.config/systemd/user`.
`CPUQuota=2400%` and `CPUWeight=50` hold every cli-bridge LLM scope, including discovery-lab's kissat campaign, to 24 of 32 cores.
Run `./host/install-cli-bridge-slice.sh` alone to install only the slice; it needs no sudo.

## Worktree reaper

`git/install.sh` installs `wt-reaper`: a systemd user timer on Linux and a launchd agent on macOS, both at 04:15 daily.
It covers every linked worktree registered with a repository under `~/code` or `~/company`, wherever that worktree lives (for example `~/code/_wt/*`, `~/worktrees/*`, or `/tmp`).
It removes one only when every check passes:

- The worktree is not locked and has no merge, rebase, bisect, cherry-pick, or revert in progress.
- Nothing in it, its index, HEAD, or reflogs changed in the last 24 hours.
- `git status` is empty; only ignored build output such as `node_modules/` may remain. An ignored `.env` keeps the tree.
- It holds no nested repository.
- After `git fetch --all --prune`, every commit on its HEAD is on a remote-tracking ref.
- No process has its cwd, an open file, or a mapped file inside it (`/proc` on Linux, `lsof` on macOS).
  The scan must read every live process, so it uses `sudo -n`; if any live process stays unreadable, the run removes nothing.
  On macOS this needs a sudoers rule for `/usr/sbin/lsof -n -P -w -F pn`; the installer prints it.

Any error or doubt skips the tree, and every decision is logged to `~/.local/state/wt-reaper/wt-reaper.log`.
Removal uses `git worktree remove` without `--force`.
The local branch is deleted only when it is merged into the remote default branch.
Run `wt-reaper --dry-run` to see the decisions without removing anything.
Main checkouts are never candidates, and the reaper refuses to run as root.

## Tmux recovery

Install the tmux watcher and make its user manager a last-resort memory-pressure target:

```bash
./tmux/install-heal.sh
```

The watcher saves a workspace index every minute.
It also asks tmux-resurrect to save its standard snapshot every 15 minutes when installed.
After server loss, it recreates session and window names with shells in their prior directories.
It cannot revive processes, pane splits, scrollback, or unsaved work.
The installer keeps normal pane processes eligible for memory-pressure cleanup.

## Global Git Etiquette Guard

Install the universal fast guards once:

```bash
./git/install.sh
```

The installer points `core.hooksPath` and `init.templateDir` into this checkout.
It also installs the shared ignore file unless another one is already configured.

Global baseline behavior:

- `pre-commit`: blocks merge conflict markers and suspicious hard-coded secrets.
- `pre-push`: blocks merge conflict markers, suspicious hard-coded secrets, and branches that do not merge cleanly into `origin/main`.

Repos can still opt into stricter review gates with a checked-in `.ai-agent-hooks.mjs`; that config overrides the global baseline for that repo.

## What It Does

`ai-agent-hooks` installs reusable `pre-commit` and `pre-push` hooks into any Git repository.

Default behavior:

- `pre-commit`
  - blocks merge conflict markers
  - blocks suspicious hard-coded secrets
- `pre-push`
  - repeats the static guards
  - runs a required Codex review gate using the installed Codex model and reasoning settings
  - requires structured JSON output
  - fails closed on invalid output, runner failure, or blocking findings

## Install

From a target repository:

```bash
node "$HOME/code/dotfiles/bin/ai-agent-hooks.mjs" install --init-config
```

Use the path to your durable dotfiles checkout if it differs.
An explicit `audit.model` or `audit.reasoningEffort` in repository configuration overrides the inherited choice.

That writes:

- `.githooks/pre-commit`
- `.githooks/pre-push`
- `.ai-agent-hooks.mjs`

## Review Contract

The default Codex review must return structured JSON with:

- `status`: `pass` or `fail`
- `summary`: short human-readable result
- `findings`: array of typed findings

Each finding includes:

- `severity`: `low | medium | high | critical`
- `category`
- `title`
- optional `file`
- optional `line`
- optional `evidence`
- `recommendation`

Default blocking policy:

- fail on `high`
- fail on `critical`

## Artifacts

Each hook run writes a directory under:

```bash
.git/ai-agent-hooks/runs/<timestamp>-<hook>/
```

Expected files for review checks:

- `summary.json`
- `<check>.prompt.txt`
- `<check>.diff.patch`
- `<check>.changed-files.txt`
- `<check>.git-context.json`
- `<check>.schema.json`
- `<check>.result.json`
- `<check>.runner-meta.json`
- `<check>.log`
