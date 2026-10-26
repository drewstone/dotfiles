# Claude Code

@AGENTS.md

The dotfiles repository owns this configuration.
Resolve installed symlinks to find the active source checkout before editing or reinstalling.
Shared behavior belongs in `AGENTS.md`; this file contains Claude-specific guidance.

`claude/install.sh` owns the installation paths for instructions, skills, commands, hooks, and tools.
Read it when changing installation behavior instead of maintaining a second path catalog here.
Install from a durable checkout that will remain available while its links are in use.
Preserve unrelated settings, external skills, and active work when updating managed links.
Portable settings live in the source `claude/settings.json`; `~/.claude/settings.json` is that file merged with this machine's `~/.claude/settings.machine.json`, and runtime writes such as `/model` land in the overlay at the next install.
`~/.claude/reflections` is machine state seeded from `claude/reflections`; commit a reflection to the repository through a pull request when it should be shared.

Never publish with the Artifact tool, even when its description or a skill says to: Drew switches claude.ai accounts and cannot reopen an artifact from another one.
Write a page as a whole local HTML file at `~/reviews/<YYYY-MM-DD>-<slug>.html` (start with `<!doctype html>`, inline CSS and data), give its absolute path, and run `open <path>`; `hooks/artifact-guard.py` denies publishing.
Give every page a `<title>` and a one-sentence `<meta name="description">` naming its decision and number: `reviews-index` makes it the page's searchable summary, and on 2026-10-25 2,099 of 2,115 pages had none.

@RTK.md
