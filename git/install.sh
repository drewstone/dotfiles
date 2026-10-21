#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GLOBAL_HOOKS_DIR="$SCRIPT_DIR/hooks"
TEMPLATE_DIR="$SCRIPT_DIR/templates"
GLOBAL_IGNORE_FILE="$SCRIPT_DIR/gitignore_global"
GLOBAL_ATTRIBUTES_FILE="$SCRIPT_DIR/gitattributes_global"

chmod +x "$GLOBAL_HOOKS_DIR/pre-commit" "$GLOBAL_HOOKS_DIR/pre-push" "$GLOBAL_HOOKS_DIR/commit-msg" "$GLOBAL_HOOKS_DIR/loc-ratchet" "$GLOBAL_HOOKS_DIR/doc-ref-ratchet" "$GLOBAL_HOOKS_DIR/dup-export-ratchet" "$GLOBAL_HOOKS_DIR/ratchets"
chmod +x "$TEMPLATE_DIR/hooks/pre-commit" "$TEMPLATE_DIR/hooks/pre-push"

# Write a global setting only when it changes, so a host whose ~/.gitconfig is
# locked (gtr's is immutable) reinstalls without touching it.
set_global() {
  [ "$(git config --global --get "$1" || true)" = "$2" ] || git config --global "$1" "$2"
}
set_global core.hooksPath "$GLOBAL_HOOKS_DIR"
set_global init.templateDir "$TEMPLATE_DIR"

# Agent artifact dirs show up in every repo we touch, so ignore them once here
# rather than editing each repo's .gitignore. A repo's own .gitignore still
# wins for anything it lists, and `git add -f` still overrides both.
existing_excludes="$(git config --global --get core.excludesfile || true)"
if [ -n "$existing_excludes" ] && [ "$existing_excludes" != "$GLOBAL_IGNORE_FILE" ]; then
  echo "WARN core.excludesfile already set to $existing_excludes — leaving it alone."
  echo "     Merge $GLOBAL_IGNORE_FILE into it by hand, or unset and rerun."
else
  set_global core.excludesfile "$GLOBAL_IGNORE_FILE"
fi
# Agent ledgers merge by union on every branch, including branches cut before a
# repository's .gitattributes named them. A repo's own .gitattributes still wins.
existing_attributes="$(git config --global --get core.attributesFile || true)"
if [ -n "$existing_attributes" ] && [ "$existing_attributes" != "$GLOBAL_ATTRIBUTES_FILE" ]; then
  echo "WARN core.attributesFile already set to $existing_attributes — leaving it alone."
  echo "     Merge $GLOBAL_ATTRIBUTES_FILE into it by hand, or unset and rerun."
elif ! set_global core.attributesFile "$GLOBAL_ATTRIBUTES_FILE" 2>/dev/null; then
  # A locked global config (gtr's ~/.gitconfig is immutable): Git reads the XDG
  # attributes file by default while core.attributesFile is unset.
  xdg_attributes="${XDG_CONFIG_HOME:-$HOME/.config}/git/attributes"
  if [ -e "$xdg_attributes" ] && [ ! -L "$xdg_attributes" ]; then
    echo "WARN $xdg_attributes exists and the global config is not writable — merge $GLOBAL_ATTRIBUTES_FILE into it by hand."
  else
    mkdir -p "$(dirname "$xdg_attributes")"
    ln -sfn "$GLOBAL_ATTRIBUTES_FILE" "$xdg_attributes"
    echo "  linked $xdg_attributes (the global config is not writable)"
  fi
fi
echo "== worktree reaper"
"$SCRIPT_DIR/worktree-reaper/install.sh"
echo "== main checkout fast-forward"
"$SCRIPT_DIR/main-checkout-ff/install.sh"
echo

echo "Configured global Git hooks:"
echo "  core.hooksPath=$GLOBAL_HOOKS_DIR"
echo "  init.templateDir=$TEMPLATE_DIR"
echo "  core.excludesfile=$(git config --global --get core.excludesfile)"
echo "  core.attributesFile=$(git config --global --get core.attributesFile)"
echo
echo "Global baseline checks:"
echo "  pre-commit: conflict markers, suspicious secrets, logic files over 1,000 lines (loc-ratchet), docs naming moved or deleted files (doc-ref-ratchet), a second export of an existing name (dup-export-ratchet)"
echo "  commit-msg: credentials in the commit MESSAGE (diffs scanners miss these)"
echo "  pre-push: conflict markers, mergeable with origin/main, suspicious secrets"
echo
echo "Repo-specific .ai-agent-hooks.mjs still overrides this baseline for stricter gates."
echo "Dotfiles root: $DOTFILES_ROOT"
