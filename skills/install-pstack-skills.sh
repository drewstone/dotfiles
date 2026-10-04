#!/usr/bin/env bash
# Install the curated pstack skill set into every harness we run.
# Source of truth: ~/dotfiles/skills/pstack (vendored, MIT).
# Targets follow each harness's existing convention:
#   pi:     copies into ~/.agents/skills + symlink ~/.pi/agent/skills/<n>
#   claude: direct symlink ~/.claude/skills/<n> -> dotfiles (their pattern)
#   codex:  direct symlink ~/.codex/skills/<n> -> dotfiles (their pattern)
# Safe to re-run. Missing harness dirs are skipped.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/pstack" && pwd)"
PI_SKILLS="$HOME/.pi/agent/skills"
AGENTS_SKILLS="$HOME/.agents/skills"
CLAUDE_SKILLS="$HOME/.claude/skills"
CODEX_SKILLS="$HOME/.codex/skills"

count=0
for dir in "$SRC"/*/; do
  name=$(basename "$dir")
  count=$((count+1))

  # pi: canonical store gets a real copy; pi skills dir gets the standard symlink.
  if [ -d "$PI_SKILLS" ] || [ -d "$AGENTS_SKILLS" ]; then
    mkdir -p "$AGENTS_SKILLS" "$PI_SKILLS"
    rm -rf "$AGENTS_SKILLS/$name"
    cp -r "$dir" "$AGENTS_SKILLS/$name"
    rm -f "$PI_SKILLS/$name"
    ln -s "../../../.agents/skills/$name" "$PI_SKILLS/$name"
  fi

  # claude + codex: direct symlinks to the dotfiles source.
  for target in "$CLAUDE_SKILLS" "$CODEX_SKILLS"; do
    if [ -d "$target" ]; then
      rm -f "$target/$name"
      ln -s "$dir" "$target/$name"
    fi
  done
done

echo "installed $count skills into: pi ($([ -d "$PI_SKILLS" ] && echo yes || echo skip)), claude ($([ -d "$CLAUDE_SKILLS" ] && echo yes || echo skip)), codex ($([ -d "$CODEX_SKILLS" ] && echo yes || echo skip))"
