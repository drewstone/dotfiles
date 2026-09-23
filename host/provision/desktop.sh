# shellcheck shell=bash disable=SC2153 # HOST_DIR comes from host/provision.sh
# desktop: GNOME on boot, Ghostty with its config, and the JetBrainsMono Nerd
# Font it draws with. The fleet wall (tangle-tools module) is the only Ghostty
# window that opens at login; the snap's own launcher still opens tmux work.

# GDM logs the user in at boot unless --no-autologin: after an unattended
# reboot, the fleet wall and chatgpt-fleet's Chrome need a session.
AUTOLOGIN="${AUTOLOGIN:-1}"
NERD_FONTS_VERSION=v3.5.1
FONT_DIR="$HOME/.local/share/fonts/JetBrainsMonoNF"
GDM_CUSTOM=/etc/gdm3/custom.conf
LOGIN_KEYRING="$HOME/.local/share/keyrings/login.keyring"

# Ubuntu Desktop waits for the network through NetworkManager only. On a
# Server install the desktop packages make NetworkManager netplan's renderer
# from the next boot (/usr/lib/netplan/00-network-manager-all.yaml), but
# systemd-networkd-wait-online stays enabled, then holds every boot for 120 s
# and fails.
networkd_wait_off() { ! systemctl is-enabled --quiet systemd-networkd-wait-online.service 2>/dev/null; }

boots_graphical() { [ "$(systemctl get-default 2>/dev/null)" = graphical.target ]; }
snap_has() { snap list "$1" >/dev/null 2>&1; }
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

# The snap's own binary, not /snap/bin/ghostty: "snap run" rewrites files under
# ~/snap/ghostty, and check mode writes nothing.
GHOSTTY_BIN=/snap/ghostty/current/bin/ghostty
ghostty_valid() { [ -x "$GHOSTTY_BIN" ] && "$GHOSTTY_BIN" +validate-config >/dev/null 2>&1; }

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
# Runs only once the wall unit is enabled.
drop_old_autostart() {
  # Never leave the desktop with no terminal: the wall must start at login first.
  user_bus || true
  if ! systemctl --user is-enabled --quiet fleet-wall.service 2>/dev/null; then
    printf 'fleet-wall.service is not enabled yet; the tangle-tools module enables it, then run desktop again\n' >&2
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

# write_gdm_custom ON: with ON=1, drop every uncommented AutomaticLogin line
# and put the two keys at the top of [daemon]; with ON=0, drop the automatic
# and the timed login lines. GDM reads the file when it starts. The old file
# stays beside it.
write_gdm_custom() {
  local on="$1" new="$WORK/custom.conf.new"
  : >"$new"
  if [ -f "$GDM_CUSTOM" ]; then
    awk -v user="$USER" -v on="$on" '
      /^[ \t]*AutomaticLogin(Enable)?[ \t]*=/ { next }
      on == 0 && /^[ \t]*TimedLogin(Enable|Delay)?[ \t]*=/ { next }
      { print }
      on == 1 && $0 == "[daemon]" { print "AutomaticLoginEnable=true"; print "AutomaticLogin=" user }
    ' "$GDM_CUSTOM" >"$new" || return 1
    as_root cp -p "$GDM_CUSTOM" "$GDM_CUSTOM.pre-dotfiles.$(date +%Y%m%d%H%M%S)" || return 1
  fi
  if [ "$on" = 1 ] && ! grep -qx '\[daemon\]' "$new"; then
    printf '[daemon]\nAutomaticLoginEnable=true\nAutomaticLogin=%s\n' "$USER" >>"$new"
  fi
  root_install 0644 "$new" "$GDM_CUSTOM"
}

# login_keyring_has_password: gnome-keyring writes a keyring with a password in
# its binary format, which starts with "GnomeKeyring", and an empty-password
# keyring as text. Automatic login has no password to unlock the first kind.
login_keyring_has_password() { [ "$(head -c 12 "$LOGIN_KEYRING" 2>/dev/null)" = GnomeKeyring ]; }

module_desktop() {
  section "desktop: GNOME, Ghostty, JetBrainsMono Nerd Font"
  ensure "desktop installed (gdm3)" pkg_installed gdm3 -- apt_install ubuntu-desktop-minimal
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
  ensure "Ghostty snap (classic)" snap_has ghostty -- quiet as_root snap install ghostty --classic
  ensure "JetBrainsMono Nerd Font $NERD_FONTS_VERSION in $FONT_DIR" font_present -- install_font
  want_link "$HOST_DIR/desktop/ghostty-config" "$HOME/.config/ghostty/config"
  ensure "Ghostty accepts its config" ghostty_valid
  ensure "no second Ghostty at login (the fleet wall is the only window)" no_old_autostart -- drop_old_autostart

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
