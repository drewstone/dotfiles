# shellcheck shell=bash
# nosleep: the box never suspends, from boot, at the login screen, or in the
# desktop session.

SLEEP_TARGETS="sleep.target suspend.target hibernate.target hybrid-sleep.target suspend-then-hibernate.target"
GDM_KEYFILE=/etc/dconf/db/gdm.d/90-no-suspend
LOGIND_MAIN=/etc/systemd/logind.conf
LOGIND_DROPIN=/etc/systemd/logind.conf.d/10-host-no-sleep.conf

# schema|key|value as `gsettings get` prints it
GNOME_NO_SLEEP=(
  "org.gnome.settings-daemon.plugins.power|sleep-inactive-ac-type|'nothing'"
  "org.gnome.settings-daemon.plugins.power|sleep-inactive-battery-type|'nothing'"
  "org.gnome.settings-daemon.plugins.power|sleep-inactive-ac-timeout|0"
  "org.gnome.settings-daemon.plugins.power|power-button-action|'nothing'"
  "org.gnome.desktop.session|idle-delay|uint32 0"
  "org.gnome.desktop.screensaver|lock-enabled|false"
)

mask_sleep() {
  # shellcheck disable=SC2086
  as_root systemctl mask $SLEEP_TARGETS >/dev/null 2>&1
}

install_dconf_file() {
  root_install 0644 "$1" "$2" && as_root dconf update
}

# logind_keys: the keys the drop-in sets, as an extended regex alternation.
logind_keys() { sed -n 's/^\([A-Za-z]*\)=.*/\1/p' "$HOST_DIR/nosleep/logind.conf" | paste -sd'|' -; }

# logind_main_clean: the package's logind.conf sets none of the drop-in's keys,
# so the drop-in is the one place they live. A hand edit there would keep a
# value after the drop-in changes it.
logind_main_clean() {
  [ -f "$LOGIND_MAIN" ] || return 0
  ! grep -E "^[[:space:]]*($(logind_keys))[[:space:]]*=" "$LOGIND_MAIN" >/dev/null
}

# comment_logind_main: comment those keys out in logind.conf, once the drop-in
# holds them. The values do not change, so logind needs no restart.
comment_logind_main() {
  root_file_is 0644 "$HOST_DIR/nosleep/logind.conf" "$LOGIND_DROPIN" || return 1
  sed -E "s/^([[:space:]]*($(logind_keys))[[:space:]]*=)/#\1/" "$LOGIND_MAIN" >"$WORK/logind.conf.new" || return 1
  as_root cp -p "$LOGIND_MAIN" "$LOGIND_MAIN.pre-dotfiles.$(date +%Y%m%d%H%M%S)" &&
    root_install 0644 "$WORK/logind.conf.new" "$LOGIND_MAIN"
}

gdm_db_current() {
  [ -f /etc/dconf/db/gdm ] && [ /etc/dconf/db/gdm -nt "$GDM_KEYFILE" ]
}

gsetting_is() { [ "$(gsettings get "$1" "$2" 2>/dev/null)" = "$3" ]; }

gsetting_set() {
  user_bus || { printf 'no session bus for %s: enable linger or log in once\n' "$USER" >&2; return 1; }
  gsettings set "$1" "$2" "$3"
}

module_nosleep() {
  section "nosleep: masked sleep targets, logind, login screen, GNOME session"
  # shellcheck disable=SC2086
  ensure "sleep targets masked" unit_masked $SLEEP_TARGETS -- mask_sleep
  want_root_file 0644 "$HOST_DIR/nosleep/logind.conf" "$LOGIND_DROPIN" "$LOGIND_DROPIN (read at boot)"
  ensure "$LOGIND_MAIN leaves $(logind_keys | tr '|' ' ') to the drop-in" logind_main_clean -- comment_logind_main

  if [ -f /usr/share/dconf/profile/gdm ]; then
    ensure "/etc/dconf/profile/gdm reads the gdm system database" \
      root_file_is 0644 "$HOST_DIR/nosleep/gdm-profile" /etc/dconf/profile/gdm -- \
      install_dconf_file "$HOST_DIR/nosleep/gdm-profile" /etc/dconf/profile/gdm
    ensure "$GDM_KEYFILE" root_file_is 0644 "$HOST_DIR/nosleep/gdm-no-suspend" "$GDM_KEYFILE" -- \
      install_dconf_file "$HOST_DIR/nosleep/gdm-no-suspend" "$GDM_KEYFILE"
    ensure "gdm dconf database compiled" gdm_db_current -- as_root dconf update
  else
    skip "GDM is not installed; no login-screen settings"
  fi

  if ! gsettings list-schemas 2>/dev/null | grep -x org.gnome.settings-daemon.plugins.power >/dev/null; then
    skip "GNOME is not installed; no session power settings"
    return 0
  fi
  user_bus || true
  local entry schema key value
  for entry in "${GNOME_NO_SLEEP[@]}"; do
    IFS='|' read -r schema key value <<<"$entry"
    ensure "gsettings $schema $key = $value" gsetting_is "$schema" "$key" "$value" -- gsetting_set "$schema" "$key" "$value"
  done
}
