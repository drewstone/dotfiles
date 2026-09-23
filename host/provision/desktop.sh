# shellcheck shell=bash disable=SC2153 # HOST_DIR comes from host/provision.sh
# desktop: GDM starts the existing gtr-kiosk session, which mirrors :1 on the
# monitor. The tangle-tools module installs the single fleet pages view on :1.

# GDM logs the user in at boot unless --no-autologin: after an unattended
# reboot, the fleet pages view and chatgpt-fleet's Chrome need a session.
AUTOLOGIN="${AUTOLOGIN:-1}"
NERD_FONTS_VERSION=v3.5.1
FONT_DIR="$HOME/.local/share/fonts/JetBrainsMonoNF"
GDM_CUSTOM=/etc/gdm3/custom.conf
KIOSK_SESSION_FILE=/usr/share/wayland-sessions/gtr-kiosk.desktop
KIOSK_LAUNCHER=/usr/local/bin/gtr-kiosk
ACCOUNTS_USER="/var/lib/AccountsService/users/${USER:-$(id -un)}"
LOGIN_KEYRING="$HOME/.local/share/keyrings/login.keyring"
VNC_UNIT="$HOME/.config/systemd/user/vnc-desktop.service"
VNC_STARTUP="$HOME/.vnc/xstartup"
VNC_PASSWD="$HOME/.vnc/passwd"
VNC_SECRET="$HOME/.config/gtr-kiosk/vnc-password"
VNC_AUTH_PENDING="$HOME/.config/gtr-kiosk/vnc-auth-pending"
REMMINA_PROFILE="$HOME/.local/share/remmina/gtr-shared.remmina"
PROXY_UNIT_SRC="${HOST_DIR:-$(dirname "${BASH_SOURCE[0]}")/..}/desktop/vnc-tailnet-proxy.service"
PROXY_UNIT="$HOME/.config/systemd/user/vnc-tailnet-proxy.service"
PROXY_COMMAND_SRC="${HOST_DIR:-$(dirname "${BASH_SOURCE[0]}")/..}/desktop/vnc-tailnet-proxy"
PROXY_COMMAND="$HOME/.local/bin/gtr-vnc-tailnet-proxy"

