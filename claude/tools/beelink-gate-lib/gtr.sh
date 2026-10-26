#!/usr/bin/env bash
# The drew-gtr-pro fallback gate: one gate in a fresh clone under a storage-lifecycle lease.
# Sourced by beelink-gate; it runs on GTR only, never in a staged Beelink gate.
# shellcheck disable=SC2154,SC2034 # repo_url, sha, install_mode, host, owner, repo and launched are the launcher's.
# (SC2034: GTR_AFTER_SECONDS and beelink are read by beelink-gate and prepare_gate_dependencies.)
GTR_HOST=drew-gtr-pro
GTR_AFTER_SECONDS=300
gtr_self() { [ "$(hostname | tr '[:upper:]' '[:lower:]')" = "$GTR_HOST" ]; }

# GTR's receipts.jsonl, read here on GTR or over SSH; a host that never gated has none.
gtr_receipts() {
  # shellcheck disable=SC2016 # expands on GTR
  local read='f=${BEELINK_GATE_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/beelink-gate}/receipts.jsonl; [ ! -e "$f" ] || cat "$f"'
  if gtr_self; then bash -c "$read"
  else bounded_transport "$GTR_HOST receipts" ssh "${SSH_OPTIONS[@]}" "$GTR_HOST" "$read"; fi
}

# The lease's bytes: the most any measurement says this gate can grow. That is the repo's largest GTR
# clone plus a quarter, or the growth in the Beelinks' install reserve for its checkout shape
# (last_install_reserve_bytes: their newest cold receipt, which is the 10 GiB headroom plus measured
# growth), whichever is larger; a repo no host has measured asks for the whole 10 GiB. The newest clone
# is not enough: a gate that failed before its install measured 140 MB, and the next leased 317 MB for a
# 2.5 GB clone. Every GTR gate leases in the op-company:beelink-gate-gtr lane (tangle-tools
# storage_lifecycle/hosts/drew-GTR-Pro.json), never its caller's 4 GiB fleet lane, which refused an
# agent-container gate; the install guard accepts only an op-<operator>:<window> lane. A refusal keeps
# the gate waiting for a Beelink.
gtr_reserve_bytes() {
  local peer=0 value beelink_bytes
  for value in "${matched_reserve[@]}"; do [[ "$value" =~ ^[0-9]+$ ]] && (( value > peer )) && peer=$value; done
  beelink_bytes=$(last_install_reserve_bytes "$GTR_HOST" "$host/$owner/$repo" install "${BEELINK_GATE_SPARSE_SPEC:-}" "$peer" "" cold) || return 1
  python3 - "$STATE_DIR/receipts.jsonl" "$host/$owner/$repo" "$beelink_bytes" <<'PY'
import json, sys
largest = 0
try:
    for line in open(sys.argv[1], errors="replace"):
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if row.get("repo") == sys.argv[2] and isinstance(row.get("gtr_bytes"), int):
            largest = max(largest, row["gtr_bytes"])
except OSError:
    pass
headroom = 10 * 1024 ** 3
beelink = int(sys.argv[3])
growth = beelink - headroom if beelink > headroom else headroom
print(max(growth, largest * 5 // 4) if largest else max(growth, 1 << 30))
PY
}

# Runs the gate on GTR and exits with its status. Returns NOT_ADMITTED when GTR did not
# admit it (storage-lifecycle refused, GTR unreachable), so the caller keeps waiting for a Beelink.
# GTR says "drew-gtr-pro admitted" on stderr once it has the lease; nothing else counts as admission.
gtr_gate() {  # <command>...
  local rc pid log id dir bytes q admitted flag=()
  case "$install_mode" in install|no-install) ;;
    *) [ "$requested" != "$GTR_HOST" ] || die "drew-gtr-pro runs install and --no-install gates only, not --$install_mode"
       return "$NOT_ADMITTED" ;; esac
  if [ "${gate_class:-}" = dev ] || [ -n "${gate_branch:-}" ]; then
    [ "$requested" != "$GTR_HOST" ] || die "--dev and --branch gates run on the Beelinks, not drew-gtr-pro"
    return "$NOT_ADMITTED"
  fi
  [ "$install_mode" = install ] || flag=(--no-install)
  log=$(mktemp) || return "$NOT_ADMITTED"
  if gtr_self; then
    parse_repo_url "$repo_url"
    id="$GTR_HOST-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
    dir="$HOME/.cache/gtr-gate/pool/$id"
    bytes=$(gtr_reserve_bytes) || { rm -f "$log"; return "$NOT_ADMITTED"; }
    echo "beelink-gate: gate_id=$id; storage-lifecycle run-lane --lane op-company:beelink-gate-gtr reserves $bytes bytes for $dir" >&2
    # Its own session, so a stop reaches run-lane, the gate and the command together.
    setsid storage-lifecycle run-lane --lane op-company:beelink-gate-gtr --path "$dir" --bytes "$bytes" -- \
      env BEELINK_GATE_ID="$id" BEELINK_GATE_PLACED_WAIT=$(( ${BEELINK_GATE_PLACED_WAIT:-0} + SECONDS - launched )) \
      "$BASH" "$gate_source_root/beelink-gate" --gtr-run "$(encode "$log")" "$(encode "$dir")" "$(encode "$repo_url")" "$(encode "$sha")" "$(encode "$install_mode")" "$@" &
  else
    printf -v q '%q ' env BEELINK_GATE_GTR_AUTO=1 BEELINK_GATE_PR="${BEELINK_GATE_PR:-}" BEELINK_GATE_LANE="$BEELINK_GATE_LANE" \
      BEELINK_GATE_MAX_HOLD="${BEELINK_GATE_MAX_HOLD:-}" BEELINK_GATE_PLACED_WAIT=$((SECONDS - launched)) \
      bin/beelink-gate ${flag[@]+"${flag[@]}"} "$GTR_HOST" "$repo_url" "$sha" -- "$@"
    ssh -n "${SSH_OPTIONS[@]}" "$GTR_HOST" "$q" 2> >(tee -a "$log" >&2) &
  fi
  pid=$!
  local saved_traps; saved_traps=$(trap -p TERM INT HUP)
  # A stop goes to the gate under run-lane, which then records its receipt and removes its clone; run-lane
  # sees it fail and releases the lease. TERM to run-lane itself kept the lease (it releases only on a
  # known outcome) and leaked 17.3 GB of the gate lane on 10-26. The SSH path has no child here: ssh stops.
  trap 'pkill -TERM -P "$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null; wait "$pid"; rm -f "$log"; exit 143' TERM INT HUP
  while kill -0 "$pid" 2>/dev/null; do
    # Once GTR admits the gate, its FIFO places on the Beelinks go to the gates behind it.
    if [ -n "${checkout_reservation_dir:-}" ] && grep -q "^beelink-gate: $GTR_HOST admitted" "$log"; then
      stop_checkout_reservations; checkout_reservation_dir=""
    fi
    sleep 1
  done
  wait "$pid"; rc=$?
  trap - TERM INT HUP; eval "$saved_traps"
  admitted=$(grep -c "^beelink-gate: $GTR_HOST admitted" "$log")
  # Here the gate's status is its own last line, not run-lane's exit.
  if [ "$admitted" = 0 ]; then
    rm -f "$log"
    echo "beelink-gate: $GTR_HOST did not admit this gate (exit $rc); waiting for a Beelink" >&2
    return "$NOT_ADMITTED"
  fi
  if gtr_self; then rc=$(sed -n "s/^beelink-gate: $GTR_HOST status=//p" "$log" | tail -n 1); fi
  rm -f "$log"
  [ "$rc" != 255 ] || tempfail "$(utc_in_minutes 5)" "lost the connection to $GTR_HOST after it admitted the gate; its receipt (beelink-gate --receipt) records the result"
  [[ "$rc" =~ ^[0-9]+$ ]] || rc=1
  exit "$rc"
}

