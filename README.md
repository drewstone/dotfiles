# dotfiles

Coding agents read `CLAUDE.md` and force-push anyway.
These dotfiles give Claude Code, Codex and OpenCode one shared rule file, and move every rule a hook can check out of the prompt and into a hook that refuses the command before it runs and names the one to run instead.
The skills, tools, Git hooks and Linux host guards that go with those rules live here too.

This is one person's working setup, published to copy from.
A full install replaces your agent configuration and global Git hooks, so most readers will take one hook, skill or document; each section below names its files.
Try the guard from a clone, before installing anything:

```console
$ git clone https://github.com/drewstone/dotfiles.git && cd dotfiles
$ echo '{"tool_name":"Bash","tool_input":{"command":"git push --force"}}' \
    | claude/hooks/process_guard.py
{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
"permissionDecisionReason": "process-guard (force-push): Force push refused (`--force`):
it rewrites published history, and no flag lifts this; [...] push new commits:
`git push origin HEAD:<branch>`."}}
```

## Commands agents ran, now refused

| An agent runs | Refused because |
|---|---|
| `git push --force` | it rewrites published history; push new commits instead |
| `git commit --no-verify` | it skips the global Git hooks |
| `gh pr merge --admin` | it bypasses branch protection |
| `pkill -f node`, `kill -9 -1` | a pattern or broadcast kill reaches other sessions' processes |
| `gh pr checks --watch` | CI gates the deploy, not the merge |
| `grep -r TODO ~` | an unbounded scan walks every checkout and cache |
| `env`, or `set -x` while loading a secret | the transcript keeps the values |
| `git stash pop` | worktrees share one stash list, so the top entry can be another session's |
| `mkfs`, `fsfreeze`, `dmsetup` on a real disk | it can freeze or unboot the host |

Each of these is refused with no configuration.

[`claude/hooks/process_guard.py`](claude/hooks/process_guard.py) is the one guard for Bash, Write, Edit, Monitor and browser calls.
Each rule replays a command an agent ran while its instructions said not to; the docstring at the top of the file lists every rule, and [`tests/process-guard.test.mjs`](tests/process-guard.test.mjs) replays them.
Every refusal names the allowed command, and each refusal and override is one line of `~/.claude/logs/process-guard.log`.
The same file guards Codex, which the installer configures to trust it, and OpenCode through [`claude/opencode-plugins/process-guard.js`](claude/opencode-plugins/process-guard.js).
Rules that need your names, such as hosts, secret stores or calls that must go through an owning tool, stay off until `~/.claude/guard-config.json` lists them.

To use only the guard in Claude Code, copy the hooks:

```bash
mkdir -p ~/.claude/hooks && cp claude/hooks/*.py ~/.claude/hooks/
```

and register it in `~/.claude/settings.json`:

```json
"hooks": {
  "PreToolUse": [
    {"matcher": "Bash",
     "hooks": [{"type": "command", "command": "$HOME/.claude/hooks/process_guard.py"}]}
  ]
}
```

For Codex, `python3 claude/hooks/codex-trust-managed.py ~/.codex ~/.claude/hooks/process_guard.py` adds the same guard to `~/.codex/hooks.json` and trusts it.

The other hooks, registered in [`claude/settings.json`](claude/settings.json) or called by the guard:

- `secret_scan.py`, after Bash, Read and Grep calls, warns when output holds a live-looking credential and gives that key's rotation steps; it logs only the kind, length and SHA-256.
- `agent-cap-guard.py`, before Agent and Workflow calls, caps live subagents and tells a refused subagent to do the work itself.
- `blocked_guard.py`, at Stop, sends back once a final message that asks you for a password or key, so the agent searches the vault first.
- `page_author.py` stamps each HTML page an agent writes under `~/reviews` with the session that wrote it; `page_feedback.py` takes what you type in the page's feedback box to that session, or to the next one started in its directory.
- `merge_check.py`, before `gh pr merge`, warns when the PR's head commit is red or pending.
- `inject-directive.sh`, at SessionStart, adds the active response-style directive from [`claude/directives`](claude/directives/README.md), rotating variants per session to compare them.
- `rtk-rewrite.sh`, before Bash, routes supported commands through `rtk` for shorter output.
- `skill-run-settle.sh`, at SessionEnd, records your corrections after each skill run in the skill ledger.

## What is where

| Path | Owns |
|---|---|
| [`claude/`](claude) | Agent configuration and its installer: shared rules, the Claude entry file, settings, hooks, [skills](claude/skills/README.md), [tools](claude/tools/README.md), directives |
| [`git/`](git) | Global Git hooks, the public-tree denylist, the line ratchets and their [`census`](git/census/README.md) instruments, a job that fast-forwards idle main checkouts |
| [`host/`](host) | Linux host guards, and `provision.sh`, which builds an agent box from a fresh Ubuntu install |
| [`tmux/`](tmux) | tmux configuration, and `tmux-heal`, which rebuilds sessions after the server dies |
| [`docs/`](docs) | Processes for delegating, measuring and delivering work; writing and design patterns agents must not produce |
| [`bin/`](bin), [`hooks/`](hooks), [`templates/`](templates) | `ai-agent-hooks`, which adds pre-commit and pre-push checks with a required Codex review to any repository |
| [`tests/`](tests) | Integration tests for the hooks, installers and tools |

