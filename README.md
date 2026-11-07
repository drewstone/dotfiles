# dotfiles

An agent operating layer for Claude Code, Codex and OpenCode: shared instructions, hooks, skills, tools, Linux host provisioning, Git hooks, and a gate that keeps this public tree free of private names.

## Agent setup

Run `./claude/install.sh` from the durable checkout that will own installed symlinks.
Use `--force` only when replacing existing configuration is intended.
The installer shares instructions, skills, commands, and tools across supported agent homes.
It also installs Claude settings, hooks, and plugins.
It manages the shared Codex model defaults through `claude/install-codex-config.py`,
preserving other private config values and enrolled account symlinks.
See [skills](claude/skills/README.md) and [tools](claude/tools/README.md) for their maintained guidance.

For Codex, add `project_doc_fallback_filenames = ["CLAUDE.md"]` at the top level of `~/.codex/config.toml` so it discovers repositories that use only `CLAUDE.md`; on a Linux box, `host/provision.sh agents` adds it.
Keep shared repository guidance in `AGENTS.md` when both agents use it; a Claude entry can import `@AGENTS.md`.

## Private layer

`claude/install.sh` and `host/install.sh` attach an optional private layer at `DOTFILES_PRIVATE` (default `~/.local/share/dotfiles-private`), a repository shaped like this one: `claude/`, `docs/`, `host/`, `tests/`.
Its `claude/skills`, `claude/tools`, `claude/hooks` and `claude/directives/variants` install beside the public ones; a private skill with a public skill's name replaces it.
Its `claude/AGENTS.md` is linked at `~/.claude/AGENTS.private.md`, which `claude/CLAUDE.md` imports after the public rules.
Its `claude/settings.json` merges over the public settings, and its `claude/guard-config.json` is linked at `~/.claude/guard-config.json`, where hooks read their private lists.
Tools read their private defaults from its `claude/config/<tool>.env`, and `host/install.sh` runs its executable `host/install.sh`.
Without the layer, each of these is skipped and the public install is complete.

## Public-tree gate

`git/hooks/public-denylist` holds one extended regex per line for names this tree must not carry: hosts, networks, accounts, company and product names, private repositories and tools.
When the repository being committed has that file at its root, the global `pre-commit` refuses staged content that matches a line and prints the file, line and pattern.
`tests/public-scan.test.mjs` scans every tracked file with the same list; a private name belongs in the private layer.

## Host guards

`host/` keeps a Linux box alive under agents that hold passwordless sudo.
Install with `./host/install.sh` (sudo); `./host/install.sh --check` reports drift without a change.

- Root wrappers in `/usr/local/sbin` refuse `fsfreeze`, `dmsetup`, LVM, `mkfs`, `mount`, and `unshare` forms that touch the root disk or a kernel filesystem; loop-backed work passes.
- `/etc/sudoers.d/zz-agent-blast-guard` closes the absolute-path route to the real binaries.
- The watchdog daemon runs `/etc/watchdog.d/root-write`; a frozen root blocks it and a kernel softdog resets the box in about four minutes (measured 247 s in a VM).
- `claude/hooks/host-blast-guard.sh` blocks the same verbs inside Claude Code before sudo sees them, and `host/bin/format-traces-drive`, which erases a disk.
- `claude/hooks/process_guard.py` refuses, in Claude Bash commands, the `ssh`, `bash -c` and heredoc scripts inside them, and the ad-hoc script files they run: `gh pr merge --admin` and branch-protection writes; force pushes unless the command sets `CC_ALLOW_FORCE_PUSH=1` with the owner's authorization; `core.hooksPath` overrides and `--no-verify` commits outside throwaway fixture repos; bare `git stash pop`/`apply`; `pkill`, `killall`, and kills of 0, -1, a process group or a `pgrep`/`pidof` result (`CC_ALLOW_BROADCAST_KILL=1` overrides); shell tracing while the traced command loads or expands a secret; and, on the Mac only, whole-repo installs, builds and test runs (`CC_ALLOW_MAC_BUILD=1` overrides). Codex runs it as a PreToolUse guard too; denials and overrides go to `~/.claude/logs/process-guard.log`.
- `claude/hooks/secret_scan.py` runs after Bash, Read and Grep calls and warns when their output or command holds a live-looking credential, with that key type's rotation steps; it records only the kind, length and SHA-256 in `~/.claude/logs/secret-exposures.jsonl`.

## Provision a Linux box

`host/provision.sh` makes a fresh Ubuntu 24.04 machine into an agent box; each step tests the box first and changes only what differs, so a second run changes nothing.
`host/provision.sh --check` reports drift and exits 1 when something differs; `host/provision.sh --help` lists the modules and options.
The run never signs in to an account and never erases a disk; it prints those steps as exact commands at the end.
The Wi-Fi passphrase comes from the command line, a prompt or `--wifi-psk-file <file>`, never from this repository, and reaches NetworkManager on standard input.

## Tmux recovery

`./tmux/install-heal.sh` installs the tmux watcher and makes its user manager a last-resort memory-pressure target.
The watcher saves a workspace index every minute and asks tmux-resurrect to save its snapshot every 15 minutes when installed.
After server loss, it recreates session and window names with shells in their prior directories; it cannot revive processes, pane splits, scrollback, or unsaved work.

## Git hooks

`./git/install.sh` points `core.hooksPath` and `init.templateDir` into this checkout and installs the shared ignore file unless another one is configured.
The global `pre-commit` and `pre-push` block merge conflict markers and suspicious hard-coded secrets; `pre-push` also blocks branches that do not merge cleanly into `origin/main`.
A repository can opt into stricter review gates with a checked-in `.ai-agent-hooks.mjs`, which overrides the global baseline for that repository.

`ai-agent-hooks` installs those `pre-commit` and `pre-push` hooks into any Git repository:

```bash
node "$HOME/code/dotfiles/bin/ai-agent-hooks.mjs" install --init-config
```

That writes `.githooks/pre-commit`, `.githooks/pre-push` and `.ai-agent-hooks.mjs`.
`pre-push` repeats the static guards and runs a required Codex review with the installed model and reasoning settings; `audit.model` or `audit.reasoningEffort` in the repository configuration overrides them.
The review returns JSON with `status` (`pass` or `fail`), `summary` and typed `findings` (`severity`, `category`, `title`, `recommendation`, optional `file`, `line`, `evidence`); a `high` or `critical` finding, invalid output or a runner failure fails the push.
Each run writes its prompt, diff, changed files, Git context, schema, result, runner metadata and log under `.git/ai-agent-hooks/runs/<timestamp>-<hook>/`.
