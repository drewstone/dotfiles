#!/usr/bin/env bash
# Complete, validated source bundling, transport and job staging.
# Sourced by beelink-gate and embedded into every submitted script.
gate_heartbeat_interval_seconds=5
declare -A frontend_group_identities=()

emit_gate_source() {
  local generated status
  generated=$(mktemp) || return "$TEMPFAIL"
  if ! awk -v installer="${gate_installer_source:-}" -v staging="${gate_staging_source:-}" -v cache="${gate_cache_source:-}" -v admission="${gate_admission_source:-}" -v resources="${gate_resources_source:-}" -v jobs="${gate_jobs_source:-}" -v execution="${gate_execution_source:-}" -v placement="${gate_placement_source:-}" -v disk="${gate_disk_source:-}" -v release="${gate_release_source:-}" -v metrics="${gate_metrics_source:-}" '
    function append(file, line, status, count) {
      while ((status = getline line < file) > 0) { print line; count++ }
      close(file)
      if (status < 0 || count == 0) exit 1
    }
    { last = $0 }
    $0 == "# BEELINK_GATE_INSTALLER_START" {
      starts++; append(installer); append(staging); append(cache); append(admission); append(resources); append(jobs); append(execution); append(placement)
      print "beelink_gate_disk_source=$(cat <<\047BEELINK_GATE_DISK_PYTHON\047"
      append(disk)
      print "BEELINK_GATE_DISK_PYTHON"
      print ")"
      print "beelink_gate_release_source=$(cat <<\047BEELINK_GATE_RELEASE_PYTHON\047"
      append(release)
      print "BEELINK_GATE_RELEASE_PYTHON"
      print ")"
      print "beelink_gate_metrics_source=$(cat <<\047BEELINK_GATE_METRICS_PYTHON\047"
      append(metrics)
      print "BEELINK_GATE_METRICS_PYTHON"
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
  # Shell builtins write values before source, never through exec argv. A
  # base64 argument can exceed Linux MAX_ARG_STRLEN even after Windows stdin.
  printf 'set -- %s\n' "$(printf '%q ' "$@")" > "$generated" || { rm -f "$generated"; return 75; }
  while IFS= read -r line; do
    printf '%s\n' "$line" >> "$generated" || { rm -f "$generated"; return 75; }
    if [ "$line" = "# BEELINK_GATE_SOURCE_END" ]; then complete=1; break; fi
  done
  if [ "$complete" != 1 ] || ! bash -n "$generated"; then
    rm -f "$generated"
    echo "beelink-gate: TEMPFAIL incomplete or invalid received gate source" >&2
    return 75
  fi
  bash "$generated"; status=$?
  rm -f "$generated"
  return "$status"
}


stage_job() {
  local target=$1 id=$2 dir marker source_file status prefix=${frontend_output:-}
  source_file=$(mktemp) || return "$TEMPFAIL"
  emit_gate_source > "$source_file" || { rm -f "$source_file"; return "$TEMPFAIL"; }
  dir="$STATE_DIR/jobs/$id"
  if [ "$target" = "$SELF" ]; then
    mkdir -p "$STATE_DIR/jobs" && mkdir -m 700 "$dir" && cp -- "$source_file" "$dir/gate.sh" && chmod 700 "$dir/gate.sh"
    status=$?
    if [ "$status" = 0 ] && [ -n "$prefix" ]; then
      frontend_io retain_frontend_prefix "$dir" "$prefix" "$id" >/dev/null || true
    fi
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
    if [ -n "$prefix" ]; then
      printf 'timeout --kill-after=1 2 python3 -c %q "$dir" "$id" %q >/dev/null 2>&1 || true\n' \
        "$beelink_gate_metrics_source"$'\n''import base64,sys; retain_frontend_prefix(sys.argv[1],base64.b64decode(sys.argv[3]).decode(),sys.argv[2])' "$(encode "$prefix")"
    fi
  } | TRANSPORT_TIMEOUT_SECONDS=$STAGE_TIMEOUT_SECONDS bounded_transport "$target stage $id" ssh "${SSH_OPTIONS[@]}" "${BEELINK_IPS[$target]}" wsl.exe -- bash -s
  status=$?
  rm -f "$source_file"
  return "$status"
}


# The existing public floor flag is local for this host, otherwise one bounded staged query.
canonical_beelink() {
  local name=${1,,}; name=${name%.local}
  case "$name" in beelink1|desktop-18ir33v) echo beelink1 ;; beelink2) echo beelink2 ;; esac
}
self_beelink() {
  [ -x "$REG_EXE" ] || return 0
  canonical_beelink "${BEELINK_GATE_SELF:-$(hostname)}"
}
disk_floor_query() {
  [ "$#" -eq 2 ] || die "usage: beelink-gate --disk-floor-bytes <beelink1|beelink2>"
  local target=$2 floor here
  case "$target" in beelink1|beelink2) ;; *) die "unknown disk floor host: $target" ;; esac
  here=$(canonical_beelink "$(hostname)")
  if [ "$target" = "$here" ]; then
    floor=$(effective_disk_floor_bytes "$target") || return 3
    echo "beelink-gate: $target disk floor $floor bytes from lifecycle admission and limits file $(limits_file)" >&2
    echo "$floor"; return 0
  fi
  [ "${BEELINK_GATE_FLOOR_LOCAL:-0}" != 1 ] || {
    echo 'beelink-gate: disk floor query reached the wrong host; growth refused' >&2
    return "$TEMPFAIL"
  }
  local launcher_name; launcher_name=$(hostname | tr -cd 'A-Za-z0-9._-' | cut -c1-64)
  BEELINK_GATE_FLOOR_LOCAL=1 heartbeat=0 on_beelink "$target" --disk-floor-bytes "$target"
}