## Requirements

- macOS or Linux, with Bash, Git, Python 3.11 or later and Node 22 or later.
- Claude Code, Codex or OpenCode; each one you use gets the shared rules and the guard.
- `jq` for several hooks, which skip their work without it, and [`rtk`](https://github.com/rtk-ai/rtk) for `rtk-rewrite.sh`.
- `host/` and `tmux-heal` need Linux with systemd; `host/provision.sh` targets Ubuntu 24.04 on x86_64.

## Install

```bash
git clone https://github.com/drewstone/dotfiles.git ~/dotfiles
cd ~/dotfiles
./claude/install.sh
./git/install.sh
```

The installers link files from this checkout, so clone it where it will stay; both are safe to re-run, and neither has a dry run.
`claude/install.sh` links the shared rules, skills, hooks and tools into `~/.claude`, `~/.codex`, `~/.config/opencode` and `~/bin`, and skips an existing file that is not a link unless you pass `--force`.
It writes `~/.claude/settings.json` as [`claude/settings.json`](claude/settings.json) merged with this machine's `~/.claude/settings.machine.json`, sets Codex's default model and reasoning effort through `claude/install-codex-config.py` while keeping the rest of `~/.codex/config.toml`, installs the Claude plugins the settings enable, and on macOS starts the page-feedback listener.
`git/install.sh` sets the global Git hooks, ignore and attributes files, described [below](#git-hooks-for-every-repository).

For Codex to read repositories that have only a `CLAUDE.md`, add `project_doc_fallback_filenames = ["CLAUDE.md"]` at the top level of `~/.codex/config.toml`; on a Linux box, `host/provision.sh agents` adds it.

## Verify

```bash
ls -l ~/.claude/CLAUDE.md ~/.codex/AGENTS.md ~/.config/opencode/AGENTS.md
echo '{"tool_name":"Bash","tool_input":{"command":"git push --force"}}' \
  | ~/.claude/hooks/process_guard.py
~/bin/skills --check
git/census/census instructions
```

The links point into this checkout and the guard prints a `deny`.
`skills --check` checks the installed skills and fails on a duplicate name or a broken link.
`census instructions` prints each instruction file an agent loads in the current directory, with its tokens and the rules that repeat another file or a hook.

## Public tree, private layer

This repository is public and names no host, network, account or private tool.
[`git/hooks/public-denylist`](git/hooks/public-denylist) holds one extended regex per line for those names.
In any repository with that file at that path, the global `pre-commit` refuses a staged line that matches and prints the file, line and pattern; [`tests/public-scan.test.mjs`](tests/public-scan.test.mjs) scans every tracked file with the same list.

The names live in an optional private layer at `DOTFILES_PRIVATE` (default `~/.local/share/dotfiles-private`), a repository shaped like this one.
The installers attach it when it exists; without it, each step that reads it is skipped and the public install is complete.

The layer adds, beside the public files:

- its `claude/AGENTS.md`, linked at `~/.claude/AGENTS.private.md` and imported after the public rules, which names the tool, host or identity each public rule number means for you;
- its `claude/settings.json`, merged over the public one;
- its `claude/guard-config.json`, linked at `~/.claude/guard-config.json`, where hook rules read your lists;
- its own skills, tools, hooks and directive variants; a skill with a public skill's name replaces it;
- tool defaults in its `claude/config/<tool>.env`;
- its `host/install.sh` and `git/layer-install.sh`, run after the public steps.

## One rule file, kept small

[`claude/AGENTS.md`](claude/AGENTS.md) holds what no hook can check, one sentence per rule, each linking the document that owns the detail.
The installer links it at `~/.claude/AGENTS.md`, `~/.codex/AGENTS.md` and `~/.config/opencode/AGENTS.md`, and [`claude/CLAUDE.md`](claude/CLAUDE.md) imports it.
A rule leaves the file once a hook enforces it or a linked document states it; `census instructions` finds those, along with near-duplicate rules and dangling references.
In a repository that both Claude Code and Codex work in, keep shared guidance in `AGENTS.md`; a `CLAUDE.md` can import it with `@AGENTS.md`.

Code size is measured, not gated: `census` reports production lines and file sizes, and no commit or merge is refused for growth.
In repositories whose owner `~/.claude/guard-config.json` lists under `ratchets`, commit-time ratchets refuse oversized functions, docs that name moved or deleted files, and a second export of an existing name.
[`git/census/README.md`](git/census/README.md) owns these rules.

## Git hooks for every repository

`git/install.sh` points `core.hooksPath` and `init.templateDir` into this checkout, sets the shared ignore and attributes files unless others are configured, and installs a job that fast-forwards idle, clean main checkouts.
The global hooks refuse a commit whose author is not the configured owner, personal details from a local untracked denylist, card numbers, hard-coded secrets, merge-conflict markers, a credential in a commit message, and a push whose branch does not merge cleanly into `origin/main`.

For stricter gates in one repository, `ai-agent-hooks` installs that repository's own `pre-commit` and `pre-push`:

```bash
node ~/dotfiles/bin/ai-agent-hooks.mjs install --repo <path> --init-config
```

That writes `.githooks/pre-commit`, `.githooks/pre-push` and `.ai-agent-hooks.mjs`, which overrides the global baseline for that repository.
`pre-push` repeats the static checks and runs a required Codex review; `audit.model` and `audit.reasoningEffort` in `.ai-agent-hooks.mjs` override the installed Codex settings.
The review returns JSON with `status` (`pass` or `fail`), `summary` and typed `findings`; a `high` or `critical` finding, invalid output or a runner failure fails the push.
Each run's prompt, diff, schema, result and log stay under `.git/ai-agent-hooks/runs/<timestamp>-<hook>/`.

## Linux agent boxes

[`host/`](host) keeps a Linux box alive under agents that hold passwordless sudo.
`./host/install.sh` installs the guards and asks for sudo; `./host/install.sh --check` reports drift and changes nothing.

- Root wrappers in `/usr/local/sbin` refuse `fsfreeze`, `dmsetup`, LVM, `mkfs`, `mount` and `unshare` forms that touch the root disk or a kernel filesystem; loop-backed work passes. `/etc/sudoers.d/zz-agent-blast-guard` closes the absolute-path route to the real binaries.
- The watchdog daemon writes to the root filesystem; a frozen root blocks it, and a kernel softdog resets the box in about four minutes (247 s measured in a VM).
- Agent processes share one cgroup cap, and Docker containers join it.

`host/provision.sh` turns a fresh Ubuntu 24.04 machine into an agent box: guards, base tools, Wi-Fi, no-sleep, shell, Git hooks, tmux and the agents themselves.
Each step tests the box first, so a second run changes nothing; `--check` reports drift and `--help` lists the modules.
It never signs in to an account or erases a disk; it prints those steps as exact commands at the end.
The Wi-Fi passphrase comes from the command line, a prompt or `--wifi-psk-file <file>`, never from this repository.

`./tmux/install.sh` links `~/.tmux.conf` to this checkout and clones its plugins.
`./tmux/install-heal.sh` installs `tmux-heal`, which keeps a workspace index and, after the tmux server dies, recreates sessions and windows with shells in their prior directories.
It cannot revive processes, pane splits, scrollback or unsaved work.

## How the work is done

- [The work process](docs/processes/agent-work.md): delegation, the brief every delegated task carries, checkouts, delivery through GitHub and evidence.
- [The climb](docs/processes/climb.md): every change is a move with a predicted effect on a measured target, kept only when the number moves.
- [Anti-patterns](docs/anti-patterns/README.md): writing, design and review patterns an agent reads before producing copy or UI.
- [Skills](claude/skills/README.md): `diagnose`, `verify`, `ship`, `simplify`, `tdd`, `critical-audit`, `writing-for-agents` and the rest, installed for Claude Code and Codex; each `SKILL.md` description says when it applies.
- [Tools](claude/tools/README.md): commands linked into `~/bin`, such as `wt-new` and `wt-save` for worktrees owned by one session, and `run-jobs-watch`, which watches a deploy job by job.

## Changing this repository

Shared behavior goes in `claude/AGENTS.md`, Claude-only behavior in `claude/CLAUDE.md`, and any host, account or private name in the private layer.
Changes land as pull requests with the global Git hooks on.
There is no CI: `npm test` runs the integration suite, and `node --test tests/<name>.test.mjs` runs one file, such as `tests/process-guard.test.mjs` after a guard change.

## Uninstall

There is no uninstall script.
From the checkout, list what the installers left and remove it:

```bash
# links into this checkout: remove each with rm
find ~/.claude ~/.codex ~/.config/opencode ~/bin -maxdepth 3 -type l -lname "$PWD/*"
# global Git settings pointing here: git config --global --unset <key> for each
git config --global --get-regexp 'hookspath|excludesfile|attributesfile|templatedir'
# macOS background jobs; on Linux: systemctl --user disable --now main-checkout-ff.timer
launchctl bootout gui/$(id -u)/com.dotfiles.page-feedback
launchctl bootout gui/$(id -u)/com.dotfiles.main-checkout-ff
```

`~/.claude/settings.json` is a generated file; replace it with your own.
On Linux, the header of [`host/install.sh`](host/install.sh) lists every file it writes under `/etc` and `/usr/local`.

## License

No `LICENSE` file is checked in yet; `package.json` declares MIT.
