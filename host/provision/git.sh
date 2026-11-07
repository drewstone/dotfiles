# shellcheck shell=bash
# git: global hooks, template and ignore file from git/install.sh.

git_hooks_current() {
  [ "$(git config --global --get core.hooksPath 2>/dev/null)" = "$DOTFILES/git/hooks" ] &&
    [ "$(git config --global --get init.templateDir 2>/dev/null)" = "$DOTFILES/git/templates" ]
}

module_git() {
  section "git: global hooks and ignore file (git/install.sh)"
  ensure "global Git hooks point into $DOTFILES/git" git_hooks_current -- quiet bash "$DOTFILES/git/install.sh"
  if [ -z "$(git config --global --get user.email 2>/dev/null)" ]; then
    manual "Git has no identity on this box. Set the owner's (kept out of this public repo):" \
      "git config --global user.email <owner email> && git config --global user.name '<owner name>' && git config --global dotfiles.ownerEmail <owner email>"
  fi
}