# The gate itself, under run-lane's lease: clone, frozen install, command, receipt, clone removed.
# Every exit path, a signal included, writes a receipt; only a command that returned writes its status.
gtr_run() {  # <log> <dir> <repo-url> <sha> <mode> <command>...
  # Global, as in remote_gate: gtr_finish reads this state from the EXIT trap after gtr_run returned.
  log=$(decode "$1") dir=$(decode "$2") repo_url=$(decode "$3") sha=$(decode "$4") install_mode=$(decode "$5")
  shift 5
  command=("$@") beelink=$GTR_HOST checkout="$dir/checkout" gate_id=${BEELINK_GATE_ID:-} reaped=0 current=""
  # The command must not learn its gate's id: it could append a passing receipt for it.
  unset BEELINK_GATE_ID
  gate_refs_before="" gate_refs_taken=0 bundle_note=""
  run_token="$$.${EPOCHSECONDS:-$(date +%s)}.$RANDOM$RANDOM"
  parse_repo_url "$repo_url"
  echo "beelink-gate: $GTR_HOST admitted gate_id=$gate_id" | tee -a "$log" >&2 || exit 75
  started=$SECONDS base_sha="" gtr_status=""
  max_hold=$(seconds_of "${BEELINK_GATE_MAX_HOLD:-45m}") || die "invalid BEELINK_GATE_MAX_HOLD"
  printf -v display '%q ' "${command[@]}"
  # A lost launcher closes stderr: the receipt, the clone's removal and the status line come before any output.
  gtr_finish() {
    local status=$1 bytes
    trap '' PIPE; trap - EXIT TERM INT HUP
    [ -z "$current" ] || kill -TERM "$current" 2>/dev/null
    reap_leftovers
    # Commits the command made that reach no remote are bundled before the clone goes, as on a Beelink.
    save_unpushed
    bytes=$(du -sb "$dir" 2>/dev/null | cut -f1)
    gtr_write_receipt "$status" "$((SECONDS - started))" "${bytes:-0}" "$base_sha" "${display% }"
    chmod -R u+w "$dir" 2>/dev/null; rm -rf -- "$dir"
    echo "beelink-gate: $GTR_HOST status=$status" >> "$log"
    echo "beelink-gate receipt: sha=$sha install=$install_mode exit=$status duration=$((SECONDS - started))s host=$GTR_HOST class=normal gtr_bytes=${bytes:-0} gate_id=$gate_id" >&2
    exit "$status"
  }
  # A gate that ends before its command returned is never green, whatever $? says.
  trap 's=$?; gtr_finish "${gtr_status:-$(( s ? s : 1 ))}"' EXIT
  trap 'gtr_finish 143' TERM; trap 'gtr_finish 129' HUP; trap 'gtr_finish 130' INT; trap 'gtr_finish 141' PIPE
  # Each step is bounded by the gate's remaining hold, as on a Beelink, and its leftovers are stopped.
  step() {
    local left=$((started + max_hold - SECONDS)) rc
    (( left > 0 )) || { echo "beelink-gate: hold limit of ${max_hold}s reached; stopped $1" >&2; return 124; }
    BEELINK_GATE_RUN=$run_token timeout -k 30 "$left" "$@" </dev/null & current=$!
    wait "$current"; rc=$?
    current=""
    reap_leftovers
    return "$rc"
  }
  mkdir -p "$dir" || exit 75
  git clone --quiet --no-checkout --filter=blob:none "$(fetch_url "$repo_url")" "$checkout" || exit 75
  git -C "$checkout" fetch --quiet --filter=blob:none origin "$sha" || exit 75
  base_sha=$(git -C "$checkout" rev-parse origin/HEAD 2>/dev/null)
  sparse_apply "$checkout" "$sha" || exit $?
  git -C "$checkout" checkout --quiet --detach "$sha" || exit $?
  [ "$(git -C "$checkout" rev-parse HEAD)" = "${sha,,}" ] || die "checkout SHA mismatch"
  gate_refs_before=$(git -C "$checkout" for-each-ref --format='%(objectname)' refs/heads | sort -u | tr '\n' ' ') gate_refs_taken=1
  cd "$checkout" || exit $?
  # pnpm 11+ keeps metadata in <cache-dir>/v11, and GTR's ~/.cache/pnpm/v11 links to the SMR traces drive
  # (/mnt/traces/adc-egress-cache-recovery-20261002), which starved Discovery on 10-26. The install and the
  # command keep their cache on NVMe; pnpm 12 reads this variable, not npm_config_cache_dir.
  export pnpm_config_cache_dir="$HOME/.cache/pnpm-gate"
  prepare_gate_dependencies || exit $?
  gate_command_argv "${command[@]}"
  echo "beelink-gate: running ${display% } on $GTR_HOST" >&2
  step "${command_with_umask[@]}"
  gtr_status=$?
  return "$gtr_status"
}

