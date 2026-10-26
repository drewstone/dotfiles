#!/usr/bin/env bash
# shellcheck disable=SC2034,SC2154 # Main/resource owners supply and consume admission globals.
# Host admission policy, bundled into immutable gates. Running commands never
# recheck this owner: a release hold stops new work and lets admitted work finish.
release_priority_reason() {
  local observation status=0 parsed=0 reason
  observation=$(python3 -c "$beelink_gate_release_source" "$1" "$(limits_file)" "$STATE_DIR" "$(command -v gh-drew || true)") || status=$?
  reason=$(python3 - "$status" "$observation" <<'PYTHON'
import json
import re
import sys

try:
    row = json.loads(sys.argv[2])
    state, reason = row["state"], row["reason"]
    if not isinstance(reason, str) or not re.fullmatch(r"[a-z_]{1,80}", reason):
        raise ValueError()
    if sys.argv[1] == "3" and state == "held":
        print("release priority held: " + reason)
        raise SystemExit(3)
    if sys.argv[1] != "0" or state not in ("open", "unknown"):
        raise ValueError()
    # The owner already logs and persists a valid unknown observation.
except (ValueError, TypeError, KeyError, IndexError, RecursionError):
    print("release_evidence_invalid_or_crashed")
PYTHON
  ) || parsed=$?
  if [ "$parsed" = 3 ]; then
    printf '%s\n' "$reason"
    return 3
  fi
  if [ "$parsed" != 0 ] || [ -n "$reason" ]; then
    echo 'beelink-gate: release priority unknown: release_evidence_invalid_or_crashed; using host PSI admission' >&2
  fi
  return 0
}

# A waiting gate passes here on every slot poll (2 s), and each check starts two Python processes;
# with dozens of gates waiting that load starved the host they waited on (beelink1 10-26: 82 gate
# processes, ~800% CPU). Recheck one host at most every BEELINK_GATE_RELEASE_RECHECK_SECONDS (30).
admit_release_priority() {
  local reason
  if [ "${release_priority_host:-}" = "$1" ] && (( SECONDS - ${release_priority_at:--100000} < ${BEELINK_GATE_RELEASE_RECHECK_SECONDS:-30} )); then
    return 0
  fi
  reason=$(release_priority_reason "$1") || { admission_outcome=refused admission_reason=release_priority; tempfail "$(utc_in_minutes 5)" "$1 $reason"; }
  release_priority_host=$1 release_priority_at=$SECONDS
}

# Windows owns the update policy; WSL owns the local clock and time-zone rules.
# Check again after waiting for the repo lock, before any checkout is touched.
# A gate admitted before the window keeps running, including its install.
check_update_window() {
  python3 - "$@" <<'PY'
from datetime import datetime, time, timedelta, timezone
import os
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

host, raw_day, raw_hour = sys.argv[1:4]
try:
    day, hour = int(raw_day), int(raw_hour)
    if not 0 <= day <= 7 or not 0 <= hour <= 23:
        raise ValueError("day or hour out of range")
    if len(sys.argv) > 4:
        zone = ZoneInfo(sys.argv[4])
    elif os.environ.get("TZ"):
        zone = ZoneInfo(os.environ["TZ"])
    else:
        with Path("/etc/localtime").open("rb") as zonefile:
            zone = ZoneInfo.from_file(zonefile)
    now = (datetime.fromisoformat(sys.argv[5].replace("Z", "+00:00"))
           if len(sys.argv) > 5 else datetime.now(timezone.utc))
    if now.tzinfo is None:
        raise ValueError("probe time requires a UTC offset")
    now = now.astimezone(timezone.utc)
except (OSError, ValueError, IndexError) as exc:
    print(f"beelink-gate: cannot evaluate Windows Update window: {exc}", file=sys.stderr)
    sys.exit(2)

local_day = now.astimezone(zone).date()
for offset in range(-7, 8):
    candidate = local_day + timedelta(days=offset)
    # Registry day 0 is daily; 1=Sunday through 7=Saturday.
    if day and candidate.isoweekday() % 7 + 1 != day:
        continue
    scheduled_local = datetime.combine(candidate, time(hour), zone)
    scheduled = scheduled_local.astimezone(timezone.utc)
    start = scheduled - timedelta(minutes=60)
    end = scheduled + timedelta(minutes=30)
    if start <= now < end:
        next_local = end.astimezone(zone)
        print(
            f"beelink-gate: REFUSED {host} Windows Update is scheduled "
            f"{scheduled.astimezone(zone):%A %Y-%m-%d %H:%M %Z}; "
            f"new gates are blocked from {start.astimezone(zone):%Y-%m-%d %H:%M %Z} "
            f"until {next_local:%Y-%m-%d %H:%M %Z}; "
            f"next allowed {next_local:%Y-%m-%d %H:%M %Z} "
            f"({end:%Y-%m-%d %H:%M} UTC)",
            file=sys.stderr,
        )
        print(f"{end:%Y-%m-%dT%H:%M:%SZ}")
        sys.exit(3)
PY
}