on_beelink() {
  local target=$1; shift
  local TRANSPORT_TIMEOUT_SECONDS=$TRANSPORT_TIMEOUT_SECONDS
  local -a transport_prefix=() envs=("BEELINK_GATE_LAUNCHER=$launcher_name")
  case "${1:-}" in
    --probe|--reserve-match|--job-submit|--job-result|--job-cancel|--disk-floor-bytes) transport_prefix=(bounded_transport "$target $1") ;;
    --job-attach)
      if (( ${frontend_retry_deadline_ms:-0} > 0 )); then
        frontend_retry_check
        TRANSPORT_TIMEOUT_SECONDS=$(( (frontend_retry_deadline_ms - $(monotonic_ms) + 999) / 1000 ))
        (( TRANSPORT_TIMEOUT_SECONDS > 0 )) || TRANSPORT_TIMEOUT_SECONDS=1
        transport_prefix=(bounded_transport "$target $1")
      fi
      ;;
  esac
  [ "${BEELINK_GATE_FLOOR_LOCAL:-0}" != 1 ] || envs+=("BEELINK_GATE_FLOOR_LOCAL=1")
  [ -z "${BEELINK_GATE_MAX_HOLD:-}" ] || envs+=("BEELINK_GATE_MAX_HOLD=$BEELINK_GATE_MAX_HOLD")
  [ -z "${gate_branch:-}" ] || envs+=("BEELINK_GATE_BRANCH=$gate_branch")
  [ -z "${BEELINK_GATE_LOAD_WAIT:-}" ] || envs+=("BEELINK_GATE_LOAD_WAIT=$BEELINK_GATE_LOAD_WAIT")
  [ -z "${BEELINK_GATE_CACHE_MAX_BYTES:-}" ] || envs+=("BEELINK_GATE_CACHE_MAX_BYTES=$BEELINK_GATE_CACHE_MAX_BYTES")
  [ -z "${TURBO_RUN_SUMMARY:-}" ] || envs+=("TURBO_RUN_SUMMARY=$TURBO_RUN_SUMMARY")
  [ -z "${BEELINK_GATE_MAX_CPU_PRESSURE:-}" ] || envs+=("BEELINK_GATE_MAX_CPU_PRESSURE=$BEELINK_GATE_MAX_CPU_PRESSURE")
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
  local me=$$ rc heartbeat_fd heartbeat_pid command_pid source_file=""
  source_file=$(mktemp) || return "$TEMPFAIL"
  emit_gate_source > "$source_file" || {
    rc=$?
    [ "${probe_diagnostic_scope:-0}" != 1 ] || { probe_nested_phase=source_emit; probe_nested_exit=$rc; }
    rm -f "$source_file"; return "$TEMPFAIL"
  }
  # Windows parses the entire exec command before WSL starts (cmd.exe's
  # 8191-character limit includes env and quoting). Keep every value on stdin,
  # even small arguments; job_submit persists them in its 0600 NUL args file.
  send_gate_source() {
    printf 'export %q\n' "${envs[@]}"
    printf 'set -- %s\n' "$(printf '%q ' "$@")"
    declare -f receive_gate_source
    printf 'receive_gate_source "$@"; exit $?\n'
    cat "$source_file"
  }
  local -a transport_args=("$@")
  heartbeat_input() {
    local sleeper="" include_script=${1:-0}
    trap 'if [ -n "$sleeper" ]; then kill -TERM "$sleeper" 2>/dev/null || true; wait "$sleeper" 2>/dev/null || true; fi; exit 0' TERM INT
    if [ "$include_script" = 1 ]; then
      send_gate_source "${transport_args[@]}"
    fi
    while kill -0 "$me" 2>/dev/null && { [ -z "${BEELINK_GATE_HEARTBEAT_STOP:-}" ] || [ ! -e "$BEELINK_GATE_HEARTBEAT_STOP" ]; }; do
      sleep "$gate_heartbeat_interval_seconds" & sleeper=$!
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
    exec {heartbeat_fd}< <(heartbeat_input 1)
    heartbeat_pid=$!
    bash -s <&"$heartbeat_fd" &
    command_pid=$!
    wait "$command_pid"; rc=$?
    stop_heartbeat
  elif [ "$target" = "$SELF" ]; then
    "${transport_prefix[@]}" bash -s < <(send_gate_source "$@")
    rc=$?
  elif [ "${heartbeat:-0}" = 1 ]; then
    exec {heartbeat_fd}< <(heartbeat_input 1)
    heartbeat_pid=$!
    ssh "${SSH_OPTIONS[@]}" "${BEELINK_IPS[$target]}" wsl.exe -- bash -s <&"$heartbeat_fd" &
    command_pid=$!
    wait "$command_pid"; rc=$?
    stop_heartbeat
  else
    "${transport_prefix[@]}" ssh "${SSH_OPTIONS[@]}" "${BEELINK_IPS[$target]}" wsl.exe -- bash -s \
      < <(send_gate_source "$@")
    rc=$?
  fi
  [ -z "$source_file" ] || rm -f "$source_file"
  return "$rc"
}


bounded_transport() {
  local label=$1 timer rc seconds=$TRANSPORT_TIMEOUT_SECONDS left
  local -a foreground=()
  shift
  if [ "${frontend_selector_active:-0}" = 1 ]; then
    frontend_retry_check
    if (( ${frontend_retry_deadline_ms:-0} > 0 )); then
      left=$(( (frontend_retry_deadline_ms - $(monotonic_ms) + 999) / 1000 ))
      (( left > 0 )) || left=1
      (( seconds <= left )) || seconds=$left
    fi
    # The selector owns this process group; nested timeouts must stay in it
    # so frontend EXIT cleanup can stop every probe descendant on TERM.
    foreground=(--foreground)
  fi
  timer=$(command -v timeout || command -v gtimeout) || {
    echo "beelink-gate: cannot bound $label: GNU timeout is unavailable" >&2
    return "$TEMPFAIL"
  }
  "$timer" "${foreground[@]}" --kill-after="${TRANSPORT_KILL_GRACE_SECONDS}s" "${seconds}s" "$@"; rc=$?
  case "$rc" in
    124|137)
      [ "${probe_diagnostic_scope:-0}" != 1 ] || { probe_nested_phase=transport_command; probe_nested_exit=$rc; }
      echo "beelink-gate: $label unconfirmed (exit $rc; transport deadline $seconds seconds)" >&2
      frontend_retry_check
      tempfail_line "$(utc_in_minutes 1)" "$label transport unconfirmed${frontend_cancel_gate:+; run beelink-gate --attach $frontend_cancel_gate}"
      return "$TEMPFAIL"
      ;;
  esac
  return "$rc"
}

