# shellcheck shell=bash disable=SC2153 # HOST_DIR comes from host/provision.sh
# desktop: GNOME on boot, Ghostty full screen on the agent tmux session, and
# the JetBrainsMono Nerd Font it draws with.

AUTOLOGIN="${AUTOLOGIN:-0}"
NERD_FONTS_VERSION=v3.5.1
FONT_DIR="$HOME/.local/share/fonts/JetBrainsMonoNF"
GDM_CUSTOM=/etc/gdm3/custom.conf

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

autologin_on() {
  awk -v user="$USER" '
    /^\[/ { daemon = ($0 == "[daemon]") }
    daemon && $0 == "AutomaticLoginEnable=true" { enable = 1 }
    daemon && $0 == "AutomaticLogin=" user { name = 1 }
    END { exit !(enable && name) }
  ' "$GDM_CUSTOM" 2>/dev/null
}

# set_autologin: put the two keys at the top of [daemon] and drop any other
# uncommented AutomaticLogin lines. GDM reads the file when it starts.
set_autologin() {
  local new="$WORK/custom.conf.new"
  : >"$new"
  if [ -f "$GDM_CUSTOM" ]; then
    awk -v user="$USER" '
      /^AutomaticLogin(Enable)?[ \t]*=/ { next }
      { print }
      $0 == "[daemon]" { print "AutomaticLoginEnable=true"; print "AutomaticLogin=" user }
    ' "$GDM_CUSTOM" >"$new" || return 1
    as_root cp -p "$GDM_CUSTOM" "$GDM_CUSTOM.pre-dotfiles" || return 1
  fi
  grep -qx '\[daemon\]' "$new" ||
    printf '[daemon]\nAutomaticLoginEnable=true\nAutomaticLogin=%s\n' "$USER" >>"$new"
  root_install 0644 "$new" "$GDM_CUSTOM"
}

module_desktop() {
  section "desktop: GNOME, Ghostty full screen on tmux, JetBrainsMono Nerd Font"
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
  want_link "$HOST_DIR/desktop/ghostty.desktop" "$HOME/.config/autostart/ghostty.desktop"

  if [ "$AUTOLOGIN" = 1 ]; then
    ensure "GDM logs $USER in at boot (from the next GDM start)" autologin_on -- set_autologin
  elif autologin_on; then
    ok "GDM logs $USER in at boot"
  else
    manual "No desktop session starts after a reboot until someone logs in; Ghostty and chatgpt-fleet need one. Log in at the box, or turn on automatic login:" \
      "$DOTFILES/host/provision.sh desktop --autologin"
  fi
}
