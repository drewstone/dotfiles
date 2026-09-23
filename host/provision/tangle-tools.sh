# shellcheck shell=bash
# tangle-tools: acct, fleet, the shared :1 desktop and chatgpt-fleet come from the
# tangle-tools deploy clone. This module runs the two install commands that tangle-tools documents
# (deploy/README.md); it never copies or reimplements those tools.

TT_REPO=git@github.com:drewstone/tangle-tools.git
TT_DIR="$HOME/.local/share/tangle-tools"

tt_installed() {
  [ -x "$TT_DIR/deploy/tangle-tools-deploy" ] && [ -L "$HOME/.local/bin/acct" ] &&
    [ -L "$HOME/.local/bin/tangle-tools-deploy" ] &&
    link_is "$TT_DIR/fleet/gtr-desktop" "$HOME/.local/bin/gtr-desktop"
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
    # The old installer can fetch new code but still runs its old in-memory LINKS list.
    # Update first, then execute the installer from the new checkout.
    indent "$TT_DIR/deploy/tangle-tools-deploy" update || return 1
  fi
  user_bus || true
  indent "$TT_DIR/deploy/tangle-tools-deploy" install
}

# Both kiosk units run from the deploy clone. vnc-desktop.service starts them
# with the shared :1 display; the wall unit never opens a Ghostty window.
WALL_UNIT_SRC="$TT_DIR/fleet/systemd/fleet-wall.service"
WALL_UNIT="$HOME/.config/systemd/user/fleet-wall.service"
DESKTOP_UNIT_SRC="$TT_DIR/fleet/systemd/gtr-desktop.service"
DESKTOP_UNIT="$HOME/.config/systemd/user/gtr-desktop.service"

wall_unit_on() {
  user_bus || true
  link_is "$WALL_UNIT_SRC" "$WALL_UNIT" && systemctl --user is-enabled --quiet fleet-wall.service 2>/dev/null
}

install_wall_unit() {
  [ -f "$WALL_UNIT_SRC" ] || { printf '%s is missing; update the deploy clone first\n' "$WALL_UNIT_SRC" >&2; return 1; }
  link_into "$WALL_UNIT_SRC" "$WALL_UNIT" || return 1
  user_bus || { printf 'no session bus for %s: enable linger or log in once\n' "$USER" >&2; return 1; }
  systemctl --user daemon-reload && systemctl --user enable --quiet fleet-wall.service
}

desktop_unit_on() {
  user_bus || true
  link_is "$DESKTOP_UNIT_SRC" "$DESKTOP_UNIT" &&
    systemctl --user is-enabled --quiet gtr-desktop.service 2>/dev/null &&
    systemctl --user is-enabled --quiet vnc-desktop.service 2>/dev/null
}

install_desktop_unit() {
  [ -f "$DESKTOP_UNIT_SRC" ] || { printf '%s is missing; update the deploy clone first\n' "$DESKTOP_UNIT_SRC" >&2; return 1; }
  user_bus || { printf 'no session bus for %s: enable linger or log in once\n' "$USER" >&2; return 1; }
  if ! systemctl --user is-enabled --quiet vnc-desktop.service 2>/dev/null; then
    systemctl --user enable --quiet vnc-desktop.service || {
      printf 'vnc-desktop.service must be installed before the shared desktop\n' >&2
      return 1
    }
  fi
  link_into "$DESKTOP_UNIT_SRC" "$DESKTOP_UNIT" || return 1
  systemctl --user daemon-reload && systemctl --user enable --quiet gtr-desktop.service
}

module_tangle_tools() {
  section "tangle-tools: acct, fleet, chatgpt-fleet (tangle-tools deploy/README.md)"
  # Before GitHub accepts this box's SSH key, the install is a step for a
  # person, not drift.
  if tt_installed || github_ssh_ok; then
    ensure "tangle-tools deploy clone and command links" tt_installed -- install_tt
    ensure "fleet wall starts with :1 ($WALL_UNIT -> deploy clone)" wall_unit_on -- install_wall_unit
    ensure "shared desktop starts with :1 ($DESKTOP_UNIT -> deploy clone)" desktop_unit_on -- install_desktop_unit
    return 0
  fi
  manual_after_signin "Install the tangle-tools commands after GitHub accepts this box's SSH key:" \
    "git clone $TT_REPO $TT_DIR" \
    "$TT_DIR/deploy/tangle-tools-deploy install"
}