gtr_write_receipt() {  # <status> <ran_s> <clone bytes> <base sha> <command>
  mkdir -p "$STATE_DIR" && GTR_BUNDLE="${bundle_note:-}" python3 - "$STATE_DIR/receipts.jsonl" "$host/$owner/$repo" "$sha" "$install_mode" "$5" "$1" "$2" "$3" "$4" "$gate_id" <<'PY'
import fcntl, json, os, sys, time
path, repo, sha, mode, command, status, ran, size, base, gate_id = sys.argv[1:]
pr = os.environ.get("BEELINK_GATE_PR", "")
row = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "host": "drew-gtr-pro", "repo": repo, "sha": sha,
       "mode": mode, "command": command, "exit": int(status), "waited_s": int(os.environ.get("BEELINK_GATE_PLACED_WAIT") or 0),
       "ran_s": int(ran), "class": "normal", "gate_id": gate_id, "base_sha": base or None,
       "pr_number": int(pr) if pr.isdigit() else None, "lane": os.environ.get("BEELINK_GATE_LANE") or None,
       "gtr_bytes": int(size), "checkout_temperature": "cold", "bundle": os.environ.get("GTR_BUNDLE") or None}
with open(path, "a") as out:
    fcntl.flock(out, fcntl.LOCK_EX)
    out.write(json.dumps(row) + "\n")
PY
}
