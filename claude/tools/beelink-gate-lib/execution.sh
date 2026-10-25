#!/usr/bin/env bash
# Native gate setup, checked checkout and command lifecycle.
# Sourced by beelink-gate and embedded in every immutable submitted source.

  receipt() {
    local status="$1" ran=$((SECONDS - started))
    local preview_verdict
    preview_verdict=$(printf '%s' "$preview_result" | python3 -c 'import json,sys; t=sys.stdin.read().strip(); print(json.loads(t).get("verdict","?") if t else "none")' 2>/dev/null || echo "?")
    printf 'beelink-gate receipt: sha=%s install=%s command=%s exit=%s duration=%ss waited=%ss host=%s timed_out=%s watchdog=%s load=%s preview=%s class=%s cpu_s=%s node=%s rebuild=%s cpu_pressure=%s starved=%s cgroup=%s cache=%s sparse=%s checkout=%s workers=%s reaped=%s bundle=%s host_cpu=%s%s command_exit=%s post_command_exit=%s\n' \
      "$sha" "$install_mode" "${display% }" "$status" "$ran" "$waited" "$beelink" "$timed_out" "$watchdog" "${start_load:-?}" "$preview_verdict" \
      "$( [ "${light:-0}" = 1 ] && echo light || { [ "${dev:-0}" = 1 ] && echo dev || echo normal; } )" "${cpu_s:-?}" "${gate_node:-?}" "${native_rebuild:-none}" "${start_pressure:-?}" "$starved" "${gate_cgroup_joined:-none}" "${cache_note:-ok}" "${sparse_source:-none}" "${checkout_temperature:-none}" "${gate_workers:-?}" "$reaped" "${bundle_note:-none}" "${start_host_pressure:-?}" "${gate_id:+ gate_id=$gate_id}" "${command_exit:-unknown}" "${post_command_exit:-unknown}" >&2
    mkdir -p "$STATE_DIR" 2>/dev/null && BEELINK_GATE_COMMAND_EXIT="${command_exit:-}" BEELINK_GATE_POST_COMMAND_EXIT="${post_command_exit:-}" BEELINK_GATE_POST_COMMAND_PHASE="${post_command_phase:-}" BEELINK_GATE_METRICS_SOURCE="$beelink_gate_metrics_source" python3 - "$STATE_DIR/receipts.jsonl" "$beelink" "$host/$owner/$repo" "$sha" "$install_mode" \
      "${display% }" "$status" "$waited" "$ran" "$timed_out" "$watchdog" "$launcher" "${start_load:-}" "${preview_result:-}" "${cpu_s:-}" "${gate_node:-}" "${native_rebuild:-}" "${start_pressure:-}" "$starved" "${gate_cgroup_joined:-}" "${cache_note:-}" "$( [ "${light:-0}" = 1 ] && echo light || { [ "${dev:-0}" = 1 ] && echo dev || echo normal; } )" "$reaped" "$bundle_note" "${start_host_pressure:-}" "$gate_id" "$base_sha" "$gate_pr" "$gate_lane" "$observed_install_reserve_bytes" "$timing_file" "$fetch_s" "$pre_command_s" "$command_s" "$cleanup_s" "$capacity_claim_wait_ms" "$sparse_source" "$sparse_spec" "$checkout_temperature" "$reserve_gate_bytes" "$reserve_host_drop" "$reserve_basis" "$reserve_du_ms" <<'PY' || true
import fcntl, json, mmap, os, sys, time
from pathlib import Path
path, beelink, repo, sha, mode, command, status, waited, ran, timed_out, watchdog, launcher, load, preview, cpu, node, rebuild, pressure, starved, cgroup, cache_note, gate_class, reaped, bundle, host_cpu, gate_id, base_sha, pr_number, lane, install_reserve, timing_file, fetch_s, pre_command_s, command_s, cleanup_s, capacity_claim_wait_ms, sparse, sparse_spec, checkout_temperature, reserve_gate_bytes, reserve_host_drop, reserve_basis, reserve_du_ms = sys.argv[1:]
row = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "host": beelink, "repo": repo, "sha": sha,
       "mode": mode, "command": command, "exit": int(status), "waited_s": int(waited), "ran_s": int(ran),
       "command_exit": int(os.environ["BEELINK_GATE_COMMAND_EXIT"]) if os.environ["BEELINK_GATE_COMMAND_EXIT"] else None,
       "post_command_exit": int(os.environ["BEELINK_GATE_POST_COMMAND_EXIT"]) if os.environ["BEELINK_GATE_POST_COMMAND_EXIT"] else None,
       "post_command_phase": os.environ["BEELINK_GATE_POST_COMMAND_PHASE"] or None,
       "timed_out": timed_out == "1", "watchdog": watchdog == "1", "launcher": launcher,
       "start_load": float(load) if load else None,
       "start_cpu_pressure": float(pressure) if pressure else None,
       "starved": starved == "1", "cgroup": cgroup or None, "cache_unpruned": cache_note == "unpruned",
       "class": gate_class, "cpu_s": float(cpu) if cpu else None,
       "node": node or None, "rebuild": rebuild or None, "reaped": int(reaped), "bundle": bundle or None,
       "start_host_cpu_pressure": float(host_cpu) if host_cpu else None, "gate_id": gate_id or None,
       "base_sha": base_sha or None, "pr_number": int(pr_number) if pr_number else None,
       "lane": lane or None, "sparse": sparse or None, "sparse_spec": sparse_spec or None, "checkout_temperature": checkout_temperature or None, "reason_scope": "host_last_10000_receipts"}
