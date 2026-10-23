#!/usr/bin/env bash
# Complete, validated source bundling, transport and job staging.
# Sourced by beelink-gate and embedded into every submitted script.

emit_gate_source() {
  local generated status
  generated=$(mktemp) || return "$TEMPFAIL"
  if ! awk -v installer="${gate_installer_source:-}" -v staging="${gate_staging_source:-}" -v cache="${gate_cache_source:-}" -v disk="${gate_disk_source:-}" '
    function append(file, line, status, count) {
      while ((status = getline line < file) > 0) { print line; count++ }
      close(file)
      if (status < 0 || count == 0) exit 1
    }
    { last = $0 }
    $0 == "# BEELINK_GATE_INSTALLER_START" {
      starts++; append(installer); append(staging); append(cache)
      print "beelink_gate_disk_source=$(cat <<\047BEELINK_GATE_DISK_PYTHON\047"
      append(disk)
      print "BEELINK_GATE_DISK_PYTHON"
      print ")"
      skip = 1; next
    }
    $0 == "# BEELINK_GATE_INSTALLER_END" { ends++; skip = 0; next }
    !skip { print }
    END {
      if (skip || starts != ends || starts > 1 || last != "# BEELINK_GATE_SOURCE_END") exit 1
    }
  ' "$0" > "$generated"; then
    rm -f "$generated"
    tempfail_line "$(utc_in_minutes 5)" "cannot generate complete gate source; nothing submitted"
    return "$TEMPFAIL"
  fi
  cat "$generated"; status=$?
  rm -f "$generated"
  [ "$status" = 0 ] || return "$TEMPFAIL"
}
# Read the whole payload before Bash executes any of it. The footer also
# delimits the script when heartbeat data follows on the same open stdin.
receive_gate_source() {
  local generated line complete=0 status
  generated=$(mktemp) || return 75
  while IFS= read -r line; do
    printf '%s\n' "$line" >> "$generated" || { rm -f "$generated"; return 75; }
    if [ "$line" = "# BEELINK_GATE_SOURCE_END" ]; then complete=1; break; fi
  done
  if [ "$complete" != 1 ] || ! bash -n "$generated"; then
    rm -f "$generated"
    echo "beelink-gate: TEMPFAIL incomplete or invalid received gate source" >&2
    return 75
  fi
  bash "$generated" "$@"; status=$?
  rm -f "$generated"
  return "$status"
}


stage_job() {
  local target=$1 id=$2 dir marker source_file status
  source_file=$(mktemp) || return "$TEMPFAIL"
  emit_gate_source > "$source_file" || { rm -f "$source_file"; return "$TEMPFAIL"; }
  dir="$STATE_DIR/jobs/$id"
  if [ "$target" = "$SELF" ]; then
    mkdir -p "$STATE_DIR/jobs" && mkdir -m 700 "$dir" && cp -- "$source_file" "$dir/gate.sh" && chmod 700 "$dir/gate.sh"
    status=$?
    rm -f "$source_file"
    return "$status"
  fi
  marker="__BEELINK_GATE_SOURCE_${id//-/_}__"
  {
    printf 'id=%q\n' "$id"
    cat <<'BOOT'
set -euo pipefail
umask 077
root="${BEELINK_GATE_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/beelink-gate}/jobs"
mkdir -p "$root"
dir="$root/$id"
mkdir -m 700 "$dir"
complete_source() { [ "$(tail -n 1 "$dir/gate.sh")" = '# BEELINK_GATE_SOURCE_END' ] && bash -n "$dir/gate.sh"; }
trap 'complete_source || exit 75' EXIT
BOOT
    printf "cat > \"\$dir/gate.sh\" <<'%s'\n" "$marker"
    cat "$source_file" || exit "$TEMPFAIL"
    printf '%s\ncomplete_source || exit 75\nchmod 700 "$dir/gate.sh"\n' "$marker"
  } | bounded_transport "$target stage $id" ssh "${SSH_OPTIONS[@]}" "${BEELINK_IPS[$target]}" wsl.exe -- bash -s
  status=$?
  rm -f "$source_file"
  return "$status"
}