# Starts only outside the update window; inside it, a TEMPFAIL until it ends.
admit_window() {
  local next rc
  next=$(check_update_window "$@"); rc=$?
  case "$rc" in
    0) ;;
    3) admission_outcome=refused admission_reason=windows_update; tempfail "$next" "$1 is in its Windows Update window" ;;
    *) exit "$rc" ;;
  esac
}


wait_for_capacity_writer() {
  admit_release_priority "$beelink"
  admission_stage capacity_writer
  local now_ms elapsed_ms
  now_ms=$(date +%s%3N)
  (( intent_started_ms )) || intent_started_ms=$now_ms
  elapsed_ms=$((now_ms - intent_started_ms))
  if (( elapsed_ms >= intent_wait_limit * 1000 )); then
    if (( placed_auto )); then
      not_admitted "capacity writer intent exceeded ${intent_wait_limit}s"
    fi
    admission_outcome=refused admission_reason=capacity_writer
    tempfail "$(utc_in_minutes 5)" "capacity writer intent exceeded ${intent_wait_limit}s on $beelink"
  fi
  if (( SECONDS - last_report >= 60 )); then
    echo "beelink-gate: waiting $((elapsed_ms / 1000))s for capacity writer on $beelink" >&2
    last_report=$SECONDS
  fi
  admission_expired && not_admitted "capacity writer in progress"
  sleep 1 & wait $!
}


acquire_slot() {
  local slots_dir="$1" max="$2" pool="${3:-slot}" i announced="" marker blocked
  marker="$slots_dir/urgent-$pool"
  if [ "${urgent:-0}" = 1 ]; then ticket_body > "$marker.$$"; urgent_markers+=("$marker.$$"); fi
  while :; do
    admission_stage checks
    admit_release_priority "$beelink"
    blocked=fifo
    [ "${urgent:-0}" != 1 ] || touch "$marker.$$"
    if [ "${urgent:-0}" = 1 ] || ! urgent_ahead "$marker"; then
      blocked=host_slot
      for ((i = 0; i < max; i++)); do
        exec {slot_fd}>"$slots_dir/$pool-$i.lock" || die "cannot open host slot"
        if flock -n -x "$slot_fd"; then rm -f "$marker.$$"; return 0; fi
        exec {slot_fd}>&-
      done
    fi
    if [ -z "$announced" ]; then
      echo "beelink-gate: waiting for a host gate slot ($max running$([ "$pool" = slot ] || echo " $pool"))" >&2
      announced=1
    fi
    # The backstop covers slots too: with pressure admission, a full slot pool is
    # now the usual wait (4/4 on both beelinks at 22:15Z with gate pressure 5-16%).
    if starving; then
      exec {slot_fd}>"$slots_dir/$pool-overflow.lock" || die "cannot open host slot"
      starved=1
      echo "beelink-gate: $( [ "${urgent:-0}" = 1 ] && echo URGENT || echo STARVED ): running past the $max-slot cap on $beelink after $(( ${placed_wait:-0} + SECONDS - ${load_wait_started:-$SECONDS} ))s; SHIP_MAX_WORKERS is halved" >&2
      rm -f "$marker.$$"
      return 0
    fi
    admission_expired && not_admitted "no free host slot"
    admission_stage "$blocked"
    if [ "${urgent:-0}" = 1 ]; then sleep 0.5; else sleep "${BEELINK_GATE_SLOT_POLL_SECONDS:-2}"; fi
  done
}


