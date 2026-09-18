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
