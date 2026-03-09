#!/usr/bin/env bash
# Install Claude Code configuration (CLAUDE.md, settings, skills, hooks)
# Usage: ./install.sh [--force]
#
# Symlinks config from this repo into ~/.claude/
# Skips project-specific skills (tangle-*, blueprint-*, sandbox-*)
# Safe to re-run — only replaces symlinks, never overwrites real files unless --force

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
FORCE="${1:-}"

link() {
  local src="$1" dst="$2"
  if [ -L "$dst" ]; then
    rm "$dst"
  elif [ -e "$dst" ]; then
    if [ "$FORCE" = "--force" ]; then
      echo "  OVERWRITE $dst"
      rm -rf "$dst"
    else
      echo "  SKIP $dst (exists, use --force to overwrite)"
      return
    fi
  fi
  ln -sf "$src" "$dst"
  echo "  LINK $dst -> $src"
}

echo "Installing Claude config from $SCRIPT_DIR"

# Global config
mkdir -p "$CLAUDE_DIR"
link "$SCRIPT_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
link "$SCRIPT_DIR/settings.json" "$CLAUDE_DIR/settings.json"

# Skills
mkdir -p "$CLAUDE_DIR/skills"
for skill_dir in "$SCRIPT_DIR/skills"/*/; do
  skill="$(basename "$skill_dir")"
  link "$skill_dir" "$CLAUDE_DIR/skills/$skill"
done

# Hooks
if [ -d "$SCRIPT_DIR/hooks" ] && [ "$(ls -A "$SCRIPT_DIR/hooks" 2>/dev/null)" ]; then
  mkdir -p "$CLAUDE_DIR/hooks"
  for hook in "$SCRIPT_DIR/hooks"/*; do
    link "$hook" "$CLAUDE_DIR/hooks/$(basename "$hook")"
  done
fi

echo ""
echo "Done. $(ls "$SCRIPT_DIR/skills" | wc -l) skills, $(ls "$SCRIPT_DIR/hooks" 2>/dev/null | wc -l) hooks installed."
echo ""
echo "Project-specific skills (tangle-*, blueprint-*, sandbox-*) are NOT included."
echo "Install those separately in the relevant project repos."