NOT_ADMITTED=76
cancel_if_requested() {
  [ -z "${gate_id:-}" ] || [ ! -f "$STATE_DIR/jobs/.canceled/$gate_id" ] || {
    admission_outcome=canceled admission_reason=cancel_marker
    echo "beelink-gate: canceled gate_id=$gate_id before command" >&2
    exit 75
  }
}
admission_expired() {
  cancel_if_requested
  [ -n "${admit_by:-}" ] && (( SECONDS >= admit_by ))
}
not_admitted() {
  admission_outcome=replaced admission_reason=placement_budget
  [ -z "${lock:-}" ] || rm -f "$lock.holder"
  rm -f "${urgent_markers[@]}" 2>/dev/null
  echo "beelink-gate: not admitted on $beelink within ${admit_wait}s ($1); placing the gate again" >&2
  exit "$NOT_ADMITTED"
}
# A host auto chose can fall below its disk floor between the probe and the
# gate's own check: docker images filled beelink2 by 14 GiB in
# 40 min, and a gate placed there exited TEMPFAIL while beelink1 had room. An
# auto placement gives such a host back, and the launcher's next probe sees it
# refused and picks the other host, or exits TEMPFAIL when both refuse.
give_back_host() {
  admission_outcome=replaced admission_reason=disk_floor
  rm -f "${urgent_markers[@]}" 2>/dev/null
  echo "beelink-gate: $beelink gave the gate back before admission ($1); placing the gate again" >&2
  exit "$NOT_ADMITTED"
}

# A placement probe is a hint. Preserve auto handoff if capacity changes before
# this gate starts; a named host retains its ordinary temporary refusal.
initial_disk_admission() {
  if ! check_floor "$beelink"; then
    (( placed_auto == 0 )) || give_back_host "$beelink is below its operational disk floor or its policy is unknown"
    admission_outcome=refused admission_reason=disk_floor
    tempfail "$(utc_in_minutes 15)" "$beelink is below its operational disk floor or its policy is unknown"
  fi
}

