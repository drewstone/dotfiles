#!/usr/bin/env bash
# Complete, validated source bundling, transport and job staging.
# Sourced by beelink-gate and embedded into every submitted script.

# gh-drew from its install, not only from PATH: a watcher that ran beelink-gate by its full path had no ~/bin
# on PATH, and --merge failed after a passing gate. gh-drew lives in tangle-tools github/ (tangle-tools#2104) and
# tangle-tools-deploy links it into ~/.local/bin and ~/bin. Never plain gh, another identity.
gh_drew=""
for candidate in "${gate_source_root:+$gate_source_root/gh-drew}" "$HOME/.local/bin/gh-drew" "$HOME/bin/gh-drew"; do
  [ -n "$candidate" ] && [ -x "$candidate" ] && { gh_drew=$candidate; break; }
done
[ -n "$gh_drew" ] || gh_drew=$(command -v gh-drew || true)

emit_gate_source() {
  local generated status
  generated=$(mktemp) || return "$TEMPFAIL"
  if ! awk -v installer="${gate_installer_source:-}" -v staging="${gate_staging_source:-}" -v cache="${gate_cache_source:-}" -v admission="${gate_admission_source:-}" -v resources="${gate_resources_source:-}" -v jobs="${gate_jobs_source:-}" -v gtr="${gate_gtr_source:-}" -v disk="${gate_disk_source:-}" -v release="${gate_release_source:-}" -v metrics="${gate_metrics_source:-}" '
    function append(file, line, status, count) {
      while ((status = getline line < file) > 0) { print line; count++ }
      close(file)
      if (status < 0 || count == 0) exit 1
    }
    { last = $0 }
    $0 == "# BEELINK_GATE_INSTALLER_START" {
      starts++; append(installer); append(staging); append(cache); append(admission); append(resources); append(jobs); append(gtr)
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
  local -a transport_prefix=() envs=("BEELINK_GATE_LAUNCHER=$launcher_name")
  case "${1:-}" in
    --reserve-match|--job-cancel|--disk-floor-bytes) transport_prefix=(bounded_transport "$target $1") ;;
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
  local me=$$ rc heartbeat_fd heartbeat_pid command_pid args_line="" source_file=""
  if [ "$target" != "$SELF" ]; then
    source_file=$(mktemp) || return "$TEMPFAIL"
    emit_gate_source > "$source_file" || {
      rc=$?
      [ "${probe_diagnostic_scope:-0}" != 1 ] || { probe_nested_phase=source_emit; probe_nested_exit=$rc; }
      rm -f "$source_file"; return "$TEMPFAIL"
    }
  fi
  # Windows OpenSSH refuses an exec request whose command line passes about 32 KB ("exec request failed on channel 0");
  # a 23 KB patch, base64 encoded in argv, became 41,676 bytes and the submit was reported as a lost connection. Large
  # arguments ride on stdin ahead of the script instead. The limit that binds first is cmd.exe's 8,191 characters for
  # the whole line OpenSSH hands it: wsl.exe, every env assignment and bash -s, not only the arguments. 7,821 argument
  # bytes passed an arguments-only 8,192 check and the full line failed "command line too long". Measure the line ssh
  # sends, with a margin for the cmd.exe /c wrapper.
  local -a remote_args=("$@")
  local remote_line_bytes
  remote_line_bytes=$(printf '%s ' wsl.exe -- env "${envs[@]}" bash -s -- "$@" | wc -c)
  if (( remote_line_bytes > 8191 - 512 )); then
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
      # A beat while the launcher touched BEELINK_GATE_HEARTBEAT_BEAT in the last 10 s: it is still placing this gate.
      [ -z "${BEELINK_GATE_HEARTBEAT_BEAT:-}" ] || (( $(stat -c %Y "$BEELINK_GATE_HEARTBEAT_BEAT" 2>/dev/null || echo 0) < $(date +%s) - 10 )) || printf '\n'
      sleep 5 & sleeper=$!; wait "$sleeper" || true; sleeper=""
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


bounded_transport() {
  local label=$1 timer rc; shift
  timer=$(command -v timeout || command -v gtimeout) || {
    echo "beelink-gate: cannot bound $label: GNU timeout is unavailable" >&2
    return "$TEMPFAIL"
  }
  "$timer" --kill-after="${TRANSPORT_KILL_GRACE_SECONDS}s" "${TRANSPORT_TIMEOUT_SECONDS}s" "$@"; rc=$?
  case "$rc" in
    124|137)
      [ "${probe_diagnostic_scope:-0}" != 1 ] || { probe_nested_phase=transport_command; probe_nested_exit=$rc; }
      echo "beelink-gate: $label unconfirmed (exit $rc; transport deadline $TRANSPORT_TIMEOUT_SECONDS seconds)" >&2
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

# The policy rarely changes, so the last good read is kept per host. WSL interop (reg.exe) fails under load, and SSH can
# time out; a read up to seven days old still keeps gates out of the update window.
read_policy() {
  local target=$1 key='HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' policy="" cache
  cache="$STATE_DIR/policy-$target"
  if [ "$target" = "$SELF" ]; then
    policy=$(probe_transport "$target" windows_policy_local timeout 20 "$REG_EXE" query "$key") || policy=""
  fi
  if ! grep -q ScheduledInstallDay <<<"$policy"; then
    policy=$(probe_transport "$target" windows_policy_ssh bounded_transport "$target Windows Update policy" ssh "${SSH_OPTIONS[@]}" "${BEELINK_IPS[$target]}" reg query "$key") || policy=""
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

# Before placement (10-26 failure sweep #10, ~58 gate requests a day): a commit GitHub lacks is refused, and an input
# whose latest receipt (--receipt) is the command's own red returns it, not a rerun. A slow or failed read never refuses.
pre_placement_checks() {  # <command>...
  local err cmd red
  if [[ "$frontend_key" == github.com/* ]] && [ -x "$gh_drew" ] && err=$(mktemp); then
    timeout 5 "$gh_drew" api "repos/${frontend_key#github.com/}/commits/$sha" --jq .sha >/dev/null 2>"$err" \
      || { grep -qE 'HTTP (404|422)' "$err" && die "commit $sha is not on ${frontend_key#github.com/}; push it first"; echo "beelink-gate: could not confirm $sha on GitHub within 5 s; placing it anyway" >&2; }
    rm -f "$err"
  fi
  [ "${BEELINK_GATE_RERUN:-0}" != 1 ] && [ -z "$gate_branch" ] && [ "$gate_class" != dev ] && [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || return 0
  printf -v cmd '%q ' "$@"
  red=$("$BASH" "$0" --receipt "$repo_url" "$sha" 2>/dev/null | python3 -c '
import json, sys
mode, cls, command = sys.argv[1:]
rows = [r for r in map(json.loads, sys.stdin) if (r.get("mode"), r.get("class"), r.get("command")) == (mode, cls, command)]
r = max(rows, key=lambda r: r.get("at", ""), default=None)  # the latest identical run; only a command red counts
if r and r["exit"] not in (0, 2, 3, 75, 76, 124, 130, 137, 143) and not (r.get("timed_out") or r.get("watchdog") or r.get("starved")):
    print(r["exit"], f"host={r.get(\"host\")} gate_id={r.get(\"gate_id\")} at={r.get(\"at\")} exit={r[\"exit\"]}")' \
    "$install_mode" "$([ "$install_mode" = light ] && echo light || echo normal)" "${cmd% }")
  [ -z "$red" ] || { echo "beelink-gate: identical input already red: ${red#* } (BEELINK_GATE_RERUN=1 runs it again)" >&2; exit "${red%% *}"; }
}

# One probe line for a beelink, or nothing when it cannot be read.
probe_of() {
  local target=$1 attempt line rc probe_attempt=0
  # A busy beelink's sshd drops some new connections (MaxStartups) while hundreds of lane sessions are open; one dropped
  # probe made auto treat the host as unreachable for a whole placement round (ADC #10352, 2026-10-12 00:01Z, beelink2
  # at load 70 answering SSH in under a second).
  for attempt in 1 2 3; do
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
  wrap_stop=$1
  frontend_tainted=1
  # A background child starts with SIGINT ignored, so every stop reaches it as TERM.
  # With --cancel-on-term a launcher child cancels its own gate, and wrap_stopped
  # cancels a gate the wrapper re-attached to; without it the gate runs on for --attach.
  [ -z "$wrap_child" ] || kill -TERM "$wrap_child" 2>/dev/null || true
  [ -z "$wrap_sleep" ] || kill -TERM "$wrap_sleep" 2>/dev/null || true
}
wrap_stopped() {  # <exit code> <gate id this wrapper attaches to, or empty>
  [ "$cancel_on_term" != 1 ] || [ -z "$2" ] || schedule_cancellation "$2"
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
  [ -z "$minutes" ] || deadline=$(( $(date +%s) + minutes * 60 ))
  while :; do
    [ -z "$wrap_stop" ] || wrap_stopped "$wrap_stop" "$reattach"
    attempt=$((attempt + 1))
    rm -f "$dir/out" "$dir/err"
    mkfifo "$dir/out" "$dir/err" || die "cannot create the gate transcript pipes"
    # The copies ignore stop signals, so a TERM sent to the whole process group
    # cannot cut off the child's own cancellation output; they end at its EOF.
    (trap '' HUP INT TERM; exec tee "$dir/out.log" < "$dir/out") & tee_out=$!
    (trap '' HUP INT TERM; exec tee "$dir/err.log" < "$dir/err" >&2) & tee_err=$!
    frontend_phase setup
    frontend_child_owner=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
    frontend_record delegate "$frontend_child_owner"
    if [ -n "$reattach" ]; then
      BEELINK_GATE_FRONTEND_PATH="${frontend_path:-}" BEELINK_GATE_FRONTEND_TOKEN="${frontend_token:-}" BEELINK_GATE_FRONTEND_OWNER="$frontend_child_owner" "$BASH" "$0" --attach "$reattach" > "$dir/out" 2> "$dir/err" & wrap_child=$!
    else
      BEELINK_GATE_FRONTEND_PATH="${frontend_path:-}" BEELINK_GATE_FRONTEND_TOKEN="${frontend_token:-}" BEELINK_GATE_FRONTEND_OWNER="$frontend_child_owner" "$BASH" "$0" "$@" > "$dir/out" 2> "$dir/err" & wrap_child=$!
    fi
    # A stop that came before the child's pid was known is forwarded here.
    [ -z "$wrap_stop" ] || kill -TERM "$wrap_child" 2>/dev/null || true
    wait "$wrap_child"; rc=$?
    # A forwarded stop interrupts wait; keep waiting while the child handles it.
    while [ -n "$wrap_stop" ] && kill -0 "$wrap_child" 2>/dev/null; do wait "$wrap_child"; rc=$?; done
    wrap_child=""
    frontend_record claim "$frontend_child_owner"
    frontend_phase result_read
    # A process the child left behind may still hold the pipes; stop copying after 5s.
    for ((i = 0; i < 50; i++)); do
      kill -0 "$tee_out" 2>/dev/null || kill -0 "$tee_err" 2>/dev/null || break
      sleep 0.1
    done
    kill -KILL "$tee_out" "$tee_err" 2>/dev/null || true
    wait "$tee_out" "$tee_err" 2>/dev/null || true
    [ -z "$wrap_stop" ] || wrap_stopped "$rc" "$reattach"
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
    if (( $(date +%s) + wait_s > deadline )); then
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


# Optional caller-local observation. Capability is never exported or transported.
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
  frontend_path="" frontend_tainted=0 frontend_waiting=0 frontend_root=1 frontend_warned=0
  # Cleanup is required even when optional observation bootstrap is unsupported.
  trap 'frontend_exit "$?"' EXIT
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
