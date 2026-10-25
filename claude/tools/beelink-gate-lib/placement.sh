#!/usr/bin/env bash
# Frontend host placement and owned FIFO reservations.
# Sourced by beelink-gate and embedded in every immutable submitted source.

# Runs this script with arguments on a beelink: locally on itself, else in WSL
# over SSH. stdin carries the script (SSH) and then stays open as the heartbeat.

checkout_reservation_pids=() checkout_reservation_files=() checkout_reservation_hosts=() checkout_reservation_dir="" checkout_monitor_pid=""
declare -A checkout_reservation_lost=()

field() { sed -n "s/.* $1=\([^ ]*\).*/\1/p" <<<"$2"; }
overloaded() { local load limit; load=$(field load "$1") limit=$(field limit "$1"); [ -n "$load" ] && [ -n "$limit" ] && over_limit "$load" "$limit"; }

# A named beelink over its load limit hands the gate to the other one when that
# one can start it under its own limit; otherwise the gate stays and waits there.
place_named() {
  local named=$1 other line other_line
  if [ "${pin_host:-0}" = 1 ]; then echo "$named"; return 0; fi
  other=$([ "$named" = beelink1 ] && echo beelink2 || echo beelink1)
  line=$(probe_of "$named") || line=""
  if [ -z "$line" ] || ! overloaded "$line"; then echo "$named"; return 0; fi
  other_line=$(probe_of "$other") || other_line=""
  if [ -n "$other_line" ] && [ "$(field state "$other_line")" != refused ] && ! overloaded "$other_line"; then
    echo "beelink-gate: $named load $(field load "$line") is over its limit of $(field limit "$line"); running on $other (load $(field load "$other_line"), limit $(field limit "$other_line"))" >&2
    echo "$other"; return 0
  fi
  echo "$named"
}

# Probes both beelinks and prints the one to use; waits while both are busy.
choose_beelink() {
  local target line state cache load slots best="" best_rank=9 best_load rank waited=0 reported=-60 light_busy next
  local -A seen=()
  local auto_started=$SECONDS pause left
  while :; do
    frontend_retry_check
    check_checkout_reservations
    best="" best_rank=9 best_load="" light_busy=""
    for target in beelink1 beelink2; do
      frontend_retry_check
      [ -z "${checkout_reservation_lost[$target]:-}" ] || { seen[$target]="unreachable"; continue; }
      line=$(probe_of "$target") || line=""
      frontend_retry_check
      [ -n "$line" ] || { seen[$target]="unreachable"; continue; }
      seen[$target]=${line#beelink-gate-probe }
      state=$(sed -n 's/.* state=\([a-z]*\).*/\1/p' <<<"$line"); cache=$(sed -n 's/.* cache=\([a-z]*\).*/\1/p' <<<"$line")
      load=$(sed -n 's/.* load=\([0-9.]*\).*/\1/p' <<<"$line")
      slots=$(sed -n 's/.* slots=\([0-9]*\).*/\1/p' <<<"$line")
      if [ "$state" = busy ] && ! overloaded "$line"; then light_busy=$target; fi
      # A free repo lock with no free host slot still queues, behind any gate.
      case "$state:$cache:$([ "${slots:-1}" -gt 0 ] && echo slot || echo full)" in
        free:warm:slot) rank=0 ;; free:cold:slot) rank=1 ;; free:*:full) rank=2 ;; *) continue ;;
      esac
      # Any host that can admit beats an overloaded one. If both would wait,
      # a warm cache cannot admit sooner than a cold cache: prefer the host
      # closer to its pressure limit while keeping a free slot ahead of a full pool.
      if overloaded "$line"; then
        case "$rank" in 0|1) rank=3 ;; *) rank=5 ;; esac
      fi
      if (( rank < best_rank )) || { (( rank == best_rank )) && awk -v a="${load:-0}" -v b="${best_load:-1e9}" 'BEGIN{exit !(a < b)}'; }; then
        best=$target best_rank=$rank best_load=$load
      fi
    done
    # A repo lock frees in minutes; load over the limit can last the whole
    # load wait. Keep probing rather than queue on an overloaded host while
    # the other one is under its limit and only busy with this repo.
    if (( best_rank >= 3 )) && [ -n "$light_busy" ]; then best=""; fi
    if [ -n "$best" ]; then
      frontend_retry_check
      check_checkout_reservations
      [ -z "${checkout_reservation_lost[$best]:-}" ] || continue
      echo "beelink-gate: auto chose $best after ${waited}s (beelink1: ${seen[beelink1]:-?}; beelink2: ${seen[beelink2]:-?})" >&2
      echo "$best"; return 0
    fi
    if [ "${seen[beelink1]:-}" = unreachable ] && [ "${seen[beelink2]:-}" = unreachable ]; then
      tempfail "$(utc_in_minutes 5)" "no beelink is reachable from $(hostname)"
    fi
    if [[ "${seen[beelink1]:-}" != *state=busy* && "${seen[beelink2]:-}" != *state=busy* ]]; then
      echo "beelink-gate: no beelink can start this gate (beelink1: ${seen[beelink1]:-?}; beelink2: ${seen[beelink2]:-?})" >&2
      # The earliest time either refusing host names.
      next=$(printf '%s\n' "$(field next "${seen[beelink1]:-}")" "$(field next "${seen[beelink2]:-}")" | grep -E '^[0-9]{4}-' | sort | head -1)
      tempfail "${next:-$(utc_in_minutes 5)}" "no beelink can start this gate"
    fi
    if (( waited - reported >= 60 )); then
      echo "beelink-gate: no beelink is both free for this repo and under its load limit after ${waited}s; waiting (beelink1: ${seen[beelink1]:-?}; beelink2: ${seen[beelink2]:-?})" >&2
      reported=$waited
    fi
    pause=${BEELINK_GATE_AUTO_POLL_SECONDS:-$([ "${BEELINK_GATE_URGENT:-0}" = 1 ] && echo 2 || echo 20)}
    if (( ${frontend_retry_deadline_ms:-0} > 0 )); then
      left=$(( (frontend_retry_deadline_ms - $(monotonic_ms) + 999) / 1000 ))
      (( left > 0 )) || { frontend_retry_check; continue; }
      (( pause <= left )) || pause=$left
    fi
    sleep "$pause"; waited=$((SECONDS - auto_started))
  done
}