acquire_checkout_admission() {
  local waiting_since=$SECONDS last_report=-60 claim_started_ms
  admission_checkpoint
  capacity_claim_wait_ms=0
  checkout=""
  local urgent_marker="$cache_root/.locks/urgent-$host-$owner-$repo"
  (( light == 0 )) || urgent_marker+=@light
  (( dev == 0 )) || urgent_marker+=@dev
  if (( urgent )); then ticket_body > "$urgent_marker.$$"; urgent_markers+=("$urgent_marker.$$"); fi
  local ticket_prefix="$cache_root/.locks/queue-$host-$owner-$repo" enqueued=$(( $(date +%s) - placed_wait ))
  (( light == 0 )) || ticket_prefix+=@light
  (( dev == 0 )) || ticket_prefix+=@dev
  # An auto gate's place in line is its reservation's, made on both hosts before its
  # first probe and found here by its token. Dating its own ticket by now - placed_wait
  # left out the reservation's setup, so a newer gate could fall between the two
  # tickets: it waited for the reservation while this gate waited for it.
  if [ -n "$reservation_token" ]; then
    local reserved reserved_since
    for reserved in "$ticket_prefix".*.*; do
      [ -f "$reserved" ] && [ "$(cat "$reserved" 2>/dev/null)" = "$reservation_token" ] || continue
      reserved_since=${reserved#"$ticket_prefix".}; reserved_since=${reserved_since%%.*}
      [[ "$reserved_since" =~ ^[0-9]+$ ]] && (( reserved_since < enqueued )) && enqueued=$reserved_since
    done
  fi
  local ticket="$ticket_prefix.$enqueued.$$"
  ticket_body "$reservation_token" > "$ticket"; urgent_markers+=("$ticket")
  # Every exit while waiting (a pressure timeout, a cancel) takes the ticket
  # and markers with it; finish replaces this trap once the checkout is held.
  # Wait for load before taking a checkout: a gate that only waits for load must
  # not hold the repo's checkout. One ADC gate held it for 1766s of
  # load wait plus 1119s of run, and the next ADC gate queued behind all of it.
  wait_for_load "$beelink" || tempfail "$(utc_in_minutes 5)" "$beelink $(metric_name) stayed over its limit"
  while [ -z "$lock" ]; do
    admission_stage checks
    admit_release_priority "$beelink"
    # Cleanup and the cache pruner hold this lock exclusively before inspecting
    # repo locks. A shared claim prevents either from racing a new checkout,
    # while other gates can claim their own repos at the same time. Release it
    # as soon as the repo flock is held; the command keeps only its repo lock.
    claim_started_ms=$(date +%s%3N)
    while :; do
      admission_stage checks
      admit_release_priority "$beelink"
      if capacity_writer_active; then
        wait_for_capacity_writer
        continue
      fi
      intent_started_ms=0
      admission_stage capacity_lock
      if ! flock -w 1 -s "$capacity_fd"; then
        admission_stage checks
        if (( SECONDS - last_report >= 60 )); then
          echo "beelink-gate: waiting $((SECONDS - waiting_since))s for capacity cleanup on $beelink" >&2
          last_report=$SECONDS
        fi
        admission_expired && not_admitted "capacity cleanup in progress"
        continue
      fi
      admission_stage checks
      # An intent can register while the shared claim waits for .capacity.lock.
      # Check again before taking any repo lock; give the claim back to the writer.
      if capacity_writer_active; then
        flock -u "$capacity_fd"
        wait_for_capacity_writer
        continue
      fi
      break
    done
    capacity_claim_wait_ms=$((capacity_claim_wait_ms + $(date +%s%3N) - claim_started_ms))
    # Each older waiter reserves one free checkout; with two free and one older
    # waiter, this gate still takes the second.
    local ahead=0 skipped=0 checkout_wait_stage=checkout_lock
    touch "$ticket"; (( ! urgent )) || touch "$urgent_marker.$$"
    (( urgent )) || ahead=$(older_tickets_ahead "$ticket_prefix" "$enqueued")
    for ((k = 0; k < copies; k++)); do
      if (( ! urgent )) && urgent_ahead "$urgent_marker"; then checkout_wait_stage=fifo; break; fi
      suffix=$([ "$k" = 0 ] || echo "@$k"); (( light == 0 )) || suffix=@light; (( dev == 0 )) || suffix=@dev
      candidate="$cache_root/.locks/$host-$owner-$repo$suffix.lock"
      [ ! -L "$candidate" ] && [ ! -L "$candidate.holder" ] || die "lock metadata is a symlink"
      exec {fd}>"$candidate" || die "cannot open lock"
      if flock -n -x "$fd"; then
        # An urgent reservation can appear between the check above and flock.
        # Give the newly free checkout back before a normal gate claims it.
        if (( ! urgent )) && urgent_ahead "$urgent_marker"; then
          checkout_wait_stage=fifo
          flock -u "$fd"; exec {fd}>&-; break
        fi
        if (( skipped < ahead )); then
          checkout_wait_stage=fifo
          flock -u "$fd"; exec {fd}>&-; skipped=$((skipped + 1)); continue
        fi
        lock_fd=$fd lock=$candidate checkout="$cache_root/$host/$owner/$repo$suffix"
        break
      fi
      exec {fd}>&-
      reclaim_dead_holder "$candidate"
    done
    flock -u "$capacity_fd"
    [ -z "$lock" ] || break
    if (( SECONDS - last_report >= 60 )); then
      echo "beelink-gate: waiting $((SECONDS - waiting_since))s for one of $copies $host/$owner/$repo checkouts on $beelink; $(holder_line "$cache_root/.locks/$host-$owner-$repo.lock")" >&2
      last_report=$SECONDS
    fi
    admission_expired && not_admitted "both $host/$owner/$repo checkouts busy"
    admission_stage "$checkout_wait_stage"
    if (( urgent )); then sleep 1 & wait $!; else sleep 5 & wait $!; fi
  done
  exec {capacity_fd}>&-
  exec {writer_fd}>&-
  rm -f "$urgent_marker.$$" "$ticket"
  if [ -L "$checkout" ] || [ -L "$checkout/.git" ]; then die "cache path contains a symlink"; fi
  [ "$checkout" = "$cache_root/$host/$owner/$repo" ] || echo "beelink-gate: using second checkout ${checkout##*/}" >&2
  printf 'pid=%s\nsid=%s\nstarted=%s\nsha=%s\nlauncher=%s\n' \
    $$ "$(ps -o sid= -p $$ | tr -d ' ')" "$(date +%s)" "$sha" "$launcher" > "$lock.holder" || die "cannot write lock metadata"
  if (( light )); then
    local light_slots=${BEELINK_GATE_LIGHT_SLOTS:-2}
    [[ "$light_slots" =~ ^[1-9][0-9]*$ ]] || die "invalid BEELINK_GATE_LIGHT_SLOTS: $light_slots"
    acquire_slot "$cache_root/.locks" "$light_slots" light-slot
  elif (( dev )); then
    local dev_slots=${BEELINK_GATE_DEV_SLOTS:-2}
    [[ "$dev_slots" =~ ^[1-9][0-9]*$ ]] || die "invalid BEELINK_GATE_DEV_SLOTS: $dev_slots"
    acquire_slot "$cache_root/.locks" "$dev_slots" dev-slot
  else
    acquire_slot "$cache_root/.locks" "$max_concurrent"
  fi
  unset BEELINK_GATE_LIGHT_SLOTS BEELINK_GATE_DEV_SLOTS
  wait_for_load "$beelink" || tempfail "$(utc_in_minutes 5)" "$beelink $(metric_name) stayed over its limit"
  unset BEELINK_GATE_LOAD_WAIT
  waited=$((SECONDS - waiting_since + placed_wait))
  admission_admitted
  echo "beelink-gate: lock, host slot and admission ${BEELINK_GATE_ADMISSION_SAMPLE:-legacy} admitted on $beelink after ${waited}s${gate_id:+ gate_id=$gate_id}$( (( urgent )) && echo ' (urgent)')" >&2
}

retained_admission_observations() {
  # Admission refusals precede the normal receipt. Keep their log-derived count
  # in the existing report, including the source window and retained coverage.
  BEELINK_GATE_METRICS_SOURCE="$beelink_gate_metrics_source" python3 - "$STATE_DIR" "${1:-48}" <<'PY'
import datetime as dt
import json
import os
from pathlib import Path
import re
import stat
import sys
import time

metrics = {"__name__": "beelink_gate_metrics"}
exec(os.environ["BEELINK_GATE_METRICS_SOURCE"], metrics)
root, hours = Path(sys.argv[1]) / "jobs", int(sys.argv[2])
end = time.time()
start = end - hours * 3600
logs = []
refused = []
active = []
entries = []
frontend_entries = []
retained_seen = 0
utc = lambda value: dt.datetime.fromtimestamp(value, dt.timezone.utc).isoformat()
for job in root.iterdir() if root.is_dir() else []:
    if not re.fullmatch(r"beelink[12]-[0-9a-f]{32}", job.name) or job.is_symlink() or not job.is_dir():
        continue
    retained_seen += 1
    log = job / "stderr.log"
    try:
        raw = metrics["read_admission_state"](job / "admission.json")
        began = dt.datetime.fromisoformat(raw["began_at"]).timestamp() if raw else None
        submitted = job / "submitted"
        context = began if began is not None else submitted.stat().st_mtime if submitted.is_file() else job.stat().st_mtime
        if start <= context <= end:
            status = None
            try:
                fd = os.open(job / "exit", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                with os.fdopen(fd, "rb") as stream:
                    info = os.fstat(stream.fileno())
                    text = stream.read(17) if stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_size <= 16 else b""
                if re.fullmatch(rb"[0-9]{1,3}\n?", text) and 0 <= int(text) <= 255:
                    status = int(text)
            except OSError:
                pass
            try:
                marker = (root / ".canceled" / job.name).lstat()
                canceled = stat.S_ISREG(marker.st_mode) and marker.st_uid == os.getuid()
            except OSError:
                canceled = False
            prefix = metrics["read_frontend_state"](job / "frontend.json")
            frontend_entries.append({"gate_id": job.name, "observation": dict(prefix, authority=None) if prefix else None})
            entries.append({"gate_id": job.name, "observation": raw, "retained_job_exit": status,
                            "actual_cancel_marker": canceled,
                            "selection_at": utc(context),
                            "selection_source": "observation_begin_utc" if began is not None else "submitted_or_directory_mtime"})
        if not log.is_file():
            continue
        at = log.stat().st_mtime
        if not start <= at <= end:
            continue
        content = log.read_text(errors="replace")
        logs.append(at)
        if not (log.parent / "exit").exists():
            submitted = log.parent / "submitted"
            age = max(0, end - submitted.stat().st_mtime) if submitted.exists() else None
            admitted = bool(re.search(r"lock, host slot and .* admitted on", content))
            active.append({"gate_id": log.parent.name, "admitted": admitted,
                           "submitted_age_s": round(age, 1) if age is not None else None})
        if re.search(r"TEMPFAIL[^\n]*capacity writer intent exceeded", content):
            refused.append(log.parent.name)
    except (OSError, ValueError, TypeError):
        continue  # Reconnect log retention may run during this read.
print(json.dumps({"kind": "capacity_intent_logs", "window_from": utc(start), "window_to": utc(end),
                  "logs_scanned": len(logs), "oldest_retained": utc(min(logs)) if logs else None,
                  "refusals": len(refused), "gate_ids": sorted(refused), "nonterminal_jobs": active}))
print(json.dumps({"kind": "admission_observations", "window_from": utc(start), "window_to": utc(end),
                  "retained_jobs_seen_n": retained_seen, "entries": entries,
                  "selection": "observation begin UTC; missing observations use submitted or directory mtime, labeled per entry",
                  "limits": "only retained job directories; expired/no-ID/pre-submission population unknown; exit alone never identifies cancellation"}))
print(json.dumps({"kind": "frontend_observations", "origin": "remote_prefix", "entries": frontend_entries,
                  "limits": "one optional pre-submit prefix per retained job; remote-only tails unknown; jobs without a valid prefix retained as unknown"}))
PY
}

# Optional native observation. This is not an admission predicate or timer budget.
# Globals survive Bash unwinding remote_gate before its EXIT trap runs.
admission_begin() {
  admission_path="" admission_done=0 admission_tainted=0 admission_signal=""
  admission_outcome=incomplete admission_reason="" admission_observer_pid="" admission_observer_birth=""
  admission_observer_waiting=0
  admission_current_stage=checks
  admission_context=("${gate_id:-}" "${beelink:-}" "$host/$owner/$repo" "$sha" "$( (( light )) && echo light || { (( dev )) && echo dev || echo normal; } )" "${placed_wait:-0}")
  [[ "${gate_id:-}" =~ ^beelink[12]-[0-9a-f]{32}$ ]] || return 0
  admission_path=${1:-$STATE_DIR/jobs/$gate_id/admission.json}
  # A fixture can only use its own private directory, never the real job file.
  if [ "$#" -gt 0 ] && [ "$admission_path" = "$STATE_DIR/jobs/$gate_id/admission.json" ]; then
    admission_path=""
    return 0
  fi
  admission_record begin
  # A failed begin must never let subsequent events mutate an existing file,
  # including an aliased fixture path that named the real job observation.
  [ "${admission_tainted:-0}" = 0 ] || admission_path=""
}

admission_observer_stop() {
  local actual
  # A signal may unwind wait before admission_record can observe its status,
  # including the short interval before the child's PID has been captured.
  [ "${admission_observer_waiting:-0}" != 1 ] || admission_tainted=1
  admission_observer_waiting=0
  [ -n "${admission_observer_pid:-}" ] || return 0
  actual=$(proc_start "$admission_observer_pid") || actual=""
  if [ -n "$actual" ] && [ "$actual" = "${admission_observer_birth:-}" ]; then
    kill -KILL -- "-$admission_observer_pid" 2>/dev/null || true
  fi
  wait "$admission_observer_pid" 2>/dev/null || true
  admission_observer_pid="" admission_observer_birth=""
}

admission_record() {
  [ -n "${admission_path:-}" ] || return 0
  local action=$1 value=${2:-} status=${3:-0} rc=0
  if [ "${admission_tainted:-0}" = 1 ]; then
    case "$action" in admitted|end|terminal) ;; *) return 0 ;; esac
  fi
  # A canceled in-flight writer cannot retain checkout/slot descriptors or run
  # beyond its own short timeout. Metadata IO never changes the gate's status.
  admission_observer_stop
  admission_observer_waiting=1
  (
    for admission_fd in ${lock_fd:-} ${slot_fd:-} ${capacity_fd:-} ${writer_fd:-} ${gate_turbo_fd:-} ${heartbeat_fd:-}; do
      exec {admission_fd}>&-
    done
    exec setsid timeout --kill-after=1 2 python3 -c "$beelink_gate_metrics_source"$'\n''import sys; admission_observe(sys.argv[1:])' \
      "$admission_path" "$action" "$value" "${admission_tainted:-0}" "$status" \
      "${admission_outcome:-incomplete}" "${admission_reason:-}" "${admission_context[@]}"
  ) </dev/null >/dev/null 2>/dev/null &
  admission_observer_pid=$!
  admission_observer_birth=$(proc_start "$admission_observer_pid") || admission_observer_birth=""
  wait "$admission_observer_pid" || rc=$?
  admission_observer_waiting=0
  admission_observer_stop
  if [ "$rc" != 0 ]; then
    admission_tainted=1
    echo 'beelink-gate: admission observation unavailable; coverage unknown, gate policy/status unchanged' >&2
  fi
  return 0
}

