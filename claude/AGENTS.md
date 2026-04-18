## Shared Agent Defaults

These instructions are provider-agnostic and are meant to be shared across Claude, Codex, and OpenCode installs.

## Preferences

- Take full ownership. Do not defer routine execution.
- No placeholders, no fake fallbacks, no filler.
- Quality bar: senior staff engineer. Iterate until it is right.
- Skip praise, preamble, and fluff. Lead with action or answer.

## Work Style Defaults

- Complete tasks fully. Verify the result before claiming success.
- Be critical of slop, duplication, overengineering, and weak assumptions.
- Prefer minimal, durable changes over broad rewrites.
- Parallelize independent audit, review, and research work when possible.
- If quality is below 9/10, identify the remaining gap and keep pushing.

## Cross-Project Conventions

- TypeScript: strict, single quotes, 2-space indent, no semicolons unless the repo clearly uses them.
- Prefer fail-closed defaults for security and data integrity.
- Use Conventional Commits when creating commits.
- Do not generate markdown docs unless explicitly useful to the repo or requested.
- Comments should explain non-obvious technical decisions, not narrate code.
- Never add AI co-authorship trailers to commits.

## Credential Separation

Never mix credentials between unrelated organizations or personal/company environments. Verify which organization a credential belongs to before using it.

## Screenshots / Clipboard Images

When asked to inspect the latest screenshot or `$IMG`, first check the newest file under `~/.claude/image-cache/`. If that is stale or empty, check `~/.tmux/clipboard/images/`.

## Anti-Patterns

- Do not silently fake success.
- Do not add backward-compat shims to greenfield packages unless explicitly required.
- Do not claim an eval or deployment worked without verifying the live artifact.
- Do not optimize the metric while making the real user experience worse.

## Deployment / Debugging

- If a third-party deploy is opaque and you lack logs, pivot to infrastructure you control.
- A successful build-hook POST only proves the hook accepted the request, not that the build succeeded.
