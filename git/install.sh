#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GLOBAL_HOOKS_DIR="$SCRIPT_DIR/hooks"
TEMPLATE_DIR="$SCRIPT_DIR/templates"

chmod +x "$GLOBAL_HOOKS_DIR/pre-commit" "$GLOBAL_HOOKS_DIR/pre-push"
chmod +x "$TEMPLATE_DIR/hooks/pre-commit" "$TEMPLATE_DIR/hooks/pre-push"

git config --global core.hooksPath "$GLOBAL_HOOKS_DIR"
git config --global init.templateDir "$TEMPLATE_DIR"

echo "Configured global Git hooks:"
echo "  core.hooksPath=$GLOBAL_HOOKS_DIR"
echo "  init.templateDir=$TEMPLATE_DIR"
echo
echo "Global baseline checks:"
echo "  pre-commit: conflict markers, suspicious secrets"
echo "  pre-push: conflict markers, mergeable with origin/main, suspicious secrets"
echo
echo "Repo-specific .ai-agent-hooks.mjs still overrides this baseline for stricter gates."
echo "Dotfiles root: $DOTFILES_ROOT"
