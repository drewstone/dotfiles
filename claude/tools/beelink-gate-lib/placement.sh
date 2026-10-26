#!/usr/bin/env bash
# Where a gate runs: a named beelink, the better of the two for auto, or a Tangle
# sandbox (sandbox.mjs) when auto would otherwise wait past
# BEELINK_GATE_SANDBOX_AFTER (default 5m) or both beelinks refuse.
# Sourced by beelink-gate and embedded into every submitted script.

field() { sed -n "s/.* $1=\([^ ]*\).*/\1/p" <<<"$2"; }
# A probe line's state and its reason text, or the bare word (unreachable) it holds.
refusal_reason() {
  case "$1" in ''|unreachable) echo "${1:-unknown}" ;;
    *) local why; why=$(sed -n 's/.* reason=//p' <<<"$1"); echo "$(field state "$1")${why:+ ($why)}" ;;
  esac
}
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
# Prints "sandbox" instead when a sandbox can take the gate and both beelinks
# refuse, or the gate has waited past BEELINK_GATE_SANDBOX_AFTER with no beelink
# that can admit it now. <placements so far>: after a beelink gave the gate
# back, a free-looking probe no longer keeps it off the sandbox.
choose_beelink() {
  local replaced=${1:-0} target line state cache load slots best="" best_rank=9 best_load rank waited=0 reported=-60 light_busy next
  local -A seen=()
  local auto_started=$SECONDS
  while :; do
    check_checkout_reservations
    best="" best_rank=9 best_load="" light_busy=""
    for target in beelink1 beelink2; do
      [ -z "${checkout_reservation_lost[$target]:-}" ] || { seen[$target]="unreachable"; continue; }
      line=$(probe_of "$target") || line=""
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
    # On 2026-10-26 a factory gate waited 2,691 s for a beelink and ran 318 s.
    if { [ -z "$best" ] || (( best_rank >= 2 || replaced > 0 )); } && sandbox_due; then
      echo "beelink-gate: auto chose a Tangle sandbox after waiting $((SECONDS - launched))s (beelink1: ${seen[beelink1]:-?}; beelink2: ${seen[beelink2]:-?})" >&2
      echo sandbox; return 0
    fi
    if [ -n "$best" ]; then
      check_checkout_reservations
      [ -z "${checkout_reservation_lost[$best]:-}" ] || continue
      echo "beelink-gate: auto chose $best after ${waited}s (beelink1: ${seen[beelink1]:-?}; beelink2: ${seen[beelink2]:-?})" >&2
      echo "$best"; return 0
    fi
    if [ "${seen[beelink1]:-}" = unreachable ] && [ "${seen[beelink2]:-}" = unreachable ]; then
      sandbox_ready && { echo "beelink-gate: no beelink is reachable from $(hostname); auto chose a Tangle sandbox" >&2; echo sandbox; return 0; }
      tempfail "$(utc_in_minutes 5)" "no beelink is reachable from $(hostname)"
    fi
    if [[ "${seen[beelink1]:-}" != *state=busy* && "${seen[beelink2]:-}" != *state=busy* ]]; then
      echo "beelink-gate: no beelink can start this gate (beelink1: ${seen[beelink1]:-?}; beelink2: ${seen[beelink2]:-?})" >&2
      # The probe line leads with load and the admission mode (host-psi); a disk-floor
      # refusal read as CPU pressure on 10-25. Name each host's actual reason first.
      echo "beelink-gate: refused because beelink1: $(refusal_reason "${seen[beelink1]:-}"); beelink2: $(refusal_reason "${seen[beelink2]:-}")" >&2
      sandbox_ready && { echo "beelink-gate: auto chose a Tangle sandbox" >&2; echo sandbox; return 0; }
      # The earliest time either refusing host names.
      next=$(printf '%s\n' "$(field next "${seen[beelink1]:-}")" "$(field next "${seen[beelink2]:-}")" | grep -E '^[0-9]{4}-' | sort | head -1)
      tempfail "${next:-$(utc_in_minutes 5)}" "no beelink can start this gate"
    fi
    if (( waited - reported >= 60 )); then
      echo "beelink-gate: no beelink is both free for this repo and under its load limit after ${waited}s; waiting (beelink1: ${seen[beelink1]:-?}; beelink2: ${seen[beelink2]:-?})" >&2
      reported=$waited
    fi
    sleep "${BEELINK_GATE_AUTO_POLL_SECONDS:-$([ "${BEELINK_GATE_URGENT:-0}" = 1 ] && echo 2 || echo 20)}"; waited=$((SECONDS - auto_started))
  done
}

