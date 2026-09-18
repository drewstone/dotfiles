#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACCOUNT_UID="$(id -u)"
ACCOUNT_NAME="$(id -un)"
USER_SYSTEMD_DIR="$HOME/.config/systemd/user"
SYSTEM_UNIT_DIR="/etc/systemd/system/user@${ACCOUNT_UID}.service.d"
USER_MANAGER_DIR="$HOME/.config/systemd/user.conf.d"
LEGACY_GLOBAL_DEFAULTS="${TMUX_HEAL_LEGACY_GLOBAL_DEFAULTS:-/etc/systemd/user.conf.d/20-tmux-session-protection.conf}"
LEGACY_SAVE_STAMP="/tmp/tmux-heal-${ACCOUNT_UID}-last-save"
LEGACY_SOURCE_STAMP="/tmp/tmux-heal-${ACCOUNT_UID}-conf-mtime"
TMUX_BIN="${TMUX_BIN:-/usr/bin/tmux}"
TMUX_SOCKET_PATH="${TMUX_SOCKET_PATH:-/tmp/tmux-${ACCOUNT_UID}/default}"
PROC_ROOT="${TMUX_HEAL_PROC_ROOT:-/proc}"
CGROUP_ROOT="${TMUX_HEAL_CGROUP_ROOT:-/sys/fs/cgroup}"
SUDO_BIN="${TMUX_HEAL_SUDO_BIN:-sudo}"
STAT_BIN="${TMUX_HEAL_STAT_BIN:-stat}"
WATCHER_SETTLE_SECONDS="${TMUX_HEAL_WATCHER_SETTLE_SECONDS:-3}"
RESURRECT_SAVE_SCRIPT="${TMUX_RESURRECT_SAVE_SCRIPT:-$HOME/.tmux/plugins/tmux-resurrect/scripts/save.sh}"
DEFAULTS_TARGET="$USER_MANAGER_DIR/20-tmux-session-protection.conf"

run_as_root() {
  "$SUDO_BIN" "$@"
}

tmux_cmd() {
  "$TMUX_BIN" -S "$TMUX_SOCKET_PATH" "$@"
}

set_oom_score() {
  local pid="$1"
  local score="$2"
  local score_file=""

  case "$pid" in
    ''|*[!0-9]*) return 0 ;;
  esac
  [ "$pid" -gt 1 ] || return 0
  score_file="$PROC_ROOT/$pid/oom_score_adj"
  [ -e "$score_file" ] || return 0

  if printf '%s\n' "$score" | run_as_root tee "$score_file" >/dev/null 2>&1; then
    return 0
  fi
  [ -e "$score_file" ] || return 0
  printf 'Failed to set OOM score %s for PID %s.\n' "$score" "$pid" >&2
  return 1
}

process_cgroup() {
  local pid="$1"
  local cgroup_file="$PROC_ROOT/$pid/cgroup"

  [ -r "$cgroup_file" ] || return 0
  awk -F : '$1 == "0" { print $3 }' "$cgroup_file" 2>/dev/null || true
}

neutralize_tmux_processes() {
  local tmux_server_pid=""
  local pane_pid=""
  local cgroup_path=""
  local cgroup_processes=""
  local process_id=""
  local process_ids=()
  declare -A seen_cgroups=()

  tmux_server_pid="$(tmux_cmd display-message -p '#{pid}' 2>/dev/null || true)"
  [ -n "$tmux_server_pid" ] || return 0
  set_oom_score "$tmux_server_pid" 0

  while IFS= read -r pane_pid; do
    case "$pane_pid" in
      ''|*[!0-9]*) continue ;;
    esac
    cgroup_path="$(process_cgroup "$pane_pid")"
    [ -n "$cgroup_path" ] || continue
    if [ -n "${seen_cgroups[$cgroup_path]+set}" ]; then
      continue
    fi
    seen_cgroups["$cgroup_path"]=1
    cgroup_processes="$CGROUP_ROOT${cgroup_path}/cgroup.procs"
    process_ids=()
    mapfile -t process_ids < "$cgroup_processes" 2>/dev/null || continue
    for process_id in "${process_ids[@]}"; do
      set_oom_score "$process_id" 0
    done
  done < <(tmux_cmd list-panes -a -F '#{pane_pid}' 2>/dev/null || true)
}

