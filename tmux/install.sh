#!/usr/bin/env bash
# Install tmux configuration
# Usage: ./install.sh [--force] [--no-reload]
#
# Symlinks tmux.conf from this repo into ~/.tmux.conf.
# Clones TPM and every @plugin listed in tmux.conf that is not present yet,
# so tmux-resurrect exists for tmux-heal without a prefix + I in a session.
# Safe to re-run.
#
#   --force      move an existing regular ~/.tmux.conf to
#                ~/.tmux.conf.pre-dotfiles.<time>, then link
#   --no-reload  leave a running tmux server on its current settings

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FORCE=""
RELOAD=1
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --no-reload) RELOAD=0 ;;
    *) echo "usage: $0 [--force] [--no-reload]" >&2; exit 2 ;;
  esac
done

link() {
  local src="$1" dst="$2" backup
  if [ -L "$dst" ]; then
    rm "$dst"
  elif [ -e "$dst" ]; then
    if [ -n "$FORCE" ]; then
      backup="$dst.pre-dotfiles.$(date +%Y%m%d%H%M%S)"
      mv "$dst" "$backup"
      echo "  MOVED $dst -> $backup"
    else
      echo "  SKIP $dst (exists, use --force to replace it; the old file is kept)"
      return
    fi
  fi
  ln -sf "$src" "$dst"
  echo "  LINK $dst -> $src"
}

echo "Installing tmux config from $SCRIPT_DIR"

link "$SCRIPT_DIR/tmux.conf" "$HOME/.tmux.conf"

# Plugins: TPM names each plugin directory after the repository, and a
# '#ref' suffix pins a branch or tag.
PLUGIN_DIR="$HOME/.tmux/plugins"
mkdir -p "$PLUGIN_DIR"
sed -n "s/^set -g @plugin '\([^']*\)'.*/\1/p" "$SCRIPT_DIR/tmux.conf" | while read -r spec; do
  repo="${spec%%#*}"
  ref=""
  [ "$repo" != "$spec" ] && ref="${spec#*#}"
  dir="$PLUGIN_DIR/$(basename "$repo")"
  if [ -d "$dir" ]; then
    echo "  OK $dir (exists)"
    continue
  fi
  git clone -q --depth 1 ${ref:+--branch "$ref"} "https://github.com/$repo" "$dir"
  echo "  INSTALLED $dir"
done

if [ "$RELOAD" = 1 ] && tmux list-sessions &>/dev/null; then
  tmux source-file "$HOME/.tmux.conf" 2>/dev/null && echo "  RELOADED tmux config" || true
fi