# Auto gates need a place on both hosts before they probe. Without a durable
# normal ticket, a gate spending minutes between probes can lose every freed
# checkout to a newly arrived gate. Urgent gates use their priority marker.
reserve_checkout() {
  local beelink repo_url gate_class host owner repo cache_root suffix="" marker rc priority=urgent epoch="" token=""
  beelink=$(decode "$1") repo_url=$(decode "$2") gate_class=$(decode "$3")
  if [ "$#" = 6 ]; then
    priority=$(decode "$4") epoch=$(decode "$5") token=$(decode "$6")
    [ "$priority" = normal ] && [[ "$epoch" =~ ^[0-9]+$ && "$token" =~ ^[0-9a-f]{32}$ ]] || die "invalid normal checkout reservation"
  fi
  parse_repo_url "$repo_url"
  cache_root="${BEELINK_GATE_CACHE_ROOT:-${XDG_CACHE_HOME:-$HOME/.cache}/beelink-gate}"
  [ "$gate_class" = dev ] && suffix=@dev
  [ "$gate_class" = light ] && suffix=@light
  if [ "$priority" = normal ]; then
    marker="$cache_root/.locks/queue-$host-$owner-$repo$suffix.$epoch.$$"
  else
    marker="$cache_root/.locks/urgent-$host-$owner-$repo$suffix.$$"
  fi
  mkdir -p "$cache_root/.locks" || die "cannot create checkout reservation"
  ticket_body "$token" > "$marker" || die "cannot create checkout reservation"
  trap 'rm -f "$marker"; exit 143' HUP INT TERM
  echo "beelink-gate-$priority-reserved $beelink"
  # The launcher keeps stdin open. EOF removes the reservation even if its
  # session dies; a timeout merely means that no heartbeat bytes arrived.
  while :; do
    IFS= read -r -t "$gate_heartbeat_interval_seconds" _; rc=$?
    (( rc == 0 || rc > 128 )) || break
  done
  rm -f "$marker"
  trap - HUP INT TERM
}
stop_checkout_reservations() {
  local pid file active drain_end=$((SECONDS + gate_heartbeat_interval_seconds + TRANSPORT_KILL_GRACE_SECONDS))
  local -a owned=("${checkout_reservation_pids[@]}")
  [ -z "$checkout_monitor_pid" ] || owned+=("$checkout_monitor_pid")
  for file in "${checkout_reservation_files[@]}"; do : > "$file.stop"; done
  while (( SECONDS < drain_end )); do
    active=0
    for pid in "${owned[@]}"; do kill -0 -- "-$pid" 2>/dev/null && active=1; done
    (( active )) || break
    sleep 0.1
  done
  for pid in "${owned[@]}"; do
    if kill -0 -- "-$pid" 2>/dev/null; then
      frontend_tainted=1
      echo "beelink-gate: UNKNOWN reservation EOF cleanup; draining exact owned local group=$pid, remote ticket removal unconfirmed" >&2
    fi
    stop_frontend_group "$pid" || frontend_tainted=1
  done
  # An unconfirmed local drain keeps its private stop/peer metadata for recovery.
  if [ "${frontend_tainted:-0}" != 1 ]; then
    [ -z "$checkout_reservation_dir" ] || rm -rf "$checkout_reservation_dir"
  elif [ -n "$checkout_reservation_dir" ]; then
    echo "beelink-gate: reservation cleanup evidence retained at $checkout_reservation_dir" >&2
  fi
}