remove_owned_legacy_stamp() {
  local file="$1"
  local owner=""

  if [ ! -e "$file" ] && [ ! -L "$file" ]; then
    return 0
  fi
  owner="$("$STAT_BIN" -c '%u' -- "$file" 2>/dev/null || true)"
  if [ "$owner" != "$ACCOUNT_UID" ]; then
    printf 'Ignoring legacy stamp not owned by UID %s: %s\n' "$ACCOUNT_UID" "$file" >&2
    return 0
  fi
  if ! rm -f -- "$file"; then
    printf 'Could not remove legacy stamp: %s\n' "$file" >&2
  fi
}

require_systemd_version() {
  local version="$1"
  case "$version" in
    ''|*[!0-9]*)
      printf 'Cannot determine the systemd version.\n' >&2
      return 1
      ;;
  esac
  if [ "$version" -lt 250 ]; then
    printf 'tmux-heal requires systemd 250 or newer; found %s.\n' "$version" >&2
    return 1
  fi
}

valid_oom_score() {
  local score="$1"
  [[ "$score" =~ ^-?[0-9]+$ ]] && [ "$score" -ge -1000 ] && [ "$score" -le 1000 ]
}

default_user_oom_score() {
  local configured=""
  local legacy=""
  local measured=""

  if [ -f "$DEFAULTS_TARGET" ]; then
    configured="$(awk -F = '$1 == "DefaultOOMScoreAdjust" { value = $2 } END { print value }' "$DEFAULTS_TARGET")"
    if valid_oom_score "$configured"; then
      printf '%s\n' "$configured"
      return 0
    fi
  fi

  if [ -f "$LEGACY_GLOBAL_DEFAULTS" ]; then
    legacy="$(awk -F = '$1 == "DefaultOOMScoreAdjust" { value = $2 } END { print value }' "$LEGACY_GLOBAL_DEFAULTS")"
    if [ "$legacy" = "0" ]; then
      # The first local revision replaced this host's original default of 200 with 0.
      printf '200\n'
      return 0
    fi
  fi

  measured="$(systemd-run --user --quiet --wait --pipe --collect -p Type=exec \
    /bin/sh -c 'cat /proc/self/oom_score_adj')"
  if ! valid_oom_score "$measured"; then
    printf 'Cannot measure the default user-service OOM score.\n' >&2
    return 1
  fi
  printf '%s\n' "$measured"
}

preflight() {
  local systemd_version=""

  if [ "$(uname -s)" != "Linux" ] || ! command -v systemctl >/dev/null; then
    printf 'tmux-heal requires Linux with systemd.\n' >&2
    return 1
  fi
  systemd_version="$(systemctl --version | awk 'NR == 1 { print $2 }')"
  require_systemd_version "$systemd_version"
  if [ ! -x "$TMUX_BIN" ]; then
    printf 'tmux-heal requires executable %s.\n' "$TMUX_BIN" >&2
    return 1
  fi
  if ! command -v loginctl >/dev/null; then
    printf 'tmux-heal requires loginctl.\n' >&2
    return 1
  fi
  if ! command -v systemd-run >/dev/null; then
    printf 'tmux-heal requires systemd-run.\n' >&2
    return 1
  fi
  if ! command -v "$SUDO_BIN" >/dev/null; then
    printf 'tmux-heal requires %s.\n' "$SUDO_BIN" >&2
    return 1
  fi
  if ! systemctl --user show-environment >/dev/null; then
    printf 'The systemd user manager is unavailable.\n' >&2
    return 1
  fi
  run_as_root true
}