admission_stage() {
  [ "${admission_done:-0}" = 0 ] && [ -n "${admission_path:-}" ] || return 0
  [ "$1" != "${admission_current_stage:-}" ] || return 0
  admission_current_stage=$1
  # Wait loops alternate `checks` and their wait stage on every poll, and each record starts Python.
  # A stage is recorded the first time it appears; a repeat at most every 15 s.
  case " ${admission_seen_stages:-} " in
    *" $1 "*) (( SECONDS - ${admission_stage_at:-0} < 15 )) && return 0 ;;
    *) admission_seen_stages="${admission_seen_stages:-} $1" ;;
  esac
  admission_stage_at=$SECONDS
  admission_record stage "$1"
}
admission_checkpoint() { admission_record checkpoint; }
admission_admitted() {
  [ "${admission_done:-0}" = 0 ] || return 0
  admission_done=1
  admission_record admitted
}
admission_terminal() {
  local status=$1 action=end
  if [ -n "${gate_id:-}" ] && [ -f "$STATE_DIR/jobs/.canceled/$gate_id" ]; then
    admission_outcome=canceled admission_reason=cancel_marker
  elif [ -n "${admission_signal:-}" ]; then
    admission_outcome=canceled admission_reason=observed_signal
  elif [ "${admission_outcome:-incomplete}" = incomplete ] && [ "${admission_done:-0}" = 1 ]; then
    admission_outcome=admitted
  fi
  # Once admitted, terminal metadata cannot extend even a failed end snapshot.
  [ "${admission_done:-0}" != 1 ] || action=terminal
  admission_record "$action" "" "$status"
}
admission_early_exit() {
  local status=$1
  admission_terminal "$status"
  rm -f "${urgent_markers[@]}" 2>/dev/null
  return "$status"
}