watch_checkout_admission() {
  local log=$1 expected_gate_id=$2 file
  [ -n "$expected_gate_id" ] || return 0
  while :; do
    if grep -Fqx -- "beelink-gate: placement handoff gate_id=$expected_gate_id" "$log" 2>/dev/null; then
      for file in "${checkout_reservation_files[@]}"; do : > "$file.stop"; done
      return 0
    fi
    sleep 0.2
  done
}
start_checkout_reservations() {
  local priority=${1:-urgent} host file pid tries
  local -a args=()
  if [ -n "${frontend_path:-}" ]; then
    checkout_reservation_dir=$(mktemp -d "${frontend_path%/*}/reservations.XXXXXXXX") || die "cannot allocate checkout reservation state"
  else
    checkout_reservation_dir=$(mktemp -d) || die "cannot allocate checkout reservation state"
  fi
  for host in beelink1 beelink2; do
    file="$checkout_reservation_dir/$host"
    args=("$(encode "$host")" "$(encode "$repo_url")" "$(encode "$([ "$gate_class" = dev ] && echo dev || echo "$install_mode")")")
    if [ "$priority" = normal ]; then
      args+=("$(encode normal)" "$(encode "$reservation_epoch")" "$(encode "$reservation_token")")
    fi
    BEELINK_GATE_HEARTBEAT_STOP="$file.stop" heartbeat=1 start_frontend_group on_beelink "$host" --urgent-reserve "${args[@]}" >"$file" 2>"$file.err"
    checkout_reservation_pids+=("$frontend_spawned_pid")
    printf '%s %s\n' "$frontend_spawned_pid" "${frontend_group_identities[$frontend_spawned_pid]:-unknown}" > "$file.local-group"
    checkout_reservation_files+=("$file")
    checkout_reservation_hosts+=("$host")
  done
  # One host that cannot reserve (unreachable, or its reservation died) must not
  # stop auto: a named gate still runs on the other one, so auto keeps the hosts
  # that reserved and places only on them. A single sick
  # Beelink made every auto gate exit 75 while named gates ran.
  local i reserved=()
  for i in "${!checkout_reservation_files[@]}"; do
    file=${checkout_reservation_files[$i]} host=${checkout_reservation_hosts[$i]}
    for ((tries = 0; tries < STAGE_TIMEOUT_SECONDS * 10; tries++)); do
      frontend_retry_check
      grep -q "^beelink-gate-$priority-reserved " "$file" 2>/dev/null && break
      kill -0 "${checkout_reservation_pids[$i]}" 2>/dev/null || break
      sleep 0.1
    done
    if grep -q "^beelink-gate-$priority-reserved " "$file" 2>/dev/null; then
      reserved+=("$host")
    else
      cat "$file.err" >&2
      : > "$file.stop"
      stop_frontend_group "${checkout_reservation_pids[$i]}" || frontend_tainted=1
      checkout_reservation_lost[$host]=1
      echo "beelink-gate: $host did not reserve a checkout place; auto places only on the other beelink" >&2
    fi
  done
  (( ${#reserved[@]} > 0 )) || tempfail "$(utc_in_minutes 5)" "cannot reserve checkout priority on either beelink"
  local where="on both beelinks"
  (( ${#reserved[@]} == 2 )) || where="on ${reserved[*]} only"
  if [ "$priority" = urgent ]; then
    echo "beelink-gate: urgent priority reserved $where" >&2
  else
    echo "beelink-gate: normal FIFO place reserved $where" >&2
  fi
}

# Marks a host whose reservation ended as lost; exits 75 only when none is left.
check_checkout_reservations() {
  [ -n "${checkout_reservation_dir:-}" ] || return 0
  local i host live=0
  for i in "${!checkout_reservation_pids[@]}"; do
    host=${checkout_reservation_hosts[$i]}
    [ -z "${checkout_reservation_lost[$host]:-}" ] || continue
    if kill -0 "${checkout_reservation_pids[$i]}" 2>/dev/null; then
      live=1
    else
      checkout_reservation_lost[$host]=1
      echo "beelink-gate: $host checkout reservation ended; auto places only on the other beelink" >&2
    fi
  done
  (( live )) || tempfail "$(utc_in_minutes 5)" "checkout reservation disconnected before admission"
}