try:
    row["admission"] = json.loads(os.environ.get("BEELINK_GATE_ADMISSION_SAMPLE", "null"))
    row["systemd_manager"] = os.environ.get("BEELINK_GATE_SYSTEMD_MANAGER")
    row["systemd_unit"] = os.environ.get("BEELINK_GATE_UNIT")
except ValueError:
    row["admission"] = None
try:
    disk = json.loads(os.environ.get("BEELINK_GATE_DISK_OBSERVATION") or "null")
    row["disk_observation"] = disk if isinstance(disk, dict) else None
except ValueError:
    row["disk_observation"] = None
if int(install_reserve):
    row["install_reserve_bytes"] = int(install_reserve)
    # The gate's own bytes against the host's free-space drop over the same window.
    row["reserve_basis"] = reserve_basis or None
    for key, value in (("reserve_gate_bytes", reserve_gate_bytes), ("reserve_host_free_drop", reserve_host_drop), ("reserve_du_ms", reserve_du_ms)):
        row[key] = int(value) if value.lstrip("-").isdigit() else None
if preview:
    try:
        row["preview"] = json.loads(preview)
    except ValueError:
        row["preview"] = {"unreadable": True}
install_s = os.environ.get("BEELINK_GATE_INSTALL_S")
timing = {"fetch_s": int(fetch_s) if fetch_s else None,
          "install_s": int(install_s) if install_s else None,
          "pre_command_s": int(pre_command_s) if pre_command_s else None,
          "command_s": int(command_s) if command_s else None,
          "cleanup_s": int(cleanup_s) if cleanup_s else None,
          "capacity_claim_wait_ms": int(capacity_claim_wait_ms)}
# pre_command_s includes fetch and precheck prune; cleanup_s includes cleanup
# prune. These nested spans must not be added to ran_s as separate phases.
metrics = {"__name__": "beelink_gate_metrics"}
exec(os.environ["BEELINK_GATE_METRICS_SOURCE"], metrics)
timing.update(metrics["phase_timing"](timing_file))
timing["admission_wait"] = metrics["read_admission_observation"](Path(path).parent / "jobs" / gate_id / "admission.json") if gate_id else None
try:
    timing["turbo_cache"] = json.loads(os.environ.get("BEELINK_GATE_TURBO_OBSERVATIONS") or "null")
except ValueError:
    timing["turbo_cache"] = None
row["timing"] = timing
with open(path, "a+") as out:
    fcntl.flock(out, fcntl.LOCK_EX)
    prior_head = prior_exact = None
    if os.fstat(out.fileno()).st_size:
        # Read backward so receipt writes do not grow linearly with years of
        # history. --report uses the full history across both hosts.
        with mmap.mmap(out.fileno(), 0, access=mmap.ACCESS_READ) as data:
            pos = len(data)
            for _ in range(10000):
                if pos == 0:
                    break
                if data[pos - 1:pos] == b"\n":
                    pos -= 1
                start = data.rfind(b"\n", 0, pos) + 1
                line = data[start:pos]
                pos = start
                try:
                    prior = json.loads(line)
                except ValueError:
                    continue
                if prior.get("repo") != repo or prior.get("sha") != sha:
                    continue
                if prior_head is None:
                    prior_head = prior
                if prior.get("mode") == mode and prior.get("command") == command:
                    prior_exact = prior
                    break
    if prior_exact is None:
        row["reason"] = "different_command" if prior_head else "first"
    elif prior_exact.get("exit") == 0 and base_sha and prior_exact.get("base_sha") and prior_exact["base_sha"] != base_sha:
        row["reason"] = "after_base_move"
    elif prior_exact.get("exit") != 0:
        row["reason"] = "after_red"
    elif not base_sha or not prior_exact.get("base_sha"):
        row["reason"] = "after_green_base_unknown"
    else:
        row["reason"] = "after_green"
    out.write(json.dumps(row) + "\n")
if gate_id:
    receipt = Path(path).parent / "jobs" / gate_id / "receipt.json"
    temporary = receipt.with_suffix(".tmp")
    temporary.write_text(json.dumps(row) + "\n")
    temporary.replace(receipt)
print("beelink-gate timing: " + json.dumps(timing, sort_keys=True), file=sys.stderr)
PY
  }

