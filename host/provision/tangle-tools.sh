# shellcheck shell=bash
# tangle-tools: acct, fleet and chatgpt-fleet come from the deploy clone.
# The only shared :1 view is fleet-pages.service, owned by fleet.

TT_REPO=git@github.com:drewstone/tangle-tools.git
TT_DIR="$HOME/.local/share/tangle-tools"

tt_installed() {
  [ -x "$TT_DIR/deploy/tangle-tools-deploy" ] &&
    link_is "$TT_DIR/deploy/tangle-tools-deploy" "$HOME/.local/bin/tangle-tools-deploy" &&
    link_is "$TT_DIR/agent-accounts/acct" "$HOME/.local/bin/acct" &&
    link_is "$TT_DIR/fleet/fleet" "$HOME/.local/bin/fleet"
}

# Apply mode records GitHub's host key on first contact (accept-new). Check
# mode must write nothing, so it uses "yes": an unknown key then reads as "no
# access yet". "no" would add the key to ~/.ssh/known_hosts and would also
# connect to a host whose key changed.
github_ssh_ok() {
  local accept=yes
  checking || accept='accept-new'
  GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=$accept" \
    git ls-remote "$TT_REPO" HEAD >/dev/null 2>&1
}

install_tt() {
  if ! github_ssh_ok; then
    printf 'this box cannot read %s over SSH yet (see the GitHub SSH key step)\n' "$TT_REPO" >&2
    return 1
  fi
  if [ ! -d "$TT_DIR/.git" ]; then
    git clone -q "$TT_REPO" "$TT_DIR" || return 1
  else
    # The old installer can fetch new code but still runs its old LINKS list.
    # Update first, then execute the installer from the new checkout.
    indent "$TT_DIR/deploy/tangle-tools-deploy" update || return 1
  fi
  user_bus || true
  indent "$TT_DIR/deploy/tangle-tools-deploy" install
}

PAGES_UNIT_SRC="$TT_DIR/fleet/systemd/fleet-pages.service"
PAGES_UNIT="$HOME/.config/systemd/user/fleet-pages.service"

pages_unit_on() {
  local wants="$HOME/.config/systemd/user/vnc-desktop.service.wants/fleet-pages.service"
  user_bus || true
  vnc_session_ready &&
    link_is "$PAGES_UNIT_SRC" "$PAGES_UNIT" &&
    [ -L "$wants" ] && [ "$(readlink -f "$wants")" = "$(readlink -f "$PAGES_UNIT_SRC")" ] &&
    systemctl --user is-enabled --quiet fleet-pages.service 2>/dev/null &&
    systemctl --user is-enabled --quiet vnc-desktop.service 2>/dev/null
}

install_pages_unit() {
  legacy_view_present && {
    printf 'legacy view units need the explicit fleet-pages apply step\n' >&2
    return 1
  }
  [ -f "$PAGES_UNIT_SRC" ] || { printf '%s is missing; update the deploy clone first\n' "$PAGES_UNIT_SRC" >&2; return 1; }
  if ! vnc_session_ready; then
    printf 'the shared VNC startup and credentials must be ready before enabling fleet-pages\n' >&2
    return 1
  fi
  user_bus || { printf 'no session bus for %s: enable linger or log in once\n' "$USER" >&2; return 1; }
  vnc_unit_on || install_vnc_unit || return 1
  link_into "$PAGES_UNIT_SRC" "$PAGES_UNIT" || return 1
  systemctl --user daemon-reload && systemctl --user enable --force --quiet "$PAGES_UNIT_SRC"
}

module_tangle_tools() {
  section "tangle-tools: acct, fleet, chatgpt-fleet (tangle-tools deploy/README.md)"
  # Before GitHub accepts this box's SSH key, the install is a step for a
  # person, not drift.
  if tt_installed || github_ssh_ok; then
    ensure "tangle-tools deploy clone and command links" tt_installed -- install_tt
    if legacy_view_present; then
      skip "legacy :1 view units are present; fleet-pages migration waits for Drew's explicit apply"
    else
      ensure "single fleet pages view starts with :1 ($PAGES_UNIT -> deploy clone)" pages_unit_on -- install_pages_unit
      ensure "no old Ghostty autostart" no_old_autostart -- drop_old_autostart
    fi
    return 0
  fi
  manual_after_signin "Install the tangle-tools commands after GitHub accepts this box's SSH key:" \
    "git clone $TT_REPO $TT_DIR" \
    "$TT_DIR/deploy/tangle-tools-deploy install"
}
