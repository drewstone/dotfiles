# shellcheck shell=bash
# tangle-tools: acct, fleet and chatgpt-fleet come from the tangle-tools deploy
# clone. This module runs the two install commands that tangle-tools documents
# (deploy/README.md); it never copies or reimplements those tools.

TT_REPO=git@github.com:drewstone/tangle-tools.git
TT_DIR="$HOME/.local/share/tangle-tools"

tt_installed() {
  [ -x "$TT_DIR/deploy/tangle-tools-deploy" ] && [ -L "$HOME/.local/bin/acct" ] &&
    [ -L "$HOME/.local/bin/tangle-tools-deploy" ]
}

github_ssh_ok() {
  GIT_SSH_COMMAND='ssh -o BatchMode=yes -o ConnectTimeout=10' git ls-remote "$TT_REPO" HEAD >/dev/null 2>&1
}

install_tt() {
  if ! github_ssh_ok; then
    printf 'this box cannot read %s over SSH yet (see the GitHub SSH key step)\n' "$TT_REPO" >&2
    return 1
  fi
  if [ ! -d "$TT_DIR/.git" ]; then
    git clone -q "$TT_REPO" "$TT_DIR" || return 1
  fi
  user_bus || true
  indent "$TT_DIR/deploy/tangle-tools-deploy" install
}

module_tangle_tools() {
  section "tangle-tools: acct, fleet, chatgpt-fleet (tangle-tools deploy/README.md)"
  # Before GitHub accepts this box's SSH key, the install is a step for a
  # person, not drift.
  if tt_installed || github_ssh_ok; then
    ensure "tangle-tools deploy clone and command links" tt_installed -- install_tt
    return 0
  fi
  manual "Install the tangle-tools commands after GitHub accepts this box's SSH key:" \
    "git clone $TT_REPO $TT_DIR" \
    "$TT_DIR/deploy/tangle-tools-deploy install"
}