# Old display units need a scheduled swap. Detect their files even when the
# user manager is down, and never repair the new desktop over an old view.
legacy_view_present() {
  local unit path
  for unit in gtr-pages gtr-desktop fleet-wall; do
    for path in "$HOME/.config/systemd/user/$unit.service" \
      "$HOME/.config/systemd/user/vnc-desktop.service.wants/$unit.service" \
      "$HOME/.config/systemd/user/graphical-session.target.wants/$unit.service"; do
      if [ -e "$path" ] || [ -L "$path" ]; then return 0; fi
    done
    user_bus || true
    systemctl --user is-enabled --quiet "$unit.service" 2>/dev/null && return 0
  done
  return 1
}

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
# Runs only once the replacement :1 view is enabled.
drop_old_autostart() {
  # Never leave the desktop with no view: the replacement must start with :1 first.
  user_bus || true
  if legacy_view_present ||
     ! systemctl --user is-enabled --quiet fleet-pages.service 2>/dev/null ||
     ! systemctl --user is-enabled --quiet vnc-desktop.service 2>/dev/null; then
    printf 'fleet-pages.service and vnc-desktop.service must be enabled without legacy views before removing the old autostart\n' >&2
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

vnc_auth_ready() {
  [ ! -e "$VNC_AUTH_PENDING" ] &&
    [ -s "$VNC_PASSWD" ] && [ -s "$REMMINA_PROFILE" ] &&
    grep -Eq '^password=.+$' "$REMMINA_PROFILE" &&
    [ "$(stat -c %a "$VNC_PASSWD" 2>/dev/null)" = 600 ] &&
    [ "$(stat -c %a "$REMMINA_PROFILE" 2>/dev/null)" = 600 ] || return 1
  [ ! -f "$VNC_SECRET" ] && return 0
  [ "$(stat -c %a "$VNC_SECRET" 2>/dev/null)" = 600 ] &&
    cmp -s <(vncpasswd -f <"$VNC_SECRET") "$VNC_PASSWD"
}

vnc_session_ready() { [ -x "$VNC_STARTUP" ] && vnc_auth_ready; }

setup_vnc_auth() {
  local assets="${HOST_DIR:-$(dirname "${BASH_SOURCE[0]}")/..}/desktop" stage
  mkdir -p "${VNC_SECRET%/*}" "${VNC_PASSWD%/*}" "${REMMINA_PROFILE%/*}" || return 1
  chmod 0700 "${VNC_SECRET%/*}" "${VNC_PASSWD%/*}" || return 1
  if [ ! -f "$VNC_SECRET" ]; then
    [ ! -e "$VNC_AUTH_PENDING" ] || {
      printf 'pending VNC credential migration has no stored secret; preserving existing files\n' >&2
      return 1
    }
    if [ -s "$VNC_PASSWD" ] && [ -s "$REMMINA_PROFILE" ] &&
       grep -Eq '^password=.+$' "$REMMINA_PROFILE"; then
      chmod 0600 "$VNC_PASSWD" "$REMMINA_PROFILE"
      return $?
    fi
    if [ -e "$VNC_PASSWD" ] || [ -e "$REMMINA_PROFILE" ]; then
      printf 'existing VNC credentials need an explicit migration; preserving them\n' >&2
      return 1
    fi
    # VncAuth uses the first eight bytes. Keep the generated value so the Mac
    # can use the same credential without displaying it during provisioning.
    (umask 077; openssl rand -base64 6 >"$VNC_SECRET") || return 1
  fi
  [ -s "$VNC_SECRET" ] || { printf 'stored VNC secret is empty\n' >&2; return 1; }
  [ "$(stat -c %a "$VNC_SECRET" 2>/dev/null)" = 600 ] || chmod 0600 "$VNC_SECRET" || return 1
  stage="$(mktemp -d "${VNC_SECRET%/*}/auth.XXXXXX")" || return 1
  (umask 077; : >"$VNC_AUTH_PENDING") || { rm -r -- "$stage"; return 1; }
  if [ -f "$REMMINA_PROFILE" ]; then
    cp "$REMMINA_PROFILE" "$stage/old-profile.remmina" || { rm -r -- "$stage"; return 1; }
    cp "$REMMINA_PROFILE" "$stage/profile.remmina" || { rm -r -- "$stage"; return 1; }
  else
    install -m 0600 "$assets/gtr-shared.remmina" "$stage/profile.remmina" || { rm -r -- "$stage"; return 1; }
  fi
  # Stage both files before replacing either. The password never enters argv.
  if ! remmina --update-profile "$stage/profile.remmina" --set-option password \
       <"$VNC_SECRET" >/dev/null 2>&1 ||
     ! vncpasswd -f <"$VNC_SECRET" >"$stage/passwd" ||
     ! chmod 0600 "$stage/profile.remmina" "$stage/passwd"; then
    rm -r -- "$stage"
    return 1
  fi
  mv "$stage/profile.remmina" "$REMMINA_PROFILE" || { rm -r -- "$stage"; return 1; }
  if ! mv "$stage/passwd" "$VNC_PASSWD"; then
    if [ -f "$stage/old-profile.remmina" ]; then
      cp "$stage/old-profile.remmina" "$REMMINA_PROFILE" || true
    else
      rm -- "$REMMINA_PROFILE" || true
    fi
    rm -r -- "$stage" || true
    return 1
  fi
  rm -r -- "$stage" || return 1
  rm -- "$VNC_AUTH_PENDING"
}

install_vnc_startup() {
  local assets="${HOST_DIR:-$(dirname "${BASH_SOURCE[0]}")/..}/desktop"
  if [ -L "$VNC_STARTUP" ]; then
    printf 'existing VNC startup link is not executable; preserving its target\n' >&2
    return 1
  fi
  if [ -e "$VNC_STARTUP" ]; then
    [ -f "$VNC_STARTUP" ] || { printf 'existing VNC startup is not a file; preserving it\n' >&2; return 1; }
    chmod u+x "$VNC_STARTUP"
  else
    install -D -m 0755 "$assets/vnc-xstartup" "$VNC_STARTUP"
  fi
}

vnc_unit_on() {
  user_bus || true
  [ -f "$VNC_UNIT" ] && systemctl --user is-enabled --quiet vnc-desktop.service 2>/dev/null
}

install_vnc_unit() {
  local assets="${HOST_DIR:-$(dirname "${BASH_SOURCE[0]}")/..}/desktop"
  user_bus || { printf 'no session bus for %s: enable linger or log in once\n' "$USER" >&2; return 1; }
  mkdir -p "${VNC_UNIT%/*}" || return 1
  if [ ! -e "$VNC_UNIT" ] && [ ! -L "$VNC_UNIT" ]; then
    install -m 0644 "$assets/vnc-desktop.service" "$VNC_UNIT" || return 1
  fi
  systemctl --user daemon-reload && systemctl --user enable --quiet vnc-desktop.service
}

tailnet_proxy_on() {
  local wants="$HOME/.config/systemd/user/vnc-desktop.service.wants/vnc-tailnet-proxy.service"
  user_bus || true
  link_is "$PROXY_COMMAND_SRC" "$PROXY_COMMAND" && [ -x "$PROXY_COMMAND" ] &&
    link_is "$PROXY_UNIT_SRC" "$PROXY_UNIT" &&
    [ -L "$wants" ] && [ "$(readlink -f "$wants")" = "$(readlink -f "$PROXY_UNIT_SRC")" ] &&
    systemctl --user is-enabled --quiet vnc-tailnet-proxy.service 2>/dev/null
}

install_tailnet_proxy() {
  user_bus || { printf 'no session bus for %s: enable linger or log in once\n' "$USER" >&2; return 1; }
  link_into "$PROXY_COMMAND_SRC" "$PROXY_COMMAND" || return 1
  link_into "$PROXY_UNIT_SRC" "$PROXY_UNIT" || return 1
  systemctl --user daemon-reload && systemctl --user enable --force --quiet "$PROXY_UNIT_SRC"
}

install_kiosk_asset() {
  local mode="$1" src="$2" dst="$3"
  if as_root test -e "$dst"; then
    as_root cp -p "$dst" "$dst.pre-dotfiles.$(date +%Y%m%d%H%M%S%N)" || return 1
  fi
  root_install "$mode" "$src" "$dst"
}

gdm_session_on() {
  kiosk_available && awk '
    /^\[daemon\]$/ { daemon = 1; next }
    /^\[/ { daemon = 0 }
    daemon && /^[ \t]*DefaultSession[ \t]*=/ {
      count++
      if ($0 ~ /^[ \t]*DefaultSession[ \t]*=[ \t]*gtr-kiosk\.desktop[ \t]*$/) right++
    }
    daemon && /^[ \t]*WaylandEnable[ \t]*=/ {
      wayland_count++
      if ($0 ~ /^[ \t]*WaylandEnable[ \t]*=[ \t]*true[ \t]*$/) wayland_on++
    }
    END { exit !(count == 1 && right == 1 && wayland_count == 1 && wayland_on == 1) }
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
      /^[ \t]*WaylandEnable[ \t]*=/ { next }
      /^[ \t]*AutomaticLogin(Enable)?[ \t]*=/ { next }
      on == 0 && /^[ \t]*TimedLogin(Enable|Delay)?[ \t]*=/ { next }
      { print }
      $0 == "[daemon]" {
        print "DefaultSession=gtr-kiosk.desktop"
        print "WaylandEnable=true"
        if (on == 1) { print "AutomaticLoginEnable=true"; print "AutomaticLogin=" user }
      }
    ' "$GDM_CUSTOM" >"$new" || return 1
    as_root cp -p "$GDM_CUSTOM" "$GDM_CUSTOM.pre-dotfiles.$(date +%Y%m%d%H%M%S%N)" || return 1
  fi
  if ! grep -qx '\[daemon\]' "$new"; then
    printf '[daemon]\nDefaultSession=gtr-kiosk.desktop\nWaylandEnable=true\n' >>"$new"
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
  local assets="${HOST_DIR:-$(dirname "${BASH_SOURCE[0]}")/..}/desktop"
  section "desktop: GDM kiosk, NetworkManager and JetBrainsMono Nerd Font"
  if legacy_view_present; then
    skip "legacy :1 view units are present; desktop migration waits for Drew's explicit apply"
    return 0
  fi
  ensure "GDM installed" pkg_installed gdm3 -- apt_install gdm3
  ensure "NetworkManager installed for Wi-Fi" pkg_installed network-manager -- apt_install network-manager
  ensure "cage and Remmina installed for the monitor" pkg_installed cage remmina -- apt_install cage remmina
  ensure "virtual :1 desktop packages installed" pkg_installed tigervnc-standalone-server tigervnc-tools xfce4-session xfce4-panel xfwm4 xfdesktop4 xfce4-terminal dbus-x11 tmux wmctrl socat openssl -- \
    apt_install tigervnc-standalone-server tigervnc-tools xfce4-session xfce4-panel xfwm4 xfdesktop4 xfce4-terminal dbus-x11 tmux wmctrl socat openssl
  ensure "boots to graphical.target" boots_graphical -- as_root systemctl set-default graphical.target
  ensure "systemd-networkd-wait-online off (NetworkManager waits for the network)" networkd_wait_off -- \
    quiet as_root systemctl mask systemd-networkd-wait-online.service
  # The run never starts GDM: gdm.service conflicts with getty@tty1, so a run
  # from the text console would lose its screen. A reboot starts it.
  if systemctl is-active --quiet gdm; then
    ok "gdm is running"
  elif pkg_installed gdm3; then
    manual "GDM is not running yet. Reboot when the run is done; the desktop starts at boot:" \
      "sudo systemctl reboot"
  fi
  ensure "JetBrainsMono Nerd Font $NERD_FONTS_VERSION in $FONT_DIR" font_present -- install_font
  ensure "gtr-kiosk launcher installed" root_file_is 0755 "$assets/gtr-kiosk" "$KIOSK_LAUNCHER" -- \
    install_kiosk_asset 0755 "$assets/gtr-kiosk" "$KIOSK_LAUNCHER"
  ensure "gtr-kiosk GDM session installed" root_file_is 0644 "$assets/gtr-kiosk.desktop" "$KIOSK_SESSION_FILE" -- \
    install_kiosk_asset 0644 "$assets/gtr-kiosk.desktop" "$KIOSK_SESSION_FILE"
  ensure "Xfce starts on the shared :1 desktop" test -x "$VNC_STARTUP" -- \
    install_vnc_startup
  ensure "VNC and Remmina use the same stored credential" vnc_auth_ready -- setup_vnc_auth
  if ! vnc_session_ready; then
    skip "kiosk session selection waits for VNC startup and credentials"
    return 0
  fi
  ensure "shared :1 desktop starts at login" vnc_unit_on -- install_vnc_unit
  if ! vnc_unit_on; then
    skip "kiosk session selection waits for the shared desktop unit"
    return 0
  fi
  if { [ ! -e "$VNC_UNIT" ] && [ ! -L "$VNC_UNIT" ]; } ||
     cmp -s "$assets/vnc-desktop.service" "$VNC_UNIT"; then
    ensure "tailnet VNC proxy follows the shared desktop" tailnet_proxy_on -- install_tailnet_proxy
    if ! tailnet_proxy_on; then
      skip "kiosk session selection waits for the tailnet VNC proxy"
      return 0
    fi
  else
    skip "existing VNC unit retained; tailnet proxy requires the localhost-only template"
  fi
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
