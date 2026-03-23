#!/usr/bin/env bash
# Install tmux configuration
# Usage: ./install.sh [--force]
#
# Symlinks tmux.conf from this repo into ~/.tmux.conf
# Installs TPM if not present
# Safe to re-run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
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

echo "Installing tmux config from $SCRIPT_DIR"

# Symlink tmux.conf
link "$SCRIPT_DIR/tmux.conf" "$HOME/.tmux.conf"

# Install TPM if missing
TPM_DIR="$HOME/.tmux/plugins/tpm"
if [ ! -d "$TPM_DIR" ]; then
  echo "  Installing TPM..."
  git clone https://github.com/tmux-plugins/tpm "$TPM_DIR"
  echo "  INSTALLED $TPM_DIR"
else
  echo "  OK $TPM_DIR (exists)"
fi

# Reload tmux config if server is running
if tmux list-sessions &>/dev/null; then
  tmux source-file "$HOME/.tmux.conf" 2>/dev/null && echo "  RELOADED tmux config" || true
fi

echo ""
echo "Done. Run 'prefix + I' inside tmux to install plugins via TPM."