# Preserve the actual command stdout/status and foreground signal semantics.
# Never attach a stderr reader: inherited writers must not delay a probe result.
probe_transport() {  # <host> <phase> <actual command and arguments...>
  local target=$1 phase=$2 attempt=${probe_attempt:-0} rc result=command_nonzero
  local probe_diagnostic_scope=1 probe_nested_phase=none probe_nested_exit=unknown
  shift 2
  case "$target" in beelink1|beelink2) ;; *) target=unknown ;; esac
  case "$phase" in windows_policy_local|windows_policy_ssh|remote_probe) ;; *) phase=unknown ;; esac
  case "$attempt" in 0|1|2|3) ;; *) attempt=0 ;; esac
  "$@" 2>/dev/null; rc=$?
  [ "$rc" != 0 ] || result=command_zero
  echo "beelink-gate: probe diagnostic host=$target attempt=$attempt phase=$phase result=$result exit=$rc nested_phase=$probe_nested_phase nested_exit=$probe_nested_exit stderr=discarded cause=unknown" >&2
  return "$rc"
}

# The policy rarely changes, so the last good read is kept per host. WSL interop
# (reg.exe) fails under load, and SSH can time out; a read up to seven days old
# still keeps gates out of the update window.
read_policy() {
  local target=$1 key='HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' policy="" cache
  cache="$STATE_DIR/policy-$target"
  if [ "$target" = "$SELF" ]; then
    policy=$(TRANSPORT_TIMEOUT_SECONDS=20 probe_transport "$target" windows_policy_local bounded_transport "$target Windows Update policy" "$REG_EXE" query "$key") || policy=""
  fi
  if ! grep -q ScheduledInstallDay <<<"$policy"; then
    policy=$(probe_transport "$target" windows_policy_ssh bounded_transport "$target Windows Update policy" ssh -n "${SSH_OPTIONS[@]}" "${BEELINK_IPS[$target]}" reg query "$key") || policy=""
  fi
  if grep -q ScheduledInstallDay <<<"$policy"; then
    mkdir -p "$STATE_DIR" 2>/dev/null && printf '%s\n' "$policy" > "$cache.tmp" 2>/dev/null && mv "$cache.tmp" "$cache" 2>/dev/null
    printf '%s\n' "$policy"
    return 0
  fi
  if [ -f "$cache" ] && [ -n "$(find "$cache" -mmin -10080 2>/dev/null)" ]; then
    echo "beelink-gate: using the cached Windows Update policy for $target" >&2
    cat "$cache"
    return 0
  fi
  return 1
}

