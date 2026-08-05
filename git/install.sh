#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GLOBAL_HOOKS_DIR="$SCRIPT_DIR/hooks"
TEMPLATE_DIR="$SCRIPT_DIR/templates"
GLOBAL_IGNORE_FILE="$SCRIPT_DIR/gitignore_global"

chmod +x "$GLOBAL_HOOKS_DIR/pre-commit" "$GLOBAL_HOOKS_DIR/pre-push" "$GLOBAL_HOOKS_DIR/commit-msg"
chmod +x "$TEMPLATE_DIR/hooks/pre-commit" "$TEMPLATE_DIR/hooks/pre-push"

git config --global core.hooksPath "$GLOBAL_HOOKS_DIR"
git config --global init.templateDir "$TEMPLATE_DIR"

# Agent artifact dirs show up in every repo we touch, so ignore them once here
# rather than editing each repo's .gitignore. A repo's own .gitignore still
# wins for anything it lists, and `git add -f` still overrides both.
existing_excludes="$(git config --global --get core.excludesfile || true)"
if [ -n "$existing_excludes" ] && [ "$existing_excludes" != "$GLOBAL_IGNORE_FILE" ]; then
  echo "WARN core.excludesfile already set to $existing_excludes — leaving it alone."
  echo "     Merge $GLOBAL_IGNORE_FILE into it by hand, or unset and rerun."
else
  git config --global core.excludesfile "$GLOBAL_IGNORE_FILE"
fi
echo "Configured global Git hooks:"
echo "  core.hooksPath=$GLOBAL_HOOKS_DIR"
echo "  init.templateDir=$TEMPLATE_DIR"
echo "  core.excludesfile=$(git config --global --get core.excludesfile)"
echo
echo "Global baseline checks:"
echo "  pre-commit: conflict markers, suspicious secrets"
echo "  commit-msg: credentials in the commit MESSAGE (diffs scanners miss these)"
echo "  pre-push: conflict markers, mergeable with origin/main, suspicious secrets"
echo
echo "Repo-specific .ai-agent-hooks.mjs still overrides this baseline for stricter gates."
echo "Dotfiles root: $DOTFILES_ROOT"