remote_gate() {
  unset BEELINK_GATE_INSTALL_S BEELINK_GATE_PHASE_FILE BEELINK_GATE_ADMISSION_SAMPLE BEELINK_GATE_COMMAND_STARTED_MS BEELINK_GATE_TURBO_OBSERVATIONS BEELINK_GATE_TURBO_REQUESTED_DIR
  [ "$#" -ge 7 ] || die "invalid remote request"
  # finish and receipt run from the EXIT trap. A shell error (set -u) reaches
  # that trap only after unwinding every function, so the state they read is
  # global, not local: beelink sha install_mode host owner repo cache_root
  # checkout cache_max launcher build_root lock started display run_token.
  local repo_url key origin actual
  local remote_refs left ref branch window_day window_hour max_hold
  local -a command=()
  beelink=$(decode "$1") || die "invalid beelink encoding"
  repo_url=$(decode "$2") || die "invalid repository encoding"
  sha=$(decode "$3") || die "invalid SHA encoding"
  install_mode=$(decode "$4") || die "invalid install mode encoding"
  window_day=$(decode "$5") || die "invalid update day encoding"
  window_hour=$(decode "$6") || die "invalid update hour encoding"
  case "$install_mode" in install|no-install|ship|light) ;; *) die "unknown install mode: $install_mode" ;; esac
  light=0 cpu_s="" light_cpu=""
  if [ "$install_mode" = light ]; then
    light=1 light_cpu=${BEELINK_GATE_LIGHT_CPU:-120}
    [[ "$light_cpu" =~ ^[1-9][0-9]*$ ]] && (( light_cpu <= 120 )) \
      || die "BEELINK_GATE_LIGHT_CPU must be 1-120 core-seconds, not ${light_cpu}; a larger check is a normal gate"
  fi
  unset BEELINK_GATE_LIGHT_CPU
  dev=0
  if [ "${BEELINK_GATE_CLASS:-}" = dev ]; then
    case "$install_mode" in ship|light) die "--dev cannot be combined with --$install_mode" ;; esac
    dev=1
  fi
  unset BEELINK_GATE_CLASS
  urgent=0; [ "${BEELINK_GATE_URGENT:-0}" = 1 ] && urgent=1
  placed_auto=0; [ "${BEELINK_GATE_AUTO:-0}" = 1 ] && placed_auto=1
  unset BEELINK_GATE_AUTO
  urgent_markers=()
  admit_wait=${BEELINK_GATE_ADMIT_WAIT:-} admit_by=""
  if [ -n "$admit_wait" ]; then
    [[ "$admit_wait" =~ ^[1-9][0-9]*$ ]] || die "invalid BEELINK_GATE_ADMIT_WAIT: $admit_wait"
    admit_by=$((SECONDS + admit_wait))
  fi
  # Seconds this gate already waited in earlier placements, so the receipt's waited_s is the whole wait.
  local placed_wait=${BEELINK_GATE_PLACED_WAIT:-0}
  [[ "$placed_wait" =~ ^[0-9]+$ ]] || placed_wait=0
  unset BEELINK_GATE_URGENT BEELINK_GATE_ADMIT_WAIT BEELINK_GATE_PLACED_WAIT
  shift 6
  while [ "$#" -gt 0 ]; do
    command+=("$(decode "$1")") || die "invalid command encoding"
    shift
  done
  if [ "${#command[@]}" -eq 0 ] || [ -z "${command[0]}" ]; then die "empty command"; fi
  [[ "$sha" =~ ^[0-9a-fA-F]{40}$|^[0-9a-fA-F]{64}$ ]] || die "SHA must be a full commit ID"
  max_hold=$(seconds_of "${BEELINK_GATE_MAX_HOLD:-45m}") || die "invalid BEELINK_GATE_MAX_HOLD: ${BEELINK_GATE_MAX_HOLD:-}"
  (( light == 0 || max_hold <= 600 )) || max_hold=600
  launcher=${BEELINK_GATE_LAUNCHER:-unknown}
  [[ "$launcher" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || launcher=unknown
  gate_id=${BEELINK_GATE_ID:-}
  [ -z "$gate_id" ] || [[ "$gate_id" =~ ^beelink[12]-[0-9a-f]{32}$ ]] || die "invalid gate id"
  unset BEELINK_GATE_ID
  cancel_if_requested
  local reservation_token=${BEELINK_GATE_RESERVATION_TOKEN:-}
  [ -z "$reservation_token" ] || [[ "$reservation_token" =~ ^[0-9a-f]{32}$ ]] || die "invalid checkout reservation token"
  unset BEELINK_GATE_RESERVATION_TOKEN
  parse_repo_url "$repo_url"
  local install_reserve_bytes admitted_shape="" reserve_heat=cold
  disk_dir="" disk_pid="" disk_ready=0 disk_deadline=0 disk_grace_s=0 disk_paths=()
  gate_turbo_fd="" gate_turbo_root="" slot_fd="" capacity_claim_wait_ms=0
  unset BEELINK_GATE_DISK_OBSERVATION
  observed_install_reserve_bytes=0 reserve_gate_bytes="" reserve_host_drop="" reserve_basis="" reserve_du_ms=""
  local reserve_bytes_before="" reserve_free_before=""
  # The frozen install always writes the fixed store; a store the environment names is measured too.
  local -a package_stores=("$HOME/.local/share/pnpm/store" "$HOME/.npm")
  [ -z "${npm_config_store_dir:-}" ] || [ "$npm_config_store_dir" = "${package_stores[0]}" ] || package_stores+=("$npm_config_store_dir")
  local reserve_spec=${BEELINK_GATE_SPARSE_SPEC:-} peer_reserve=${BEELINK_GATE_PEER_RESERVE:-} peer_warm_reserve=${BEELINK_GATE_PEER_WARM_RESERVE:-}
  unset BEELINK_GATE_SPARSE_SPEC BEELINK_GATE_PEER_RESERVE BEELINK_GATE_PEER_WARM_RESERVE

  # Direct --remote calls still honor a heartbeat. Detached jobs have none:
  # their own session and MAX_HOLD bound survive a lost launcher.
  watchdog=0 timed_out=0 current="" waited=0 start_load="" start_pressure="" starved=0 gate_cgroup_joined="" cache_note="" sparse_source="" sparse_spec="" checkout_temperature="" reaped=0 bundle_note="" gate_refs_before="" gate_refs_taken=0
  # Every step's processes carry this token in their environment. A process
  # that leaves the step's group (setsid, a daemonizing dev server) keeps it,
  # so the gate can still find and stop it. Global: finish reads it from the EXIT trap.
  run_token="$$.${EPOCHSECONDS:-$(date +%s)}.$RANDOM$RANDOM"
  reap_leftovers() {  # stop every process that still carries run_token
    local signal paths
    for signal in TERM KILL; do
      mapfile -t paths < <(grep -lzx -- "BEELINK_GATE_RUN=$run_token" /proc/[0-9]*/environ 2>/dev/null)
      paths=("${paths[@]#/proc/}"); paths=("${paths[@]%/environ}")
      (( ${#paths[@]} )) || return 0
      [ "$signal" = KILL ] || reaped=$((reaped + ${#paths[@]}))
      kill -"$signal" "${paths[@]}" 2>/dev/null
      [ "$signal" = KILL ] || sleep 2
    done
  }
  stop() {
    trap '' TERM INT HUP
    [ -z "$current" ] || { kill -TERM -- "-$current" 2>/dev/null; sleep 2; kill -KILL -- "-$current" 2>/dev/null; }
    exit 143
  }
  # Nobody reads the output of a gate whose launcher is gone; writing to the
  # closed channel would end this shell before it stops the step's group.
  trap 'admission_signal=watchdog; watchdog=1; exec >/dev/null 2>&1; stop' USR1
  trap 'admission_signal=TERM; stop' TERM
  trap 'admission_signal=INT; stop' INT
  trap 'admission_signal=HUP; stop' HUP
  if [ "${BEELINK_GATE_HEARTBEAT:-0}" = 1 ]; then
    # A background job's stdin defaults to /dev/null, so pass the heartbeat
    # through its own descriptor.
    exec {heartbeat_fd}<&0
    ( exec >/dev/null 2>&1; cat <&"$heartbeat_fd"; kill -USR1 $$ ) &
  fi
  # The launcher's settings are this gate's; a gate the command starts gets its own.
  local ship_workers=${BEELINK_GATE_SHIP_WORKERS:-}
  gate_pr=${BEELINK_GATE_PR:-}
  [[ "$gate_pr" =~ ^[0-9]*$ ]] || gate_pr=""
  unset BEELINK_GATE_PR
  gate_lane=${BEELINK_GATE_LANE:-${FLEET_LANE:-}}
  if [ -z "$gate_lane" ] && [[ "${FLEET_STATUS_FILE:-}" =~ /([^/]+)--([^/]+)\.md$ ]]; then
    gate_lane="${BASH_REMATCH[1]}:${BASH_REMATCH[2]}"
  fi
  [[ "$gate_lane" =~ ^[A-Za-z0-9._:-]{0,128}$ ]] || gate_lane=""
  unset BEELINK_GATE_LANE
  preview_result="" default_branch="" base_sha="" gate_node="" gate_abi="" gate_node_bin="" native_rebuild=""
  # --branch: check the named branch out at the SHA with its upstream set, for
  # merge gates such as ADC's `pnpm signoff` that require HEAD == @{push}.
  local gate_branch=${BEELINK_GATE_BRANCH:-} branch_head=""
  if [ -n "$gate_branch" ]; then
    valid_branch_name "$gate_branch" || die "invalid --branch: $gate_branch"
  fi
  unset BEELINK_GATE_BRANCH
  unset BEELINK_GATE_HEARTBEAT BEELINK_GATE_LAUNCHER BEELINK_GATE_MAX_HOLD BEELINK_GATE_SHIP_WORKERS

  # WSL over SSH runs a non-login shell. Expose the installed user's CLI and
  # build tools without loading profiles or selecting a Rust toolchain.
  # Keep dotfiles/local commands first; Rustup retains toolchain selection.
  export PATH="$HOME/bin:$HOME/.local/bin:$HOME/.cargo/bin:$HOME/.foundry/bin:$PATH"
  # Nobody can answer a prompt in a gate: Git fails at once instead of waiting
  # for a password or a host-key confirmation.
  export GIT_TERMINAL_PROMPT=0
  export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes}"
  cache_root="${BEELINK_GATE_CACHE_ROOT:-${XDG_CACHE_HOME:-$HOME/.cache}/beelink-gate}"
  cache_max="${BEELINK_GATE_CACHE_MAX_BYTES:-42949672960}"
  local max_concurrent="${BEELINK_GATE_MAX_CONCURRENT:-6}"
  build_root="${XDG_CACHE_HOME:-$HOME/.cache}"
  [[ "$cache_root" = /* ]] || die "cache root must be absolute"
  [[ "$cache_max" =~ ^[1-9][0-9]*$ ]] || die "invalid cache size cap"
  [[ "$max_concurrent" =~ ^[1-9][0-9]*$ ]] || die "invalid concurrent gate cap"
  # Validate here: a die inside a later $(load_limit) would only end that subshell.
  admission_begin
  trap 'admission_early_exit "$?"' EXIT
  initial_disk_admission
  max_cpu_pressure >/dev/null
  wait_for_load "$beelink" || tempfail "$(utc_in_minutes 5)" "managed containment, legacy drain or host CPU PSI unavailable"
  if [ -L "$cache_root" ] || [ -L "$cache_root/.locks" ] || [ -L "$cache_root/$host" ] || [ -L "$cache_root/$host/$owner" ]; then
    die "cache path contains a symlink"
  fi
  admit_release_priority "$beelink"
  ! any_copy_warm "$cache_root/$host/$owner/$repo" "$reserve_spec" || reserve_heat=warm
  install_reserve_bytes=$(last_install_reserve_bytes "$beelink" "$host/$owner/$repo" "$install_mode" "$reserve_spec" "$peer_reserve" "$peer_warm_reserve" "$reserve_heat") \
    || die "cannot read install reserve receipts"
  if ! check_floor "$beelink" "$install_reserve_bytes"; then
    (( placed_auto == 0 )) || give_back_host "$beelink is below its disk floor"
    admission_outcome=refused admission_reason=disk_floor
    tempfail "$(utc_in_minutes 15)" "$beelink is below its disk floor"
  fi
  admit_window "$beelink" "$window_day" "$window_hour"
  unset BEELINK_GATE_MAX_CONCURRENT
  # Each repo gets BEELINK_GATE_REPO_CHECKOUTS checkouts per host (default 2):
  # <repo> and <repo>@1, each with its own lock, so two lanes gating one repo do
  # not take both beelinks. 38 gates of one repo from one lane
  # waited 527 min in total behind a single checkout per host.
  local copies=${BEELINK_GATE_REPO_CHECKOUTS:-2} k suffix candidate fd capacity_fd writer_fd
  [[ "$copies" =~ ^[1-9][0-9]*$ ]] || die "invalid BEELINK_GATE_REPO_CHECKOUTS: $copies"
  # A light gate waits behind no normal gate: it has its own <repo>@light checkout.
  (( light == 0 )) || copies=1
  # A dev run never takes a merge gate's checkout: it has its own <repo>@dev.
  (( dev == 0 )) || copies=1
  unset BEELINK_GATE_REPO_CHECKOUTS
  mkdir -p "$cache_root/.locks" "$cache_root/$host/$owner" || die "cannot create cache"
  local intent_wait_limit=${BEELINK_GATE_CAPACITY_INTENT_WAIT_SECONDS:-120} intent_started_ms=0
  [[ "$intent_wait_limit" =~ ^[1-9][0-9]*$ ]] && (( intent_wait_limit <= 120 )) \
    || die "invalid BEELINK_GATE_CAPACITY_INTENT_WAIT_SECONDS: $intent_wait_limit (max 120)"
  unset BEELINK_GATE_CAPACITY_INTENT_WAIT_SECONDS
  local intent_file="$cache_root/.locks/.capacity.writer.intent"
  [ ! -L "$cache_root/.locks/.capacity.lock" ] && [ ! -L "$cache_root/.locks/.capacity.writer.lock" ] \
    || die "capacity lock is a symlink"
  exec {capacity_fd}>>"$cache_root/.locks/.capacity.lock" || die "cannot open capacity lock"
  exec {writer_fd}>>"$cache_root/.locks/.capacity.writer.lock" || die "cannot open capacity writer lock"
  lock=""
  acquire_checkout_admission
  started=$SECONDS display=""
  timing_file="" timing_phase=precheck fetch_s="" pre_command_s="" command_s="" cleanup_s="" command_exit="" post_command_exit="" post_command_phase=""
  local deadline=$((SECONDS + max_hold))
  printf -v display '%q ' "${command[@]}"
  # Each scan gets at most 60 s and never more than the gate's remaining hold; a scan
  # cut short counts as a failed measurement, which records the cold reserve.
  measure_gate_bytes() {
    local left=$((deadline - SECONDS))
    (( left < 60 )) || left=60
    gate_bytes "$left" "$checkout" "${package_stores[@]}"
  }
  # Bundle command-created commits unreachable from remotes before checkout reuse.
  # Exclude refs present before the command, so later gates do not save them again.
  save_unpushed() {
    [ -d "$checkout/.git" ] && [ "$gate_refs_taken" = 1 ] || return 0
    local new stamp heads h restore=""
    local -a before=()
    [ -z "$gate_refs_before" ] || read -ra before <<< "$gate_refs_before"
    new=$(git -C "$checkout" rev-list --count HEAD --branches --not --remotes "$sha" "${before[@]}" 2>/dev/null) || return 0
    (( new > 0 )) || return 0
    stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
    bundle_note="$STATE_DIR/bundles/$owner-$repo-${sha:0:12}-$stamp.bundle"
    if mkdir -p "${bundle_note%/*}" &&
      git -C "$checkout" bundle create "$bundle_note" HEAD --branches --not --remotes "$sha" "${before[@]}" >/dev/null 2>&1; then
      # HEAD may hold nothing new when the commit is on a branch; name each saved head.
      heads=$(git bundle list-heads "$bundle_note" 2>/dev/null | awk '{ print $2 }')
      for h in $heads; do restore+=" $h:refs/gate-bundle/${h#refs/heads/}"; done
      echo "beelink-gate: $new commit(s) not on the remote saved to $bundle_note; restore: git fetch $bundle_note$restore" >&2
    else
      # No bundle: keep the commits as refs inside the checkout, which the next
      # gate's checkout and clean leave alone, rather than lose them.
      bundle_note="refs/beelink-gate-saved/$stamp"
      git -C "$checkout" update-ref "$bundle_note/HEAD" HEAD 2>/dev/null
      for h in $(git -C "$checkout" for-each-ref --format='%(refname:short)' refs/heads); do
        git -C "$checkout" update-ref "$bundle_note/$h" "refs/heads/$h" 2>/dev/null
      done
      echo "beelink-gate: WARNING could not write a bundle; $new unpushed commit(s) kept as $bundle_note/* in $checkout" >&2
    fi
  }
  trap finish_gate_exit EXIT
  execute_gate_checkout
}

# The caller retains setup locals until its existing EXIT trap completes.
execute_gate_checkout() {
  prepare_gate_turbo_cache || tempfail "$(utc_in_minutes 5)" "shared Turbo cache ownership unavailable"
  start_disk_observation
  if mkdir -p "$STATE_DIR" 2>/dev/null; then
    timing_file=$(mktemp "$STATE_DIR/phase.XXXXXXXX" 2>/dev/null) || timing_file=""
  fi
  # The final admission checks run after lock and slot acquisition so their
  # refusals need the same cleanup and receipt path as later failures. They are
  # binding: this gate holds its checkout's lock from here through its install,
  # so the checkout is warm only if it is here now with the gated commit's
  # shape, and it stays warm only while it survives to the install (below).
  admit_release_priority "$beelink"
  admitted_shape=$(checkout_shape "$checkout") || admitted_shape=""
  reserve_heat=cold
  [ -z "$reserve_spec" ] || [ "$admitted_shape" != "$reserve_spec" ] || reserve_heat=warm
  install_reserve_bytes=$(last_install_reserve_bytes "$beelink" "$host/$owner/$repo" "$install_mode" "$reserve_spec" "$peer_reserve" "$peer_warm_reserve" "$reserve_heat") \
    || die "cannot read install reserve receipts"
  if ! check_floor "$beelink" "$install_reserve_bytes"; then
    # The host can cross its floor while the gate queued for pressure, a checkout
    # or a slot; an auto placement still gives it back (finish releases the lock).
    if (( placed_auto )); then
      echo "beelink-gate: $beelink gave the gate back before checkout ($beelink is below its disk floor); placing the gate again" >&2
      exit "$NOT_ADMITTED"
    fi
    tempfail "$(utc_in_minutes 15)" "$beelink is below its disk floor"
  fi
  admit_window "$beelink" "$window_day" "$window_hour"
  admit_release_priority "$beelink"
  # Prune before fetch costs minutes on a busy disk (270 s on beelink1 10-25), and a
  # placement that then meets PSI at the fetch wait yields 76 with that work wasted.
  wait_for_load "$beelink" || tempfail "$(utc_in_minutes 5)" "host CPU PSI held before cache prune"
  if ! prune_cache "$cache_root" "$checkout" "$cache_max"; then
    cache_note=unpruned
    echo "beelink-gate: WARNING cache over its cap with only active checkouts left; running anyway (the disk floor guards disk space)" >&2
  fi

  if [ -e "$checkout/.git" ] && [ ! -d "$checkout/.git" ]; then
    die "cache path is not an owned checkout: $checkout"
  fi
  admit_release_priority "$beelink"
  if [ -e "$checkout/.git" ]; then
    adopt_origin "$checkout" "$repo_url" || exit $?
    # A blame or history check can otherwise fetch hundreds of missing blobs
    # one by one. The cache is disposable, and the repo lock is held here.
    if git -C "$checkout" config --get-regexp '^(remote\.origin\.(promisor|partialclonefilter)|extensions\.partialclone)$' >/dev/null; then
      echo "beelink-gate: rebuilding partial cache with complete history at $checkout" >&2
      rm -rf -- "$checkout" || exit $?
    fi
  fi
  # This gate's own precheck prune may evict its checkout and a partial cache is
  # rebuilt: it then clones, so a warm admission is judged again on the cold
  # reserve before anything is fetched.
  if [ ! -d "$checkout/.git" ] && [ -n "$admitted_shape" ]; then
    admitted_shape=""
    if [ "$reserve_heat" = warm ]; then
      reserve_heat=cold
      echo "beelink-gate: $checkout left the cache after admission, so this gate clones it; judging it on the cold reserve" >&2
      install_reserve_bytes=$(last_install_reserve_bytes "$beelink" "$host/$owner/$repo" "$install_mode" "$reserve_spec" "$peer_reserve" "$peer_warm_reserve" cold) \
        || die "cannot read install reserve receipts"
      if ! check_floor "$beelink" "$install_reserve_bytes"; then
        if (( placed_auto )); then
          echo "beelink-gate: $beelink gave the gate back before checkout ($beelink is below its disk floor); placing the gate again" >&2
          exit "$NOT_ADMITTED"
        fi
        tempfail "$(utc_in_minutes 15)" "$beelink is below its disk floor"
      fi
    fi
  fi
  if [ ! -e "$checkout/.git" ]; then
    [ ! -e "$checkout" ] || die "cache path exists without .git: $checkout"
    git init -q "$checkout" || exit $?
    git -C "$checkout" remote add origin "$(fetch_url "$repo_url")" || exit $?
  fi
  adopt_origin "$checkout" "$repo_url" || exit $?
  if (( install_reserve_bytes > 0 )); then
    reserve_free_before=$(free_bytes)
    reserve_bytes_before=$(measure_gate_bytes) || reserve_bytes_before=""
  fi
  # A step, not a command substitution: bash runs the launcher watchdog's trap
  # only between commands, so a hung ls-remote in $(...) held the lock for 34m.
  local refs_file="$checkout/.git/beelink-gate-remote-refs"
  # Not reaching the origin at all (network, credentials) means the gate could not
  # start, not that the change failed: exit 75 so a waiter retries instead.
  step timeout 120 git -C "$checkout" ls-remote --symref origin HEAD 'refs/heads/*' > "$refs_file" \
    || tempfail "$(utc_in_minutes 5)" "$beelink could not reach $host/$owner/$repo (git ls-remote failed)"
  remote_refs=$(cat "$refs_file") || exit $?
  local -a tracking_refspecs=()
  local -A seen_branches=()
  while IFS=$'\t' read -r left ref; do
    branch=
    if [[ "$left" == 'ref: refs/heads/'* && "$ref" == HEAD ]]; then
      branch=${left#ref: refs/heads/}
      default_branch=$branch
    elif [[ "$ref" == refs/heads/* ]]; then
      [ "$ref" != "refs/heads/$gate_branch" ] || branch_head=$left
      if [[ "$ref" == "refs/heads/$gate_branch" || "$ref" == refs/heads/main || "$ref" == refs/heads/develop || "${left,,}" == "${sha,,}" ]]; then
        branch=${ref#refs/heads/}
      fi
    fi
    if [ -n "$branch" ] && [ -z "${seen_branches[$branch]:-}" ]; then
      tracking_refspecs+=("+refs/heads/$branch:refs/remotes/origin/$branch")
      seen_branches[$branch]=1
    fi
  done <<< "$remote_refs"
  if [ -n "$gate_branch" ] && [ "${branch_head,,}" != "${sha,,}" ]; then
    die "--branch $gate_branch: origin has it at ${branch_head:-no such branch}, not $sha; push the branch or gate its head"
  fi
  echo "beelink-gate: fetching $sha and ${#tracking_refspecs[@]} tracking branch(es) into $checkout" >&2
  wait_for_load "$beelink" || tempfail "$(utc_in_minutes 5)" "host CPU PSI held before fetch"
  local fetch_started=$SECONDS fetch_status
  step timeout 1200 git -C "$checkout" fetch --no-tags origin "$sha" "${tracking_refspecs[@]}"
  fetch_status=$?
  fetch_s=$((SECONDS - fetch_started))
  (( fetch_status == 0 )) || exit "$fetch_status"
  if [ -n "$default_branch" ]; then
    base_sha=$(git -C "$checkout" rev-parse --verify "refs/remotes/origin/$default_branch^{commit}") || base_sha=""
  fi
  # Before checkout, so a path the repo's sparse patterns exclude is never written.
  sparse_spec=$(git -C "$checkout" cat-file blob "$sha:.beelink-gate/sparse-checkout" 2>/dev/null | sparse_spec_of)
  if [ -z "$admitted_shape" ]; then checkout_temperature=cold
  elif [ "$admitted_shape" = "$sparse_spec" ]; then checkout_temperature=warm
  else checkout_temperature=reshaped; fi
  sparse_apply "$checkout" "$sha" || exit $?
  if [ -n "$gate_branch" ]; then
    git -C "$checkout" checkout --force -B "$gate_branch" "$sha" || exit $?
    git -C "$checkout" branch --set-upstream-to="origin/$gate_branch" "$gate_branch" >/dev/null || exit $?
    git -C "$checkout" config push.default current || exit $?
    echo "beelink-gate: checked out $gate_branch at ${sha:0:12} tracking origin/$gate_branch" >&2
  else
    git -C "$checkout" checkout --detach --force "$sha" || exit $?
  fi
  git -C "$checkout" clean -ffdx || exit $?
  actual=$(git -C "$checkout" rev-parse HEAD) || exit $?
  [ "${actual,,}" = "${sha,,}" ] || die "checkout SHA mismatch: $actual"
  gate_refs_before=$(git -C "$checkout" for-each-ref --format='%(objectname)' refs/heads refs/beelink-gate-saved | sort -u | tr '\n' ' ')
  gate_refs_taken=1
  # Keep this gate's fetched checkout locked and intact through the final floor check.
  local floor_ok=0
  check_floor "$beelink" || floor_ok=1
  (( floor_ok == 0 )) || tempfail "$(utc_in_minutes 15)" "$beelink is below its disk floor"

  # Rust output lives inside .git, which checkout and clean leave alone, so it
  # survives between gates and the LRU cap counts and evicts it with its repo.
  export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$checkout/.git/beelink-gate-target}"
  export CARGO_INCREMENTAL="${CARGO_INCREMENTAL:-0}"
  # Nested installs use the same store and cannot wait for a purge prompt.
  export npm_config_store_dir="${npm_config_store_dir:-$HOME/.local/share/pnpm/store}"
  export npm_config_confirm_modules_purge=false
  # Divide workers across active gates, preserving caller overrides.
  gate_workers=$(gate_worker_budget "$cache_root/.locks")
  export VITEST_MAX_WORKERS="${VITEST_MAX_WORKERS:-$gate_workers}"
  export VITEST_MAX_THREADS="${VITEST_MAX_THREADS:-$gate_workers}"
  export VITEST_MAX_FORKS="${VITEST_MAX_FORKS:-$gate_workers}"
  export TURBO_CONCURRENCY="${TURBO_CONCURRENCY:-$gate_workers}"
  export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-$gate_workers}"
  cd "$checkout" || exit $?
  prepare_gate_dependencies || exit $?
  floor_ok=0
  check_floor "$beelink" || floor_ok=1
  observe_install_reserve "after install"
  (( floor_ok == 0 )) || tempfail "$(utc_in_minutes 15)" "$beelink is below its disk floor"
  # Queue ownership transfers only after the last reversible placement guard.
  [ -z "$gate_id" ] || echo "beelink-gate: placement handoff gate_id=$gate_id" >&2
  cancel_if_requested
  export BEELINK_GATE_PHASE_FILE="$timing_file"
  echo "beelink-gate: running ${display% }" >&2
  pre_command_s=$((SECONDS - started))
  export BEELINK_GATE_COMMAND_STARTED_MS=$(date +%s%3N)
  timing_phase='command'
  local command_started=$SECONDS
  local tick cpu_before cpu_after
  tick=$(getconf CLK_TCK 2>/dev/null || echo 100)
  cpu_before=$(children_cpu_ticks)
  # The submitted user unit can inherit umask 0002. Give the requested command
  # a predictable non-group-writable default without changing the gate shell's
  # mask for receipts, bundles, and other state written after the command.
  # A pipeline exits with its last stage: `sh -c 'node --test ... | tail -12'` exited 0 on a failing test, and --merge
  # merged discovery-lab #2097 red. A shell -c command runs under pipefail, so a failing stage fails the
  # gate; the receipt still names the command as requested.
  local -a run_command=("${command[@]}")
  # Any single-dash option cluster holding c counts: beelink1's receipts held 89 `bash -lc` gates (16 piped) and a
  # `bash -euc` (gtr-disk review of dotfiles #535).
  if [[ "${command[0]##*/}" =~ ^(sh|dash|bash)$ && "${command[1]:-}" =~ ^-[A-Za-z]*c[A-Za-z]*$ ]]; then
    run_command=(/usr/bin/bash -o pipefail "${command[@]:1}")
  fi
  local -a command_with_umask=(/usr/bin/bash -c 'umask 022; exec "$@"' beelink-gate-command "${run_command[@]}")
  if (( light )); then
    # No browser: Playwright finds no installed browser and fails the test that wants one.
    mkdir -p "$checkout/.git/beelink-gate-no-browsers"
    PLAYWRIGHT_BROWSERS_PATH="$checkout/.git/beelink-gate-no-browsers" step "${command_with_umask[@]}"
  else
    step "${command_with_umask[@]}"
  fi
  local command_step_exit=$? gate_status
  gate_status=${command_exit:-$command_step_exit}
  timing_phase=post_command
  if [ "$command_step_exit" != 0 ] && [ "$command_step_exit" != "$gate_status" ]; then
    record_post_command_failure "$command_step_exit" command_step
    [ "$gate_status" != 0 ] || gate_status=$command_step_exit
  fi
  command_s=$((SECONDS - command_started))
  cpu_after=$(children_cpu_ticks)
  cpu_s=$(awk -v a="$cpu_before" -v b="$cpu_after" -v t="$tick" 'BEGIN { printf "%.1f", (b - a) / t }')
  if (( light )) && awk -v c="$cpu_s" -v l="$light_cpu" 'BEGIN { exit !(c + 0 > l + 0) }'; then
    echo "beelink-gate: LIGHT GATE OVER BUDGET: the command used ${cpu_s} core-seconds of the ${light_cpu} it declared; run it as a normal gate" >&2
    record_post_command_failure 1 light_budget
    gate_status=1
  fi
  if [ "$gate_status" -eq 0 ] && [ "$install_mode" = ship ]; then
    run_preview
    gate_status=$?
    if [ "$gate_status" -ne 0 ]; then record_post_command_failure "$gate_status" preview
    else publish_proof; fi
  fi
  exit "$gate_status"
}