# Sets window_day and window_hour from the beelink's Windows Update policy.
update_window_of() {
  local target=$1 policy day_hex hour_hex
  policy=$(read_policy "$target") || { echo "beelink-gate: cannot read Windows Update schedule from $target; refusing to start" >&2; return 2; }
  policy=$(printf '%s' "$policy" | tr -d '\r')
  day_hex=$(printf '%s\n' "$policy" | awk '$1 == "ScheduledInstallDay" && $2 == "REG_DWORD" {print $3}')
  hour_hex=$(printf '%s\n' "$policy" | awk '$1 == "ScheduledInstallTime" && $2 == "REG_DWORD" {print $3}')
  [[ "$day_hex" =~ ^0x[0-9a-fA-F]{1,8}$ && "$hour_hex" =~ ^0x[0-9a-fA-F]{1,8}$ ]] \
    || { echo "beelink-gate: invalid Windows Update schedule from $target; refusing to start" >&2; return 2; }
  window_day=$((16#${day_hex#0x}))
  window_hour=$((16#${hour_hex#0x}))
  (( window_day <= 7 && window_hour <= 23 )) \
    || { echo "beelink-gate: invalid Windows Update day/hour from $target; refusing to start" >&2; return 2; }
}

encode() { printf '%s' "$1" | base64 | tr -d '\n'; }

# One probe line for a beelink, or nothing when it cannot be read.
probe_of() {
  local target=$1 attempt line rc probe_attempt=0
  # A busy beelink's sshd drops some new connections (MaxStartups) while
  # hundreds of lane sessions are open; one dropped probe made auto treat the
  # host as unreachable for a whole placement round (ADC #10352, 2026-10-12
  # 00:01Z, beelink2 at load 70 answering SSH in under a second).
  for attempt in 1 2 3; do
    frontend_retry_check
    probe_attempt=$attempt
    if update_window_of "$target"; then
      line=$(heartbeat=0 probe_transport "$target" remote_probe on_beelink "$target" --probe "$(encode "$target")" "$(encode "$repo_url")" "$(encode "$window_day")" "$(encode "$window_hour")" "$(encode "$([ "${gate_class:-}" = dev ] && echo dev || echo "$install_mode")")" "$(encode "$install_mode")" \
        | grep '^beelink-gate-probe ' | tail -1)
      [ -z "$line" ] || { echo "$line"; return 0; }
      echo "beelink-gate: probe diagnostic host=$target attempt=$attempt phase=probe_protocol result=no_valid_line cause=unknown" >&2
    else
      rc=$?
      echo "beelink-gate: probe diagnostic host=$target attempt=$attempt phase=windows_policy_validation result=command_nonzero exit=$rc cause=unknown" >&2
    fi
    (( attempt == 3 )) || sleep "${BEELINK_GATE_PROBE_RETRY_SECONDS:-2}"
  done
  return 1
}

# --retry keeps each child transcript and reattaches a still-running exact ID;
# a natural AUTO 76 allocates a new placement. No TEMPFAIL line means no retry.
# Launcher transcript and lifecycle share this transport owner.
utc_at() { python3 -c 'import datetime as d, sys; print(d.datetime.fromtimestamp(int(sys.argv[1]), d.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))' "$1"; }
epoch_of_utc() { python3 -c 'import datetime as d, sys; print(int(d.datetime.strptime(sys.argv[1], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=d.timezone.utc).timestamp()))' "$1" 2>/dev/null; }
schedule_cancellation() {  # <gate id>
  echo "beelink-gate: manager stopped; scheduling cancellation of gate_id=$1" >&2
  # Without systemd-run (the Mac has neither it nor /usr/bin/bash) cancel inline.
  systemd-run --user --collect --unit="beelink-gate-cancel-$1" /usr/bin/bash "$0" --cancel-job "$1" >&2 \
    || "$BASH" "$0" --cancel-job "$1" >&2
}
wrap_child="" wrap_sleep="" wrap_stop=""
wrap_signal() {  # <exit code>
  # A repeat changes nothing: GNU timeout signals the launcher and then its process group.
  [ -z "$wrap_stop" ] || return 0
  # A group TERM can close tee's reader before this shell handles TERM.
  # Never let a second SIGPIPE abandon the cancellation/EXIT path.
  trap : PIPE
  exec >/dev/null 2>&1
  wrap_stop=$1
  frontend_stop_requested=1
  frontend_tainted=1
  # A background child starts with SIGINT ignored, so every stop reaches it as TERM.
  # With --cancel-on-term a launcher child cancels its own gate, and wrap_stopped
  # cancels a gate the wrapper re-attached to; without it the gate runs on for --attach.
  [ -z "$wrap_child" ] || kill -TERM "$wrap_child" 2>/dev/null || true
  [ -z "$wrap_sleep" ] || kill -TERM "$wrap_sleep" 2>/dev/null || true
}
wrap_stopped() {  # <exit code>; exact leaf was bound by the current frame owner
  if [ "${cancel_on_term:-0}" = 1 ] && [ -z "${frontend_cancel_gate:-}" ]; then
    frontend_tainted=1
    echo 'beelink-gate: UNKNOWN cancellation custody; no authenticated current leaf is available, native cancellation unconfirmed' >&2
  fi
  exit "$1"
}
run_wrapped() {  # <retry minutes, or empty> <summary 0|1> <launcher arguments>...
  local minutes=$1 summary=$2 deadline=0 attempt=0 rc line next wait_s reattach="" got tee_out tee_err i
  shift 2
  local dir
  dir=$(mktemp -d) || die "cannot allocate the gate transcript"
  frontend_transcript_dir=$dir
  trap 'wrap_signal 143' TERM
  trap 'wrap_signal 129' HUP
  trap 'wrap_signal 130' INT
  trap 'wrap_signal 141' PIPE
  if [ -n "$minutes" ]; then
    local retry_end=$((frontend_started_ms + minutes * 60000))
    frontend_retry_deadline_ms=$retry_end
    deadline=$(( $(date +%s) + (frontend_retry_deadline_ms - $(monotonic_ms) + 999) / 1000 ))
  fi
  while :; do
    [ -z "$wrap_stop" ] || wrap_stopped "$wrap_stop"
    attempt=$((attempt + 1))
    rm -f "$dir/out" "$dir/err"
    mkfifo "$dir/out" "$dir/err" || die "cannot create the gate transcript pipes"
    # The copies ignore stop signals, so a TERM sent to the whole process group
    # cannot cut off the child's own cancellation output; they end at its EOF.
    (trap '' HUP INT TERM; exec tee "$dir/out.log" < "$dir/out") & tee_out=$!
    (trap '' HUP INT TERM; exec tee "$dir/err.log" < "$dir/err" >&2) & tee_err=$!
    frontend_phase setup
    frontend_child_owner=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
    frontend_delegation_confirmed=""
    frontend_record delegate "$frontend_child_owner"
    [ "${frontend_output:-}" != "$frontend_child_owner" ] || frontend_delegation_confirmed=$frontend_child_owner
    if [ -n "$reattach" ]; then
      frontend_cancel_gate=""
      [ -z "$frontend_delegation_confirmed" ] || frontend_cancel_gate=$reattach
      BEELINK_GATE_CANCEL_ON_TERM="${cancel_on_term:-0}" BEELINK_GATE_FRONTEND_DEADLINE_MS="${frontend_retry_deadline_ms:-0}" BEELINK_GATE_FRONTEND_PATH="${frontend_path:-}" BEELINK_GATE_FRONTEND_TOKEN="${frontend_token:-}" BEELINK_GATE_FRONTEND_OWNER="$frontend_child_owner" "$BASH" "$0" --attach "$reattach" > "$dir/out" 2> "$dir/err" & wrap_child=$!
    else
      frontend_cancel_gate=""
      BEELINK_GATE_CANCEL_ON_TERM="${cancel_on_term:-0}" BEELINK_GATE_FRONTEND_DEADLINE_MS="${frontend_retry_deadline_ms:-0}" BEELINK_GATE_FRONTEND_PATH="${frontend_path:-}" BEELINK_GATE_FRONTEND_TOKEN="${frontend_token:-}" BEELINK_GATE_FRONTEND_OWNER="$frontend_child_owner" "$BASH" "$0" "$@" > "$dir/out" 2> "$dir/err" & wrap_child=$!
    fi
    # A stop that came before the child's pid was known is forwarded here.
    [ -z "$wrap_stop" ] || kill -TERM "$wrap_child" 2>/dev/null || true
    wait "$wrap_child"; rc=$?
    # A forwarded stop interrupts wait; keep waiting while the child handles it.
    while [ -n "$wrap_stop" ] && kill -0 "$wrap_child" 2>/dev/null; do wait "$wrap_child"; rc=$?; done
    wrap_child=""
    frontend_record claim "$frontend_child_owner" "$frontend_delegation_confirmed"
    # The existing authenticated state owner returns a leaf only after the
    # exact delegated child released it. Bind before tee drain or stop handling.
    if [ "$frontend_delegation_confirmed" = "$frontend_child_owner" ] && [[ "${frontend_output:-}" =~ ^beelink[12]-[0-9a-f]{32}$ ]]; then
      frontend_cancel_gate=$frontend_output
    else
      frontend_cancel_gate=""
    fi
    frontend_phase result_read
    # A process the child left behind may still hold the pipes; stop copying after 5s.
    for ((i = 0; i < 50; i++)); do
      kill -0 "$tee_out" 2>/dev/null || kill -0 "$tee_err" 2>/dev/null || break
      sleep 0.1
    done
    kill -KILL "$tee_out" "$tee_err" 2>/dev/null || true
    wait "$tee_out" "$tee_err" 2>/dev/null || true
    [ -z "$wrap_stop" ] || wrap_stopped "$wrap_stop"
    [ -n "$minutes" ] || break
    line=""
    if [ "$rc" = "$NOT_ADMITTED" ] && [ -n "$reattach" ]; then
      reattach="" wait_s=0 got="exit $NOT_ADMITTED (the gate gave its host back)"
    elif [ "$rc" = "$TEMPFAIL" ]; then
      line=$(grep -a '^beelink-gate: TEMPFAIL next_allowed=' "$dir/err.log" | tail -n 1)
      if [ -z "$line" ]; then
        tempfail "$(utc_in_minutes 5)" "--retry $minutes: attempt $attempt exited 75 without a TEMPFAIL line (a canceled gate or the command's own 75); not retrying it"
      fi
      reattach="" got=TEMPFAIL
      if [[ "$line" =~ beelink-gate\ --attach\ (beelink[12]-[0-9a-f]{32}) ]]; then
        [ "${BASH_REMATCH[1]}" = "${frontend_cancel_gate:-}" ] ||
          tempfail "$(utc_in_minutes 1)" 'retry attachment custody unconfirmed; transcript ID is not the authenticated current leaf, no new gate submitted'
        # The gate runs on: reconnect soon, whatever the line's next_allowed says.
        reattach=${BASH_REMATCH[1]} wait_s=10
      else
        next=${line#beelink-gate: TEMPFAIL next_allowed=}
        if next=$(epoch_of_utc "${next%% *}"); then
          wait_s=$(( next - $(date +%s) ))
          (( wait_s >= 30 )) || wait_s=30
        else
          wait_s=300
        fi
      fi
    else
      break
    fi
    # The test suite's hook to shorten every wait; callers never set it.
    [ -z "${BEELINK_GATE_RETRY_SECONDS:-}" ] || wait_s=$BEELINK_GATE_RETRY_SECONDS
    if (( $(monotonic_ms) + wait_s * 1000 >= frontend_retry_deadline_ms )); then
      echo "beelink-gate: --retry $minutes: the next attempt could not start before the retry window ends at $(utc_at "$deadline"); stopping after $attempt attempts" >&2
      [ -n "$line" ] || tempfail "$(utc_in_minutes 0)" "the last gate gave its host back; submit it again"
      echo "$line" >&2
      exit "$TEMPFAIL"
    fi
    echo "beelink-gate: --retry $minutes: attempt $attempt got $got; attempt $((attempt + 1)) ${reattach:+re-attaches to $reattach and }starts at $(utc_at $(( $(date +%s) + wait_s ))) (window ends $(utc_at "$deadline"))" >&2
    frontend_phase retry_wait
    sleep "$wait_s" & wrap_sleep=$!
    [ -z "$wrap_stop" ] || kill -TERM "$wrap_sleep" 2>/dev/null || true
    wait "$wrap_sleep"
    # A trapped TERM interrupts wait before the killed sleeper is reaped.
    # Complete ownership cleanup and return the signal, never the last attempt.
    if [ -n "$wrap_stop" ]; then
      while kill -0 "$wrap_sleep" 2>/dev/null; do wait "$wrap_sleep" 2>/dev/null || true; done
      wait "$wrap_sleep" 2>/dev/null || true
      wrap_sleep=""
      wrap_stopped "$wrap_stop"
    fi
    wrap_sleep=""
  done
  if [ "$summary" = 1 ] && [ "$rc" != 0 ] && [ "$rc" != "$TEMPFAIL" ]; then
    summarize_output "$rc" "$dir/out.log" "$dir/err.log"
  fi
  if [ -n "$merge_pr" ] && [ "$rc" = 0 ]; then
    merge_gated "$dir/err.log" || rc=$?
  fi
  exit "$rc"
}


# Frontend deadline and selector lifecycle; observation below is optional.
monotonic_ms() { python3 -c 'import time; print(time.monotonic_ns() // 1000000)'; }
frontend_retry_check() {
  (( ${frontend_retry_deadline_ms:-0} > 0 )) || return 0
  (( $(monotonic_ms) < frontend_retry_deadline_ms )) ||
    tempfail "$(utc_in_minutes 5)" "frontend deadline expired${frontend_cancel_gate:+; native state unconfirmed, run beelink-gate --attach $frontend_cancel_gate}"
}
frontend_signal() {
  trap : TERM INT HUP PIPE
  exec >/dev/null 2>&1
  frontend_tainted=1
  frontend_stop_requested=1
  exit "$1"
}
# Every blocking local transport/probe tree shares the selector's owned group.
# Waiting on an asynchronous child lets a signal to only this frontend PID run
# immediately; EXIT drains that exact group without touching native gate units.
start_frontend_group() {
  local monitor=0
  [[ $- != *m* ]] || monitor=1
  set -m
  (set +m; trap - EXIT TERM INT HUP PIPE; "$@") &
  frontend_spawned_pid=$!
  (( monitor )) || set +m
  frontend_group_identities[$frontend_spawned_pid]=$(frontend_group_identity "$frontend_spawned_pid")
}
frontend_group_identity() {  # <local Bash group leader>; PID is also expected PGID
  local pid=$1 line
  local -a fields=()
  if [ -r "/proc/$pid/stat" ]; then
    IFS= read -r line < "/proc/$pid/stat" || return 1
    read -r -a fields <<< "${line##*) }"
    [ "${fields[2]:-}" = "$pid" ] && [ -n "${fields[19]:-}" ] || return 1
    printf 'proc:%s:%s\n' "$pid" "${fields[19]}"
  else
    line=$(ps -p "$pid" -o pgid= -o lstart= 2>/dev/null) || return 1
    read -r -a fields <<< "$line"
    [ "${fields[0]:-}" = "$pid" ] && [ "${#fields[@]}" = 6 ] || return 1
    printf 'ps:%s\n' "${fields[*]}"
  fi
}
run_cancelable() {
  local rc
  frontend_retry_check
  frontend_selector_active=1 start_frontend_group "$@"
  frontend_selector_pid=$frontend_spawned_pid
  wait "$frontend_selector_pid"; rc=$?
  stop_frontend_selector
  return "$rc"
}
frontend_capture() {  # <variable> <command...>
  local capture_name=$1 capture_file capture_status
  shift
  capture_file=$(mktemp) || return "$TEMPFAIL"
  frontend_selector_output=$capture_file
  run_cancelable "$@" > "$capture_file"; capture_status=$?
  printf -v "$capture_name" '%s' "$(cat "$capture_file")"
  rm -f "$capture_file"
  frontend_selector_output=""
  return "$capture_status"
}
resolve_attachment_exit() {  # <host> <exact gate id> <transport exit>; sets rc
  rc=$3
  [ "$rc" != 0 ] || return 0
  frontend_phase result_read
  local result=""
  heartbeat=0 frontend_capture result on_beelink "$1" --job-result "$2" 2>/dev/null || result=""
  # SSH's255 and local transport signals overlap real command exit codes.
  # Only the native terminal owner disambiguates them. Unknown stays attachable.
  if [[ "$result" =~ ^[0-9]{1,3}$ ]] && (( 10#$result <= 255 )); then
    rc=$((10#$result))
    return 0
  fi
  tempfail "$(utc_in_minutes 1)" "attach transport unconfirmed for $2; run beelink-gate --attach $2 again"
}
frontend_select() {
  local selection
  frontend_capture selection select_target || return $?
  read -r target window_day window_hour <<< "$selection"
  [[ "$target" =~ ^beelink[12]$ && "$window_day" =~ ^[0-7]$ && "$window_hour" =~ ^[0-9]+$ ]]
}
select_target() {
  local target window_day window_hour
  local placement_end=$((frontend_started_ms + $(seconds_of "${BEELINK_GATE_LOAD_WAIT:-30m}") * 1000))
  (( frontend_retry_deadline_ms <= placement_end )) || frontend_retry_deadline_ms=$placement_end
  case "$requested" in
    beelink1|100.98.195.7) target=$(place_named beelink1) ;;
    beelink2|100.127.22.51) target=$(place_named beelink2) ;;
    auto) target=$(choose_beelink) || return $? ;;
    *) die "unknown beelink: $requested" ;;
  esac
  update_window_of "$target" || tempfail "$(utc_in_minutes 5)" "cannot read the Windows Update schedule of $target"
  printf '%s %s %s\n' "$target" "$window_day" "$window_hour"
}
stop_frontend_group() {  # <exact group created by start_frontend_group>
  local pid=$1 i expected=${frontend_group_identities[$1]:-} actual
  if ! kill -0 -- "-$pid" 2>/dev/null; then
    wait "$pid" 2>/dev/null || true
    return 0
  fi
  actual=$(frontend_group_identity "$pid") || actual=""
  if [ -z "$expected" ] || [ "$actual" != "$expected" ]; then
    frontend_tainted=1
    echo "beelink-gate: UNKNOWN local group=$pid incarnation; cleanup refused, expected=$expected observed=$actual" >&2
    return "$TEMPFAIL"
  fi
  kill -TERM -- "-$pid" 2>/dev/null || true
  for ((i=0; i<TRANSPORT_KILL_GRACE_SECONDS * 10; i++)); do
    kill -0 -- "-$pid" 2>/dev/null || break
    sleep 0.1
  done
  if kill -0 -- "-$pid" 2>/dev/null; then
    actual=$(frontend_group_identity "$pid") || actual=""
    if [ -n "$expected" ] && [ "$actual" = "$expected" ]; then
      kill -KILL -- "-$pid" 2>/dev/null || true
    fi
  fi
  for ((i=0; i<TRANSPORT_KILL_GRACE_SECONDS * 10; i++)); do
    kill -0 -- "-$pid" 2>/dev/null || break
    sleep 0.1
  done
  if kill -0 "$pid" 2>/dev/null || kill -0 -- "-$pid" 2>/dev/null; then
    frontend_tainted=1
    echo "beelink-gate: UNKNOWN owned local group=$pid could not be drained; retain its identity for host-owner recovery" >&2
    return "$TEMPFAIL"
  fi
  wait "$pid" 2>/dev/null || true
}
stop_frontend_selector() {
  if [ -n "${frontend_selector_pid:-}" ]; then
    stop_frontend_group "$frontend_selector_pid" || frontend_tainted=1
    frontend_selector_pid=""
  fi
}

frontend_io() {
  local rc=0
  [ -n "${frontend_timer:-}" ] || return 1
  (
    for frontend_fd in ${lock_fd:-} ${slot_fd:-} ${capacity_fd:-} ${writer_fd:-} ${gate_turbo_fd:-} ${heartbeat_fd:-}; do
      exec {frontend_fd}>&-
    done
    exec "$frontend_timer" --kill-after=1 2 python3 -c "$beelink_gate_metrics_source"$'\n''import sys; globals()[sys.argv[1]](*sys.argv[2:])' "$@"
  ) </dev/null 2>/dev/null || rc=$?
  return "$rc"
}
frontend_record() {
  [ -n "${frontend_path:-}" ] || return 0
  # A failed/interrupting transition cannot silently become a measured interval.
  [ "${frontend_waiting:-0}" != 1 ] || frontend_tainted=1
  frontend_waiting=1
  local rc=0
  frontend_output=$(frontend_io frontend_observe "$frontend_path" "$frontend_token" "$frontend_owner" "$frontend_source" \
    "$1" "${2:-}" "${3:-}" "${4:-}" "$frontend_tainted" "${5:-}") || rc=$?
  frontend_waiting=0
  if [ "$rc" != 0 ]; then
    frontend_tainted=1
    [ "${frontend_warned:-0}" = 1 ] || echo 'beelink-gate: optional frontend observation incomplete; gate policy/result unchanged' >&2
    frontend_warned=1
  fi
  return 0
}
frontend_start() {
  frontend_path="" frontend_tainted=0 frontend_waiting=0 frontend_root=1 frontend_warned=0 frontend_stop_requested=0
  # Cleanup is required even when optional observation bootstrap is unsupported.
  trap 'frontend_exit "$?"' EXIT
  trap 'frontend_signal 143' TERM
  trap 'frontend_signal 130' INT
  trap 'frontend_signal 129' HUP
  trap 'frontend_signal 141' PIPE
  frontend_cancel_gate=""
  frontend_selector_pid="" frontend_selector_output=""
  frontend_started_ms=$(monotonic_ms) || die 'cannot read the frontend monotonic clock'
  # Existing load-wait and hold budgets bound a default frontend. An explicit
  # retry window is immutable across its delegated children on this same clock.
  local frontend_budget
  frontend_budget=$(( $(seconds_of "${BEELINK_GATE_LOAD_WAIT:-30m}") + $(seconds_of "${BEELINK_GATE_MAX_HOLD:-45m}") ))
  (( frontend_budget > 0 )) || die 'invalid frontend load/hold budget'
  frontend_retry_deadline_ms=${BEELINK_GATE_FRONTEND_DEADLINE_MS:-$((frontend_started_ms + frontend_budget * 1000))}
  cancel_on_term=${BEELINK_GATE_CANCEL_ON_TERM:-${cancel_on_term:-0}}
  unset BEELINK_GATE_CANCEL_ON_TERM
  [[ "$cancel_on_term" =~ ^[01]$ ]] || die 'invalid inherited cancellation intent'
  unset BEELINK_GATE_FRONTEND_DEADLINE_MS
  [[ "$frontend_retry_deadline_ms" =~ ^[1-9][0-9]*$ ]] || die 'invalid frontend retry deadline'
  local inherited_path=${BEELINK_GATE_FRONTEND_PATH:-} inherited_token=${BEELINK_GATE_FRONTEND_TOKEN:-} inherited_owner=${BEELINK_GATE_FRONTEND_OWNER:-} setup rc=0
  unset BEELINK_GATE_FRONTEND_PATH BEELINK_GATE_FRONTEND_TOKEN BEELINK_GATE_FRONTEND_OWNER
  frontend_timer=$(command -v timeout || command -v gtimeout) || {
    echo 'beelink-gate: optional frontend timing unavailable: no portable timeout owner' >&2
    return 0
  }
  frontend_source=$(emit_gate_source | "$frontend_timer" --kill-after=1 2 python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())') || return 0
  if [ -n "$inherited_path$inherited_token$inherited_owner" ]; then
    frontend_path=$inherited_path frontend_token=$inherited_token frontend_owner=$inherited_owner frontend_root=0
    frontend_record claim
    # Source skew cannot start a parallel request or write into the old scope.
    [ "$frontend_tainted" = 0 ] || frontend_path=""
  else
    setup=$(frontend_io frontend_begin "$STATE_DIR/requests" "$frontend_source" "$job_retention_seconds") || rc=$?
    if [ "$rc" = 0 ]; then
      mapfile -t frontend_setup <<< "$setup"
      if [ "${#frontend_setup[@]}" = 3 ]; then
        frontend_path=${frontend_setup[0]} frontend_token=${frontend_setup[1]} frontend_owner=${frontend_setup[2]}
      fi
    fi
  fi
  [ -n "$frontend_path" ] || echo 'beelink-gate: optional frontend timing unavailable: source/authority/IO unsupported; request duration unknown' >&2
  [ -z "$frontend_path" ] || echo "beelink-gate: frontend_observation=$frontend_path" >&2
}
frontend_phase() { frontend_record phase "$1"; }
frontend_exit() {
  local saved=$1
  trap - EXIT
  trap : TERM INT HUP PIPE
  stop_frontend_selector
  # A lost SSH or expired frontend deadline leaves the exact native job
  # running for --attach. Only an explicit handled signal requests cancellation.
  if [ "${cancel_on_term:-0}" = 1 ] && [ "${frontend_stop_requested:-0}" = 1 ]; then
    local cancel_id=${frontend_cancel_gate:-}
    if [ -n "$cancel_id" ]; then
      exec >/dev/null 2>&1
      schedule_cancellation "$cancel_id" || frontend_tainted=1
    fi
  fi
  [ -z "${frontend_selector_output:-}" ] || rm -f "$frontend_selector_output"
  # Reservation children own no request capability and must finish before root end.
  if [ -n "${checkout_reservation_dir:-}" ]; then
    frontend_phase reservation_cleanup
    stop_checkout_reservations
  fi
  [ -z "${frontend_transcript_dir:-}" ] || rm -rf -- "$frontend_transcript_dir"
  if [ "${frontend_root:-1}" = 1 ]; then frontend_record end "" "" "" "$saved"
  else frontend_record release "" "" "" "$saved"; fi
  return "$saved"
}
frontend_local_records() {
  local timer
  timer=$(command -v timeout || command -v gtimeout) || return 0
  "$timer" --kill-after=1 2 python3 -c "$beelink_gate_metrics_source"$'\n''import sys; frontend_retained(sys.argv[1], int(sys.argv[2]))' "$STATE_DIR/requests" "$1" 2>/dev/null ||
    printf '%s\n' '{"kind":"frontend_observations","origin":"local","entries":[],"error":"unavailable_or_timeout","truncated":true}'
}

# --summary: a red gate's test counts and failing tests, printed last so a
# caller's tail still shows the cause. It reads the node test runner's spec
# reporter ("ℹ tests 3" counts, the "✖ failing tests:" section), TAP
# ("# tests 3" counts, each "not ok" line with its indented diagnostics) and
# vitest ("Test Files  1 failed | 2 passed (3)" counts, each "FAIL  file > test"
# line with its error's first line).
summarize_output() {  # <exit code> <output file>...
  python3 - "$@" <<'PY' >&2
import re, sys
code, paths = sys.argv[1], sys.argv[2:]
ansi = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
keys = "tests|suites|pass|fail|cancelled|skipped|todo|duration_ms"
count = re.compile(rf"^(?:ℹ|#) ({keys}) (\S+)$")
not_ok = re.compile(r"^(\s*)not ok\b")
vitest_count = re.compile(r"^\s*(Test Files|Tests)\s{2,}((?:\d+ [a-z]+(?: \| )?)+) \((\d+)\)$")
vitest_fail = re.compile(r"^\s*FAIL\s{1,2}\S")
groups, blocks = [], []
def close(block, kind):
    # A suite's own "not ok" only says that a subtest failed; the subtest's block has the cause.
    if kind == "tap" and any("failureType: 'subtestsFailed'" in l for l in block):
        return
    while block and not block[-1].strip():
        block.pop()
    blocks.append(block)
for path in paths:
    group, block, kind, depth = {}, None, None, 0
    try:
        lines = open(path, encoding="utf-8", errors="replace")
    except OSError:
        continue
    with lines:
        for raw in lines:
            line = ansi.sub("", raw.rstrip("\r\n"))
            if block is not None and kind == "vitest":
                # A vitest failure ends at its "⎯" rule or the next FAIL; keep the error's first line.
                if not (line.startswith("⎯") or vitest_fail.match(line)):
                    if line.strip() and len(block) < 2:
                        block.append(line)
                    continue
                close(block, kind)
                block = None
            if block is not None:
                indent = len(line) - len(line.lstrip())
                if not line.strip() or (kind == "spec" and (indent or line.startswith(("test at ", "✖ ")))) \
                        or (kind == "tap" and indent > depth):
                    block.append(line)
                    continue
                close(block, kind)
                block = None
            match = count.match(line)
            if match:
                group[match[1]] = match[2]
                continue
            if (match := vitest_count.match(line)):
                prefix = "files_" if match[1] == "Test Files" else ""
                group["files" if prefix else "tests"] = match[3]
                for n, state in re.findall(r"(\d+) ([a-z]+)", match[2]):
                    group[prefix + state] = n
                continue
            if group:
                groups.append(group)
                group = {}
            if line == "✖ failing tests:":
                block, kind = [line], "spec"
            elif vitest_fail.match(line):
                block, kind = [line.strip()], "vitest"
            elif (match := not_ok.match(line)):
                block, kind, depth = [line], "tap", len(match[1])
    if block is not None:
        close(block, kind)
    if group:
        groups.append(group)
print(f"beelink-gate: summary of the failed command (exit {code})")
shown = [l for b in blocks for l in b]
limit = 200
for l in shown[:limit]:
    print(l)
if len(shown) > limit:
    print(f"beelink-gate: summary omitted {len(shown) - limit} more failing-test lines; the full output is above")
for g in groups:
    print("beelink-gate: summary " + " ".join(f"{k}={v}" for k, v in g.items()))
if not blocks and not groups:
    print("beelink-gate: summary found no test counts or failing tests in the command output")
PY
}
github_repo() {  # <repo-url>: prints owner/name of a GitHub URL, or fails
  local r=$1
  case "$r" in
    git@github.com:*) r=${r#git@github.com:} ;;
    ssh://git@github.com/*) r=${r#ssh://git@github.com/} ;;
    https://github.com/*) r=${r#https://github.com/} ;;
    *) return 1 ;;
  esac
  r=${r%/}; r=${r%.git}
  [[ "$r" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || return 1
  printf '%s\n' "$r"
}
merge_gated() {  # <gate stderr log>
  local id out sha
  id=$(grep -ao 'gate_id=[A-Za-z0-9-]*' "$1" | tail -n 1)
  id=${id#gate_id=}
  # gh-drew requires this gate's own receipt for a release-path repo (its gated_repos).
  if out=$(BEELINK_GATE_ID="$id" gh-drew pr merge "$merge_pr" -R "$merge_repo" --squash --match-head-commit "$merge_sha" 2>&1); then
    sha=$(gh-drew pr view "$merge_pr" -R "$merge_repo" --json mergeCommit --jq '.mergeCommit.oid // ""' 2>/dev/null)
    echo "beelink-gate: merged #$merge_pr ${sha:-unknown} gate_id=${id:-unknown}" >&2
    return 0
  fi
  echo "beelink-gate: merge of #$merge_pr refused: $(printf '%s' "$out" | tr '\n' ' ' | tail -c 300)" >&2
  return "$MERGE_REFUSED"
}
# The gated commit's checkout shape, read before any beelink fetches it, so each
# host's reserve comes from a receipt of the same shape (last_install_reserve_bytes).
commit_sparse_spec() {  # <repo-url> <sha>; prints nothing when it cannot tell
  local host owner repo gh raw err
  parse_repo_url "$1" 2>/dev/null || return 0
  if [ "$host" = github.com ]; then
    gh=$(command -v gh-drew || command -v gh) || return 0
    err=$(mktemp) || return 0
    if raw=$(bounded_transport "source sparse lookup" "$gh" api "repos/$owner/$repo/contents/.beelink-gate/sparse-checkout?ref=$2" --jq .content 2>"$err"); then
      printf '%s' "$raw" | tr -d '\n' | base64 --decode | sparse_spec_of
    elif grep -q 'HTTP 404' "$err"; then
      echo full
    fi
    rm -f "$err"
  elif [ "$host" = local ] && git -C "${1#file://}" cat-file -e "$2^{commit}" 2>/dev/null; then
    git -C "${1#file://}" cat-file blob "$2:.beelink-gate/sparse-checkout" 2>/dev/null | sparse_spec_of
  fi
}
