# Claude Code

@AGENTS.md

The dotfiles repository owns this configuration.
Resolve installed symlinks to find the active source checkout before editing or reinstalling.
Shared behavior belongs in `AGENTS.md`; this file contains Claude-specific guidance.

`claude/install.sh` owns the installation paths for instructions, skills, commands, hooks, and tools.
Read it when changing installation behavior instead of maintaining a second path catalog here.
Install from a durable checkout that will remain available while its links are in use.
Preserve unrelated settings, external skills, and active work when updating managed links.
Portable settings live in the source `claude/settings.json`; machine-specific settings live in `~/.claude/settings.local.json`.

@RTK.md
