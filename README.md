# dotfiles

Personal Git hook tooling for local AI-assisted review gates.

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
