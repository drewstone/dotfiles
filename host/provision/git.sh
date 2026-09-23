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
    manual "Git has no identity on this box. Set the one Drew uses everywhere:" \
      "git config --global user.email drewstone329@gmail.com && git config --global user.name 'Drew Stone'"
  fi
}
