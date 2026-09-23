# shellcheck shell=bash
# wifi: keep a headless box on Wi-Fi.
# The SSID and passphrase come from --wifi-ssid and --wifi-psk-file or a
# prompt, never from this repository.

WIFI_SSID="${WIFI_SSID:-}"
WIFI_PSK_FILE="${WIFI_PSK_FILE:-}"
NM_CONF=/etc/NetworkManager/conf.d/zz-wifi-powersave-off.conf

nm_prop_is() { [ "$(nmcli -g "$2" connection show uuid "$1" 2>/dev/null)" = "$3" ]; }
nm_set() { as_root nmcli connection modify uuid "$1" "$2" "$3"; }

wifi_uuids() {
  nmcli -t -f UUID,TYPE connection show 2>/dev/null | awk -F: '$2 == "802-11-wireless" { print $1 }'
}

# wifi_uuid_for_ssid SSID: print the first profile for SSID.
wifi_uuid_for_ssid() {
  local u
  for u in $(wifi_uuids); do
    if [ "$(nmcli -g 802-11-wireless.ssid connection show uuid "$u" 2>/dev/null)" = "$1" ]; then
      printf '%s\n' "$u"
      return 0
    fi
  done
  return 1
}

# load_psk: read the passphrase once per run into WIFI_PSK_VALUE, from
# --wifi-psk-file (so /dev/stdin works) or from a prompt on the terminal.
WIFI_PSK_VALUE=""
load_psk() {
  local psk=""
  [ -n "$WIFI_PSK_VALUE" ] && return 0
  if [ -n "$WIFI_PSK_FILE" ]; then
    IFS= read -r psk <"$WIFI_PSK_FILE" || [ -n "$psk" ] || return 1
  elif [ -r /dev/tty ]; then
    IFS= read -r -s -p "Wi-Fi passphrase for $WIFI_SSID: " psk </dev/tty || return 1
    printf '\n' >/dev/tty
  else
    printf 'No passphrase: pass --wifi-psk-file FILE or run on a terminal.\n' >&2
    return 1
  fi
  [ ${#psk} -ge 8 ] || { printf 'The passphrase is shorter than 8 characters.\n' >&2; return 1; }
  WIFI_PSK_VALUE="$psk"
}

wifi_profile_exists() { wifi_uuid_for_ssid "$WIFI_SSID" >/dev/null; }

# psk-flags 0 stores the passphrase with the system profile. A passphrase held
# by a desktop secret agent is lost to a headless box after a firmware reset.
wifi_add_profile() {
  load_psk || return 1
  as_root nmcli connection add type wifi con-name "$WIFI_SSID" ssid "$WIFI_SSID" \
    wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$WIFI_PSK_VALUE" wifi-sec.psk-flags 0 \
    802-11-wireless.powersave 2 connection.autoconnect yes \
    connection.autoconnect-retries 0 connection.permissions '' >/dev/null
}

wifi_psk_matches() {
  local u
  u="$(wifi_uuid_for_ssid "$WIFI_SSID")" || return 1
  load_psk || return 1
  [ "$(as_root nmcli -s -g 802-11-wireless-security.psk connection show uuid "$u" 2>/dev/null)" = "$WIFI_PSK_VALUE" ]
}

wifi_set_psk() {
  local u
  u="$(wifi_uuid_for_ssid "$WIFI_SSID")" || return 1
  load_psk || return 1
  as_root nmcli connection modify uuid "$u" wifi-sec.psk "$WIFI_PSK_VALUE" wifi-sec.psk-flags 0
}

install_nm_conf() {
  root_install 0644 "$HOST_DIR/wifi/zz-wifi-powersave-off.conf" "$NM_CONF" &&
    as_root nmcli general reload conf
}

install_wifi_unit() {
  root_install 0644 "$HOST_DIR/wifi/$1" "/etc/systemd/system/$1" &&
    as_root systemctl daemon-reload
}

wifi_timer_on() {
  systemctl is-enabled --quiet wifi-watchdog.timer 2>/dev/null &&
    systemctl is-active --quiet wifi-watchdog.timer 2>/dev/null
}

module_wifi() {
  section "wifi: power save off, system-wide passphrase, reconnect watchdog"
  if ! command -v nmcli >/dev/null 2>&1; then
    skip "NetworkManager is not installed"
    return 0
  fi
  ensure "$NM_CONF" root_file_is 0644 "$HOST_DIR/wifi/zz-wifi-powersave-off.conf" "$NM_CONF" -- install_nm_conf
  want_root_file 0755 "$HOST_DIR/wifi/wifi-watchdog" /usr/local/sbin/wifi-watchdog
  local unit
  for unit in wifi-watchdog.service wifi-watchdog.timer; do
    ensure "/etc/systemd/system/$unit" root_file_is 0644 "$HOST_DIR/wifi/$unit" "/etc/systemd/system/$unit" -- install_wifi_unit "$unit"
  done
  ensure "wifi-watchdog.timer enabled and running" wifi_timer_on -- quiet as_root systemctl enable --now wifi-watchdog.timer

  if [ -n "$WIFI_SSID" ]; then
    ensure "Wi-Fi profile for '$WIFI_SSID' (system-wide passphrase)" wifi_profile_exists -- wifi_add_profile
    if [ -n "$WIFI_PSK_FILE" ] && wifi_profile_exists; then
      ensure "'$WIFI_SSID' holds the given passphrase" wifi_psk_matches -- wifi_set_psk
    fi
  fi

  local u name found=0
  for u in $(wifi_uuids); do
    found=1
    name="$(nmcli -g connection.id connection show uuid "$u" 2>/dev/null)"
    ensure "$name: power save off" nm_prop_is "$u" 802-11-wireless.powersave disable -- nm_set "$u" 802-11-wireless.powersave 2
    ensure "$name: autoconnect" nm_prop_is "$u" connection.autoconnect yes -- nm_set "$u" connection.autoconnect yes
    ensure "$name: retry autoconnect without limit" nm_prop_is "$u" connection.autoconnect-retries 0 -- nm_set "$u" connection.autoconnect-retries 0
    ensure "$name: profile shared by all users" nm_prop_is "$u" connection.permissions '' -- nm_set "$u" connection.permissions ''
    if [ "$(nmcli -g 802-11-wireless-security.key-mgmt connection show uuid "$u" 2>/dev/null)" = wpa-psk ] &&
      ! nm_prop_is "$u" 802-11-wireless-security.psk-flags 0; then
      manual "$name: the passphrase is not stored system-wide; store it again" \
        "$DOTFILES/host/provision.sh wifi --wifi-ssid '$(nmcli -g 802-11-wireless.ssid connection show uuid "$u")' --wifi-psk-file <file>"
    fi
  done
  if [ "$found" = 0 ] && [ -z "$WIFI_SSID" ]; then
    skip "no Wi-Fi profile; pass --wifi-ssid SSID to add one"
  fi
}
