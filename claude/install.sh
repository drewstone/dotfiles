#!/usr/bin/env bash
# Install Claude Code configuration (CLAUDE.md, settings, skills, hooks, commands)
# Usage: ./install.sh [--force]
#
# Symlinks config from this repo into ~/.claude/
# Generates platform-specific settings.local.json (trustedDirectories)
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

# Skills (only real directories, skip broken symlinks)
mkdir -p "$CLAUDE_DIR/skills"
for skill_dir in "$SCRIPT_DIR/skills"/*/; do
  [ -d "$skill_dir" ] || continue
  skill="$(basename "$skill_dir")"
  link "$skill_dir" "$CLAUDE_DIR/skills/$skill"
done

# Commands
if [ -d "$SCRIPT_DIR/commands" ] && [ "$(ls -A "$SCRIPT_DIR/commands" 2>/dev/null)" ]; then
  mkdir -p "$CLAUDE_DIR/commands"
  for cmd in "$SCRIPT_DIR/commands"/*; do
    [ -f "$cmd" ] || continue
    link "$cmd" "$CLAUDE_DIR/commands/$(basename "$cmd")"
  done
fi

# Hooks
if [ -d "$SCRIPT_DIR/hooks" ] && [ "$(ls -A "$SCRIPT_DIR/hooks" 2>/dev/null)" ]; then
  mkdir -p "$CLAUDE_DIR/hooks"
  for hook in "$SCRIPT_DIR/hooks"/*; do
    [ -f "$hook" ] || continue
    link "$hook" "$CLAUDE_DIR/hooks/$(basename "$hook")"
  done
fi

# Platform-specific settings.local.json (trustedDirectories)
LOCAL_SETTINGS="$CLAUDE_DIR/settings.local.json"
if [ ! -e "$LOCAL_SETTINGS" ]; then
  echo ""
  echo "Generating platform-specific settings.local.json..."
  case "$(uname -s)" in
    Darwin)
      cat > "$LOCAL_SETTINGS" <<'MACOS'
{
  "trustedDirectories": [
    "/Users/drew",
    "/Users/drew/webb",
    "/Users/drew/code",
    "/tmp"
  ]
}
MACOS
      echo "  CREATED $LOCAL_SETTINGS (macOS)"
      ;;
    Linux)
      cat > "$LOCAL_SETTINGS" <<'LINUX'
{
  "trustedDirectories": [
    "/home/drew",
    "/home/drew/code",
    "/home/drew/webb",
    "/home/drew/tools",
    "/tmp"
  ]
}
LINUX
      echo "  CREATED $LOCAL_SETTINGS (Linux)"
      ;;
    *)
      echo "  SKIP settings.local.json (unknown platform: $(uname -s))"
      ;;
  esac
else
  echo "  SKIP $LOCAL_SETTINGS (exists)"
fi

# Clean up stale symlinks in skills, commands, hooks
for dir in "$CLAUDE_DIR/skills" "$CLAUDE_DIR/commands" "$CLAUDE_DIR/hooks"; do
  [ -d "$dir" ] || continue
  find "$dir" -maxdepth 1 -type l ! -exec test -e {} \; -print | while read -r stale; do
    echo "  PRUNE $stale (dead symlink)"
    rm "$stale"
  done
done

# Summary
skill_count=$(find "$SCRIPT_DIR/skills" -maxdepth 1 -type d ! -name skills | wc -l | tr -d ' ')
cmd_count=$(find "$SCRIPT_DIR/commands" -type f 2>/dev/null | wc -l | tr -d ' ')
hook_count=$(find "$SCRIPT_DIR/hooks" -type f 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "Done. ${skill_count} skills, ${cmd_count} commands, ${hook_count} hooks installed."