install_files() {
  local default_oom_score="$1"
  local defaults_tmp=""

  install -Dm755 "$SCRIPT_DIR/tmux-heal" "$HOME/.local/bin/tmux-heal"
  install -Dm644 "$SCRIPT_DIR/systemd/tmux-heal.service" "$USER_SYSTEMD_DIR/tmux-heal.service"
  install -Dm644 "$SCRIPT_DIR/systemd/10-stability.conf" "$USER_SYSTEMD_DIR/tmux-heal.service.d/10-stability.conf"
  install -Dm644 "$SCRIPT_DIR/systemd/20-oom-score.conf" "$USER_SYSTEMD_DIR/tmux-heal.service.d/20-oom-score.conf"
  install -d -m 700 "$USER_MANAGER_DIR"
  defaults_tmp="$(mktemp "$USER_MANAGER_DIR/.tmux-session-protection.XXXXXX")"
  if ! sed "s/@DEFAULT_OOM_SCORE@/$default_oom_score/" \
    "$SCRIPT_DIR/systemd/user-manager-defaults.conf.in" > "$defaults_tmp"; then
    rm -f -- "$defaults_tmp"
    return 1
  fi
  install -m 644 "$defaults_tmp" "$DEFAULTS_TARGET"
  rm -f -- "$defaults_tmp"
  run_as_root install -Dm644 "$SCRIPT_DIR/systemd/user-manager-oom-protection.conf" \
    "$SYSTEM_UNIT_DIR/20-tmux-session-protection.conf"

  if run_as_root test -e "$LEGACY_GLOBAL_DEFAULTS"; then
    run_as_root rm -f -- "$LEGACY_GLOBAL_DEFAULTS"
  fi
  remove_owned_legacy_stamp "$LEGACY_SAVE_STAMP"
  remove_owned_legacy_stamp "$LEGACY_SOURCE_STAMP"
}

verify_watcher() {
  local first_pid=""
  local second_pid=""

  first_pid="$(systemctl --user show tmux-heal.service -p MainPID --value)"
  case "$first_pid" in
    ''|0|*[!0-9]*)
      printf 'tmux-heal did not start.\n' >&2
      return 1
      ;;
  esac
  sleep "$WATCHER_SETTLE_SECONDS"
  systemctl --user is-active --quiet tmux-heal.service
  second_pid="$(systemctl --user show tmux-heal.service -p MainPID --value)"
  if [ "$first_pid" != "$second_pid" ]; then
    printf 'tmux-heal restarted during its startup check.\n' >&2
    return 1
  fi
}

main() {
  local user_manager_pid=""
  local baseline_oom_score=""
  local default_oom_score=""
  local manager_oom_score=""
  local watcher_pid=""
  local watcher_oom_score=""
  local session_count=""
  local resurrect_status="unavailable"

  preflight
  baseline_oom_score="$(default_user_oom_score)"
  user_manager_pid="$(systemctl show "user@${ACCOUNT_UID}.service" -p MainPID --value)"
  case "$user_manager_pid" in
    ''|0|*[!0-9]*)
      printf 'The systemd user manager has no live PID.\n' >&2
      return 1
      ;;
  esac

  set_oom_score "$user_manager_pid" -900
  if [ "$(loginctl show-user "$ACCOUNT_NAME" -p Linger --value)" != "yes" ]; then
    run_as_root loginctl enable-linger "$ACCOUNT_NAME"
  fi

  install_files "$baseline_oom_score"
  run_as_root systemctl daemon-reload
  systemctl --user daemon-reexec
  systemctl --user daemon-reload

  user_manager_pid="$(systemctl show "user@${ACCOUNT_UID}.service" -p MainPID --value)"
  set_oom_score "$user_manager_pid" -900
  "$HOME/.local/bin/tmux-heal" once

  systemctl --user enable tmux-heal.service
  systemctl --user restart tmux-heal.service
  verify_watcher
  neutralize_tmux_processes

  default_oom_score="$(systemctl --user show -p DefaultOOMScoreAdjust --value)"
  manager_oom_score="$(cat "$PROC_ROOT/$user_manager_pid/oom_score_adj")"
  watcher_pid="$(systemctl --user show tmux-heal.service -p MainPID --value)"
  watcher_oom_score="$(cat "$PROC_ROOT/$watcher_pid/oom_score_adj")"
  session_count="$(tmux_cmd list-sessions -F '#{session_name}' | wc -l)"
  if [ "$default_oom_score" != "$baseline_oom_score" ] || [ "$manager_oom_score" != "-900" ] || [ "$watcher_oom_score" != "0" ]; then
    printf 'OOM score verification failed: default=%s manager=%s watcher=%s.\n' \
      "$default_oom_score" "$manager_oom_score" "$watcher_oom_score" >&2
    return 1
  fi
  if [ -x "$RESURRECT_SAVE_SCRIPT" ]; then
    resurrect_status="enabled"
  fi

  printf 'tmux-heal active: sessions=%s manager_oom=%s watcher_oom=%s resurrect=%s.\n' \
    "$session_count" "$manager_oom_score" "$watcher_oom_score" "$resurrect_status"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
