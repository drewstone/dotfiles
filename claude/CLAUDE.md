# Claude Code

@AGENTS.md

## Dotfiles

All Claude Code configuration lives in `~/dotfiles/claude/` and is symlinked into `~/.claude/` by `~/dotfiles/claude/install.sh`.

- Shared behavior lives in `AGENTS.md`. If a rule should apply to Claude, Codex, and OpenCode, edit `AGENTS.md`, not this file.
- Claude-specific config lives here: install behavior, settings, hooks, commands, and Claude-only operational notes.
- Claude inherits shared technical decision rules from `AGENTS.md`, including the rule to give development cost little weight.
- Skills live in `~/dotfiles/claude/skills/<name>/SKILL.md` and are symlinked into both Claude and Codex by `install.sh`.
- Hooks live in `~/dotfiles/claude/hooks/`.
- Commands live in `~/dotfiles/claude/commands/`.
- Tools in `~/dotfiles/claude/tools/` are symlinked into `~/bin/`.
- Portable settings live in `~/dotfiles/claude/settings.json`; machine-specific settings live in `~/.claude/settings.local.json`.
- Never edit generated symlink targets directly. Edit the dotfiles source and rerun `~/dotfiles/claude/install.sh`.

## Install Contract

`install.sh` is the source of truth for wiring local agents:

- `AGENTS.md` -> `~/.claude/AGENTS.md`, `~/.codex/AGENTS.md`, and `~/.config/opencode/AGENTS.md`.
- `CLAUDE.md` -> `~/.claude/CLAUDE.md` only.
- `skills/*` -> `~/.claude/skills/*` and `~/.codex/skills/*`.
- Claude commands -> `~/.claude/commands/*` and Codex prompts where supported.
- Claude hooks stay Claude-only.

Do not route Codex or OpenCode through `CLAUDE.md`; that recreates behavior drift.

## Ops Board

When using Claude-specific ops tracking, use the shared board in `~/company/tools/ops-board/`.

- `ops-board list [--state STATE] [--json]`
- `ops-board add --title "..." --lane gtm|ops|eng --owner drew|claude --repo-surface "..." --done-criteria "..." --next-action "..."`
- `ops-board move --id N --state STATE`
- `ops-board done --id N --artifact-url "..."`
- `ops-board block --id N --reason "..." --retry-cmd "..."`

Use measurable done criteria and artifact links. Owner is `drew` only for work that genuinely requires Drew.

## Project References

See `PROJECTS.md` for active projects, paths, stacks, and model config.

## Credential Separation

Do not mix credentials between Tangle/company projects and Webb/personal projects.

- Tangle Cloudflare account: `0c928041f7d1c2caadd7df75cc69c5ef`
- Webb/personal credentials must not be used for Tangle projects.
- Before using a credential from another project's `.env` or secrets directory, verify which organization it belongs to.

@RTK.md