# A sandbox can take this auto gate: not disabled (BEELINK_GATE_SANDBOX=0), not
# a --ship (its proof is signed with a beelink key), a GitHub repo, Node and the
# factory owner key on this launcher, and no box already refused this request.
sandbox_ready() {
  [ "${BEELINK_GATE_SANDBOX:-1}" != 0 ] && [ -z "${sandbox_off:-}" ] && [ "$install_mode" != ship ] \
    && command -v node >/dev/null && github_repo "$repo_url" >/dev/null \
    && { [ -n "${FACTORY_SANDBOX_KEY:-}" ] || [ -s "$HOME/.config/tangle/factory.key" ]; }
}
# sandbox_after: BEELINK_GATE_SANDBOX_AFTER in seconds, validated at launch (0 = at once).
sandbox_due() { (( SECONDS - launched >= ${sandbox_after:-300} )) && sandbox_ready; }

# Runs the gate in a one-shot Tangle sandbox and returns its exit. The beelink
# queue places are given back only once a box holds the commit; sandbox_started=0
# means none did, so an auto gate may keep waiting for a beelink. A HUP, INT or
# TERM ends the launcher once the box is gone, never the placement loop.
run_sandbox_gate() {  # <seconds already waited> <command> [args...]
  local waited=$1 started pid rc display saved sandbox_signal=""
  shift
  [ "$install_mode" != ship ] || die "--sandbox cannot run --ship: its proof is signed with a beelink key"
  github_repo "$repo_url" >/dev/null || die "--sandbox needs a GitHub repo URL, not $repo_url"
  command -v node >/dev/null || tempfail "$(utc_in_minutes 5)" "--sandbox needs node on $(hostname)"
  frontend_phase attach
  started=$(mktemp) || die "cannot create a temporary file"
  printf -v display '%q ' "$@"
  saved=$(trap -p HUP INT TERM)
  BEELINK_GATE_SANDBOX_STARTED="$started" BEELINK_GATE_SANDBOX_DISPLAY="${display% }" \
    BEELINK_GATE_SANDBOX_PNPM_FN="$(declare -f repo_manager_version repo_pnpm_version)" node "$gate_source_root/beelink-gate-lib/sandbox.mjs" \
    "$repo_url" "$sha" "$install_mode" "$([ "$gate_class" = dev ] && echo dev || { [ "$install_mode" = light ] && echo light || echo normal; })" \
    "$waited" "$STATE_DIR" "$@" & pid=$!
  # The box script deletes its box on any of these before it exits.
  trap 'sandbox_signal=129; kill -HUP "$pid" 2>/dev/null' HUP
  trap 'sandbox_signal=130; kill -INT "$pid" 2>/dev/null' INT
  trap 'sandbox_signal=143; kill -TERM "$pid" 2>/dev/null' TERM
  while kill -0 "$pid" 2>/dev/null && [ ! -s "$started" ]; do sleep 1; done
  if [ -s "$started" ] && [ -n "$checkout_reservation_dir" ]; then stop_checkout_reservations; checkout_reservation_dir=""; fi
  wait "$pid"; rc=$?
  while kill -0 "$pid" 2>/dev/null; do wait "$pid"; rc=$?; done
  trap - HUP INT TERM; eval "$saved"
  sandbox_started=0; [ ! -s "$started" ] || sandbox_started=1
  rm -f "$started"
  if [ -n "$sandbox_signal" ]; then
    kill -s "$(kill -l $((sandbox_signal - 128)))" "$$"; exit "$sandbox_signal"
  fi
  [ "$sandbox_started" = 1 ] || sandbox_off=1
  return "$rc"
}
