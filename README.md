# dotfiles

Personal developer tooling: AI-assisted git hooks and Claude Code configuration.

## Claude Code Config

Portable Claude Code setup — global instructions, settings, skills, hooks, commands, and local CLI tools.

```bash
# Install on any machine
./claude/install.sh

# Overwrite existing config
./claude/install.sh --force
```

Includes:
- `CLAUDE.md` — global defaults (quality bar, work style, succinctness)
- `AGENTS.md` — shared agent instructions synced to Claude, Codex, and OpenCode homes
- `settings.json` — hooks, plugins, trusted directories
- 18 portable skills (`/polish`, `/verify`, `/work-status`, `/critical-audit`, `/code-review`, etc.)
- `claude-profile` in `~/bin` — switch Claude credentials by named profile
- Langfuse observability hook

Project-specific skills (tangle-blueprint-expert, blueprint-frontend, sandbox-blueprint) are kept in their respective project repos, not here.

Skill inventory and maintenance notes live in `claude/skills/README.md`. Tool docs live in `claude/tools/README.md`.

## Git Hooks

AI-assisted review gates via `ai-agent-hooks`.

## What It Does

`ai-agent-hooks` installs reusable `pre-commit` and `pre-push` hooks into any Git repository.

Default behavior:

- `pre-commit`
  - blocks merge conflict markers
  - blocks suspicious hard-coded secrets
- `pre-push`
  - repeats the static guards
  - runs a required Codex review gate using `gpt-5.4` with `model_reasoning_effort="high"`
  - requires structured JSON output
  - fails closed on invalid output, runner failure, or blocking findings

## Install

From a target repository:

```bash
pnpm dlx --package /home/drew/code/dotfiles ai-agent-hooks install --init-config
```

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

## Quality Bar

This repo is meant to be opinionated, not decorative:

- one enforced default reviewer
- structured output instead of prose-only success
- explicit gating policy
- stable artifacts for auditability
- local tests aligned with the default execution path
