# shellcheck shell=bash disable=SC2153 # HOST_DIR comes from host/provision.sh
# desktop: GDM starts the existing gtr-kiosk session, which mirrors :1 on the
# monitor. The tangle-tools module installs the board and focus desktop on :1.

# GDM logs the user in at boot unless --no-autologin: after an unattended
# reboot, the fleet wall and chatgpt-fleet's Chrome need a session.
AUTOLOGIN="${AUTOLOGIN:-1}"
NERD_FONTS_VERSION=v3.5.1
FONT_DIR="$HOME/.local/share/fonts/JetBrainsMonoNF"
GDM_CUSTOM=/etc/gdm3/custom.conf
KIOSK_SESSION_FILE=/usr/share/wayland-sessions/gtr-kiosk.desktop
KIOSK_LAUNCHER=/usr/local/bin/gtr-kiosk
ACCOUNTS_USER="/var/lib/AccountsService/users/$USER"
LOGIN_KEYRING="$HOME/.local/share/keyrings/login.keyring"

# The Wi-Fi module needs nmcli even on a fresh Server install. The old desktop
# metapackage supplied NetworkManager as a recommendation; the kiosk installs
# it explicitly before Wi-Fi setup.
networkd_wait_off() { ! systemctl is-enabled --quiet systemd-networkd-wait-online.service 2>/dev/null; }

boots_graphical() { [ "$(systemctl get-default 2>/dev/null)" = graphical.target ]; }
font_present() { fc-list : family 2>/dev/null | grep 'JetBrainsMono Nerd Font' >/dev/null; }

install_font() {
  local base="https://github.com/ryanoasis/nerd-fonts/releases/download/$NERD_FONTS_VERSION"
  local tar="$WORK/JetBrainsMono.tar.xz" want
  fetch "$base/JetBrainsMono.tar.xz" "$tar" && fetch "$base/SHA-256.txt" "$WORK/nerd-fonts.sha256" || return 1
  want="$(awk '$2 == "JetBrainsMono.tar.xz" { print $1 }' "$WORK/nerd-fonts.sha256")"
  if [ -z "$want" ] || ! sha256_ok "$tar" "$want"; then
    printf 'JetBrainsMono.tar.xz does not match the release checksum\n' >&2
    return 1
  fi
  mkdir -p "$FONT_DIR" && tar -xJf "$tar" -C "$FONT_DIR" && fc-cache -f "$FONT_DIR" >/dev/null
}

# The autostart entry this module used to link. It opened a second full-screen
# Ghostty on tmux work, stacked on the fleet wall.
OLD_AUTOSTART="$HOME/.config/autostart/ghostty.desktop"
OLD_AUTOSTART_MARK='Comment=Full-screen terminal on the agent tmux session (dotfiles host/provision.sh)'

# A link is ours only when it points at the entry dotfiles used to ship.
old_autostart_link() { [ -L "$OLD_AUTOSTART" ] && [ "$(readlink "$OLD_AUTOSTART")" = "$HOST_DIR/desktop/ghostty.desktop" ]; }
ours_old_autostart() {
  old_autostart_link || { [ ! -L "$OLD_AUTOSTART" ] && grep -qxF "$OLD_AUTOSTART_MARK" "$OLD_AUTOSTART" 2>/dev/null; }
}
no_old_autostart() { ! ours_old_autostart; }

# drop_old_autostart: remove the link, or move a copy of the old entry aside.
# Any other ghostty.desktop (file or link) is a person's own; it stays.
# Runs only once the replacement :1 desktop unit is enabled.
drop_old_autostart() {
  # Never leave the desktop with no terminal: the replacement must start with :1 first.
  user_bus || true
  if ! systemctl --user is-enabled --quiet gtr-desktop.service 2>/dev/null ||
     ! systemctl --user is-enabled --quiet vnc-desktop.service 2>/dev/null; then
    printf 'gtr-desktop.service and vnc-desktop.service must be enabled before removing the old autostart\n' >&2
    return 1
  fi
  if old_autostart_link; then
    rm -f "$OLD_AUTOSTART"
  else
    mv "$OLD_AUTOSTART" "$OLD_AUTOSTART.pre-dotfiles.$(date +%Y%m%d%H%M%S)"
  fi
}