on_beelink() {
  local target=$1; shift
  local -a transport_prefix=() envs=("BEELINK_GATE_LAUNCHER=$launcher_name")
  case "${1:-}" in
    --reserve-match|--job-cancel) transport_prefix=(bounded_transport "$target $1") ;;
  esac
  [ -z "${BEELINK_GATE_MAX_HOLD:-}" ] || envs+=("BEELINK_GATE_MAX_HOLD=$BEELINK_GATE_MAX_HOLD")
  [ -z "${gate_branch:-}" ] || envs+=("BEELINK_GATE_BRANCH=$gate_branch")
  [ -z "${BEELINK_GATE_LOAD_WAIT:-}" ] || envs+=("BEELINK_GATE_LOAD_WAIT=$BEELINK_GATE_LOAD_WAIT")
  [ -z "${BEELINK_GATE_CACHE_MAX_BYTES:-}" ] || envs+=("BEELINK_GATE_CACHE_MAX_BYTES=$BEELINK_GATE_CACHE_MAX_BYTES")
  [ -z "${TURBO_RUN_SUMMARY:-}" ] || envs+=("TURBO_RUN_SUMMARY=$TURBO_RUN_SUMMARY")
  [ -z "${BEELINK_GATE_MAX_CPU_PRESSURE:-}" ] || envs+=("BEELINK_GATE_MAX_CPU_PRESSURE=$BEELINK_GATE_MAX_CPU_PRESSURE")
  [ -z "${BEELINK_GATE_HOST_PRESSURE_CEILING:-}" ] || envs+=("BEELINK_GATE_HOST_PRESSURE_CEILING=$BEELINK_GATE_HOST_PRESSURE_CEILING")
  [ -z "${BEELINK_GATE_STARVE_AFTER:-}" ] || envs+=("BEELINK_GATE_STARVE_AFTER=$BEELINK_GATE_STARVE_AFTER")
  [ "${gate_class:-}" != dev ] || envs+=("BEELINK_GATE_CLASS=dev")
  [ -z "${BEELINK_GATE_SHIP_WORKERS:-}" ] || envs+=("BEELINK_GATE_SHIP_WORKERS=$BEELINK_GATE_SHIP_WORKERS")
  [[ "${BEELINK_GATE_PR:-}" =~ ^[0-9]+$ ]] && envs+=("BEELINK_GATE_PR=$BEELINK_GATE_PR")
  [ -z "${BEELINK_GATE_LANE:-}" ] || envs+=("BEELINK_GATE_LANE=$BEELINK_GATE_LANE")
  [ -z "${BEELINK_GATE_RESERVATION_TOKEN:-}" ] || envs+=("BEELINK_GATE_RESERVATION_TOKEN=$BEELINK_GATE_RESERVATION_TOKEN")
  [ -z "${BEELINK_GATE_MAX_CONCURRENT:-}" ] || envs+=("BEELINK_GATE_MAX_CONCURRENT=$BEELINK_GATE_MAX_CONCURRENT")
  [ -z "${BEELINK_GATE_REPO_CHECKOUTS:-}" ] || envs+=("BEELINK_GATE_REPO_CHECKOUTS=$BEELINK_GATE_REPO_CHECKOUTS")
  [ -z "${BEELINK_GATE_LIGHT_CPU:-}" ] || envs+=("BEELINK_GATE_LIGHT_CPU=$BEELINK_GATE_LIGHT_CPU")
  [ -z "${BEELINK_GATE_LIGHT_SLOTS:-}" ] || envs+=("BEELINK_GATE_LIGHT_SLOTS=$BEELINK_GATE_LIGHT_SLOTS")
  [ "${BEELINK_GATE_URGENT:-0}" != 1 ] || envs+=("BEELINK_GATE_URGENT=1")
  [ -z "${BEELINK_GATE_ID:-}" ] || envs+=("BEELINK_GATE_ID=$BEELINK_GATE_ID")
  [ "${requested:-}" != auto ] || envs+=("BEELINK_GATE_AUTO=1")
  [ -z "${admit_wait_launch:-}" ] || envs+=("BEELINK_GATE_ADMIT_WAIT=$admit_wait_launch")
  # The wait so far rides along even when the gate may no longer move, so it keeps its
  # age in the checkout queue and its starvation clock.
  (( ${placed_wait_launch:-0} == 0 )) || envs+=("BEELINK_GATE_PLACED_WAIT=$placed_wait_launch")
  [ -z "${BEELINK_GATE_SPARSE_SPEC:-}" ] || envs+=("BEELINK_GATE_SPARSE_SPEC=$BEELINK_GATE_SPARSE_SPEC")
  local peer_host=beelink1; [ "$target" != beelink1 ] || peer_host=beelink2
  [ -z "${matched_reserve[$peer_host]:-}" ] || envs+=("BEELINK_GATE_PEER_RESERVE=${matched_reserve[$peer_host]}")
  [ -z "${matched_warm_reserve[$peer_host]:-}" ] || envs+=("BEELINK_GATE_PEER_WARM_RESERVE=${matched_warm_reserve[$peer_host]}")
  [ "${heartbeat:-0}" = 1 ] && envs+=("BEELINK_GATE_HEARTBEAT=1")
  local me=$$ rc heartbeat_fd heartbeat_pid command_pid args_line="" source_file=""
  if [ "$target" != "$SELF" ]; then
    source_file=$(mktemp) || return "$TEMPFAIL"
    emit_gate_source > "$source_file" || { rm -f "$source_file"; return "$TEMPFAIL"; }
  fi
  # Windows OpenSSH refuses an exec request whose command line passes about 32 KB
  # ("exec request failed on channel 0"); on 2026-10-18 a 23 KB patch, base64
  # encoded in argv, became 41,676 bytes and the submit was reported as a lost
  # connection. Large arguments ride on stdin ahead of the script instead.
  local -a remote_args=("$@")
  if (( $(printf '%s ' "$@" | wc -c) > 8192 )); then
    args_line="set -- $(printf '%q ' "$@")"
    remote_args=()
  fi
  heartbeat_input() {
    local sleeper="" include_script=${1:-0}
    trap 'if [ -n "$sleeper" ]; then kill -TERM "$sleeper" 2>/dev/null || true; wait "$sleeper" 2>/dev/null || true; fi; exit 0' TERM INT
    if [ "$include_script" = 1 ]; then
      declare -f receive_gate_source
      printf 'receive_gate_source "$@"; exit $?\n'
      [ -z "$args_line" ] || printf '%s\n' "$args_line"
      cat "$source_file"
    fi
    while kill -0 "$me" 2>/dev/null && { [ -z "${BEELINK_GATE_HEARTBEAT_STOP:-}" ] || [ ! -e "$BEELINK_GATE_HEARTBEAT_STOP" ]; }; do
      sleep 5 & sleeper=$!
      wait "$sleeper" || true
      sleeper=""
    done
  }
  stop_heartbeat() {
    kill -TERM "$heartbeat_pid" 2>/dev/null || true
    wait "$heartbeat_pid" 2>/dev/null || true
    exec {heartbeat_fd}<&-
  }
  if [ "$target" = "$SELF" ] && [ "${heartbeat:-0}" = 1 ]; then
    exec {heartbeat_fd}< <(heartbeat_input)
    heartbeat_pid=$!
    env "${envs[@]}" bash "$0" "$@" <&"$heartbeat_fd" &
    command_pid=$!
    wait "$command_pid"; rc=$?
    stop_heartbeat
  elif [ "$target" = "$SELF" ]; then
    "${transport_prefix[@]}" env "${envs[@]}" bash "$0" "$@" </dev/null
    rc=$?
  elif [ "${heartbeat:-0}" = 1 ]; then
    exec {heartbeat_fd}< <(heartbeat_input 1)
    heartbeat_pid=$!
    ssh "${SSH_OPTIONS[@]}" "${BEELINK_IPS[$target]}" wsl.exe -- env "${envs[@]}" bash -s -- "${remote_args[@]}" <&"$heartbeat_fd" &
    command_pid=$!
    wait "$command_pid"; rc=$?
    stop_heartbeat
  else
    "${transport_prefix[@]}" ssh "${SSH_OPTIONS[@]}" "${BEELINK_IPS[$target]}" wsl.exe -- env "${envs[@]}" bash -s -- "${remote_args[@]}" \
      < <(declare -f receive_gate_source; printf 'receive_gate_source "$@"; exit $?\n'; [ -z "$args_line" ] || printf '%s\n' "$args_line"; cat "$source_file")
    rc=$?
  fi
  [ -z "$source_file" ] || rm -f "$source_file"
  return "$rc"
}