capacity_writer_active() {
  # The lock is authoritative across marker creation/removal. Inspecting the
  # path first races a brief writer's unlink and can reject a valid claim.
  if flock -n -x "$writer_fd"; then
    if [ -e "$intent_file" ] || [ -L "$intent_file" ]; then
      [ ! -L "$intent_file" ] && [ -f "$intent_file" ] || die "capacity writer intent is not a regular file"
      rm -f -- "$intent_file" || die "cannot clear stale capacity writer intent"
    fi
    flock -u "$writer_fd"
    return 1
  fi
  return 0
}

proc_start() {  # <pid>: its start time in clock ticks since boot, which no clock step moves
  local line fields
  line=$(cat "/proc/$1/stat" 2>/dev/null) || return 1
  read -ra fields <<< "${line##*) }"
  [[ "${fields[19]:-}" =~ ^[0-9]+$ ]] && printf '%s' "${fields[19]}"
}
ticket_body() {  # [token]: a ticket or marker naming its token and this gate's start tick
  printf '%s\nstart=%s\n' "${1:-}" "$(proc_start $$)"
}
waiter_alive() {  # <ticket or marker file> <pid>
  kill -0 "$2" 2>/dev/null || return 1
  local fields btime written recorded started
  recorded=$(sed -n 's/^start=\([0-9][0-9]*\)$/\1/p' "$1" 2>/dev/null)
  started=$(proc_start "$2") || return 0
  # A ticket that names its owner's start tick is alive only while that same process runs: a reused pid starts
  # at another tick. Realtime is not compared, because btime is realtime minus uptime and beelink1's moved
  # +723 s in its first 17 h; with the old 1 s slack a step dropped a live reservation's ticket
  # and a newer gate went first (beelink-gate tests 136 and 3397).
  [ -z "$recorded" ] || { [ "$recorded" = "$started" ]; return; }
  # Tickets from older gates name no tick. A reused pid needs a pid_max wrap (about 5 h on beelink1 at
  # 238 pids/s), so 60 s of slack still catches reuse and absorbs small steps.
  btime=$(awk '$1 == "btime" { print $2 }' /proc/stat 2>/dev/null)
  written=$(stat -c %Y "$1" 2>/dev/null) || return 1
  [[ "$btime" =~ ^[0-9]+$ ]] || return 0
  (( btime + started / $(getconf CLK_TCK) <= written + 60 ))
}
older_tickets_ahead() {  # <ticket prefix> <my epoch>: how many live, older tickets from other gates
  # A gate's place is the oldest (epoch, pid) among its tickets: an auto gate holds a
  # reservation ticket and its own, under one token. Every gate compares those same
  # pairs, so two gates can never each count the other as ahead.
  local t rest since pid token key me_since=$2 me_pid=$$ n=0
  local -A key_since=() key_pid=() key_ready=()
  local now; now=$(date +%s)
  for t in "$1".*.*; do
    [ -e "$t" ] || continue
    rest=${t#"$1".}; since=${rest%%.*}; pid=${rest#*.}
    [[ "$since" =~ ^[0-9]+$ && "$pid" =~ ^[0-9]+$ ]] || continue
    token=$(head -n 1 "$t" 2>/dev/null) || token=""
    [[ "$token" =~ ^[0-9a-f]{32}$ ]] || token=""
    if [ "$pid" = "$$" ] || { [ -n "$token" ] && [ "$token" = "${reservation_token:-}" ]; }; then
      if (( since < me_since || (since == me_since && pid < me_pid) )); then me_since=$since me_pid=$pid; fi
      continue
    fi
    if ! waiter_alive "$t" "$pid"; then rm -f "$t"; continue; fi
    key=${token:-$pid}
    # Only a gate polling for a checkout now holds one free: its claim loop refreshes the ticket.
    # A ticket left while its gate waits for load, or an auto reservation whose gate waits or runs
    # on the other host, kept beelink2's free discovery-lab checkout empty for 15 min on 10-26.
    (( $(stat -c %Y "$t" 2>/dev/null || echo 0) >= now - 30 )) && key_ready[$key]=1
    if [ -z "${key_since[$key]:-}" ] || (( since < key_since[$key] || (since == key_since[$key] && pid < key_pid[$key]) )); then
      key_since[$key]=$since key_pid[$key]=$pid
    fi
  done
  for key in "${!key_since[@]}"; do
    [ -n "${key_ready[$key]:-}" ] || continue
    if (( key_since[$key] < me_since || (key_since[$key] == me_since && key_pid[$key] < me_pid) )); then n=$((n + 1)); fi
  done
  echo "$n"
}
# An urgent gate leaves a marker while it waits; every other gate waiting for the same thing steps aside.
urgent_ahead() {  # <marker prefix>: a live urgent waiter other than this gate, polling here now
  local m pid now
  now=$(date +%s)
  for m in "$1".*; do
    [ -e "$m" ] || continue
    pid=${m##*.}
    [ "$pid" != "$$" ] || continue
    # An urgent auto gate's reservation marker on a host it is not polling held both free agent-container
    # checkouts on beelink1 for 33 min (10-26 07:55Z); like FIFO tickets, only a refreshed marker counts.
    (( $(stat -c %Y "$m" 2>/dev/null || echo 0) >= now - 30 )) || continue
    if waiter_alive "$m" "$pid"; then return 0; fi
    rm -f "$m"  # left by a gate that died
  done
  return 1
}