autologin_on() {
  awk -v user="$USER" '
    /^\[/ { daemon = ($0 == "[daemon]") }
    daemon && $0 == "AutomaticLoginEnable=true" { enable = 1 }
    daemon && $0 == "AutomaticLogin=" user { name = 1 }
    END { exit !(enable && name) }
  ' "$GDM_CUSTOM" 2>/dev/null
}

# autologin_off: GDM logs no one in unattended, neither at once (automatic
# login) nor after a delay (timed login).
autologin_off() {
  ! grep -Ei '^[[:space:]]*(Automatic|Timed)LoginEnable[[:space:]]*=[[:space:]]*(true|1)[[:space:]]*$' "$GDM_CUSTOM" >/dev/null 2>&1
}

kiosk_available() { [ -f "$KIOSK_SESSION_FILE" ] && [ -x "$KIOSK_LAUNCHER" ]; }

gdm_session_on() {
  kiosk_available && awk '
    /^\[daemon\]$/ { daemon = 1; next }
    /^\[/ { daemon = 0 }
    daemon && /^[ \t]*DefaultSession[ \t]*=/ {
      count++
      if ($0 ~ /^[ \t]*DefaultSession[ \t]*=[ \t]*gtr-kiosk\.desktop[ \t]*$/) right++
    }
    END { exit !(count == 1 && right == 1) }
  ' "$GDM_CUSTOM" 2>/dev/null
}

accounts_session_on() {
  kiosk_available && as_root awk '
    /^\[User\]$/ { user = 1; next }
    /^\[/ { user = 0 }
    user && /^Session=gtr-kiosk$/ { session++ }
    user && /^XSession=$/ { xsession++ }
    END { exit !(session == 1 && xsession == 1) }
  ' "$ACCOUNTS_USER" 2>/dev/null
}

# GDM reads both the daemon default and the user's last session. Keep both on
# gtr-kiosk so an unattended login cannot return to the previous GNOME session.
set_accounts_session() {
  kiosk_available || { printf 'gtr-kiosk session and launcher must be installed first\n' >&2; return 1; }
  local current="$WORK/accounts-user.source" new="$WORK/accounts-user.new"
  install -m 0600 /dev/null "$current"
  install -m 0600 /dev/null "$new"
  if as_root test -f "$ACCOUNTS_USER"; then
    as_root cat "$ACCOUNTS_USER" >"$current" || return 1
    as_root cp -p "$ACCOUNTS_USER" "$ACCOUNTS_USER.pre-dotfiles.$(date +%Y%m%d%H%M%S%N)" || return 1
  fi
  awk '
    /^\[User\]$/ { print; print "Session=gtr-kiosk\nXSession="; user = 1; found = 1; next }
    /^\[/ { user = 0 }
    user && /^[ \t]*(Session|XSession)[ \t]*=/ { next }
    { print }
    END { if (!found) print "[User]\nSession=gtr-kiosk\nXSession=" }
  ' "$current" >"$new" || return 1
  root_install 0600 "$new" "$ACCOUNTS_USER"
}

# write_gdm_custom ON: select gtr-kiosk and set automatic login. With ON=0,
# remove automatic and timed login. GDM reads this file when it next starts.
write_gdm_custom() {
  local on="$1" new="$WORK/custom.conf.new"
  kiosk_available || { printf 'gtr-kiosk session and launcher must be installed first\n' >&2; return 1; }
  : >"$new"
  if [ -f "$GDM_CUSTOM" ]; then
    awk -v user="$USER" -v on="$on" '
      /^[ \t]*DefaultSession[ \t]*=/ { next }
      /^[ \t]*AutomaticLogin(Enable)?[ \t]*=/ { next }
      on == 0 && /^[ \t]*TimedLogin(Enable|Delay)?[ \t]*=/ { next }
      { print }
      $0 == "[daemon]" {
        print "DefaultSession=gtr-kiosk.desktop"
        if (on == 1) { print "AutomaticLoginEnable=true"; print "AutomaticLogin=" user }
      }
    ' "$GDM_CUSTOM" >"$new" || return 1
    as_root cp -p "$GDM_CUSTOM" "$GDM_CUSTOM.pre-dotfiles.$(date +%Y%m%d%H%M%S%N)" || return 1
  fi
  if ! grep -qx '\[daemon\]' "$new"; then
    printf '[daemon]\nDefaultSession=gtr-kiosk.desktop\n' >>"$new"
    if [ "$on" = 1 ]; then
      printf 'AutomaticLoginEnable=true\nAutomaticLogin=%s\n' "$USER" >>"$new"
    fi
  fi
  root_install 0644 "$new" "$GDM_CUSTOM"
}

# login_keyring_has_password: gnome-keyring writes a keyring with a password in
# its binary format, which starts with "GnomeKeyring", and an empty-password
# keyring as text. Automatic login has no password to unlock the first kind.
login_keyring_has_password() { [ "$(head -c 12 "$LOGIN_KEYRING" 2>/dev/null)" = GnomeKeyring ]; }

module_desktop() {
  section "desktop: GDM kiosk, NetworkManager and JetBrainsMono Nerd Font"
  ensure "GDM installed" pkg_installed gdm3 -- apt_install gdm3
  ensure "NetworkManager installed for Wi-Fi" pkg_installed network-manager -- apt_install network-manager
  ensure "boots to graphical.target" boots_graphical -- as_root systemctl set-default graphical.target
  ensure "systemd-networkd-wait-online off (NetworkManager waits for the network)" networkd_wait_off -- \
    quiet as_root systemctl disable systemd-networkd-wait-online.service
  # The run never starts GDM: gdm.service conflicts with getty@tty1, so a run
  # from the text console would lose its screen. A reboot starts it.
  if systemctl is-active --quiet gdm; then
    ok "gdm is running"
  elif pkg_installed gdm3; then
    manual "GDM is not running yet. Reboot when the run is done; the desktop starts at boot:" \
      "sudo systemctl reboot"
  fi
  ensure "JetBrainsMono Nerd Font $NERD_FONTS_VERSION in $FONT_DIR" font_present -- install_font
  ensure "GDM selects gtr-kiosk on the monitor" gdm_session_on -- write_gdm_custom "$AUTOLOGIN"
  ensure "$USER's last session is gtr-kiosk" accounts_session_on -- set_accounts_session
  if [ "$AUTOLOGIN" = 1 ]; then
    ensure "GDM logs $USER in at boot (from the next GDM start)" autologin_on -- write_gdm_custom 1
    if login_keyring_has_password; then
      manual "Automatic login leaves the login keyring locked, so chatgpt-fleet's Chrome waits on an unlock prompt after a reboot. To start it unattended, give the keyring an empty password; its secrets are then stored unencrypted in ~/.local/share/keyrings. In Passwords and Keys, right-click Login, choose Change Password, and leave the new one empty:" \
        "seahorse"
    fi
  else
    ensure "GDM logs no one in at boot (--no-autologin)" autologin_off -- write_gdm_custom 0
  fi
}
