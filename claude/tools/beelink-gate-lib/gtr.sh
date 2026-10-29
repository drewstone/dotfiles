#!/usr/bin/env bash
# The drew-gtr-pro fallback gate: one gate in a fresh clone under a storage-lifecycle lease.
# Sourced by beelink-gate; it runs on GTR only, never in a staged Beelink gate.
# shellcheck disable=SC2154,SC2034 # repo_url, sha, install_mode, host, owner, repo and launched are the launcher's.
# (SC2034: beelink is read by prepare_gate_dependencies.)
GTR_HOST=drew-gtr-pro
gtr_self() { [ "$(hostname | tr '[:upper:]' '[:lower:]')" = "$GTR_HOST" ]; }

# The lifecycle installer owns ~/bin/storage-lifecycle, including non-login SSH.
gtr_lifecycle() { [ -x "$HOME/bin/storage-lifecycle" ] && printf '%s\n' "$HOME/bin/storage-lifecycle"; }

# GTR's receipts.jsonl, read here on GTR or over SSH; a host that never gated has none.
gtr_receipts() {
  # shellcheck disable=SC2016 # expands on GTR
  local read='f=${BEELINK_GATE_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/beelink-gate}/receipts.jsonl; [ ! -e "$f" ] || cat "$f"'
  if gtr_self; then bash -c "$read"; else bounded_transport "$GTR_HOST receipts" ssh "${SSH_OPTIONS[@]}" "$GTR_HOST" "$read"; fi
}

# The lease's bytes: the most any measurement says this gate can grow: the largest gtr_bytes (gtr_used_bytes) of the same
# command, else of the repo, plus a quarter, or the Beelinks' install-reserve growth for its checkout shape (newest cold
# receipt: 10 GiB headroom plus measured growth), whichever is larger; an unmeasured repo asks for 10 GiB. The newest
# clone is not enough (140 MB measured, then 317 MB leased for a 2.5 GB clone). Without a Beelink figure, a passed GTR
# install gate or one of this mode lets the repo lease its largest plus a quarter (10 GiB had leased a 368 MB Traces
# gate, 10-27). Every GTR gate leases in op-company:beelink-gate-gtr (tangle-tools storage_lifecycle/hosts/drew-GTR-Pro.json),
# never its caller's 4 GiB fleet lane; the install guard accepts only an op-<operator>:<window> lane. A refusal waits for a Beelink.
gtr_reserve_bytes() {
  local peer=0 value beelink_bytes
  for value in "${matched_reserve[@]}"; do [[ "$value" =~ ^[0-9]+$ ]] && (( value > peer )) && peer=$value; done
  beelink_bytes=$(last_install_reserve_bytes "$GTR_HOST" "$host/$owner/$repo" install "${BEELINK_GATE_SPARSE_SPEC:-}" "$peer" "" cold) || return 1
  python3 - "$STATE_DIR/receipts.jsonl" "$host/$owner/$repo" "$beelink_bytes" "$install_mode" "$1" <<'PY'
import json, sys
largest, passed, same = 0, False, 0
try:
    for line in open(sys.argv[1], errors="replace"):
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if row.get("repo") == sys.argv[2] and isinstance(row.get("gtr_bytes"), int):
            largest = max(largest, row["gtr_bytes"])
            if row.get("command") == sys.argv[5]: same = max(same, row["gtr_bytes"])
            passed = passed or row.get("exit") == 0 and row.get("mode") in ("install", sys.argv[4])
except OSError:
    pass
headroom = 10 * 1024 ** 3
beelink = int(sys.argv[3])
growth = beelink - headroom if beelink > headroom else 0 if passed else headroom
largest = same or largest  # a hostlab suite's images and closure tar are not every gate's (10-27)
print(max(growth, largest * 5 // 4) if largest else max(growth, 1 << 30))
PY
}

# Runs the gate on GTR and exits with its status, or returns NOT_ADMITTED when GTR did not admit it (storage-lifecycle
# refused, GTR unreachable) so the caller waits for a Beelink. Only "drew-gtr-pro admitted" on stderr counts as admission.
gtr_gate() {  # <command>...
  local rc pid log id dir bytes derived lifecycle q admitted flag=()
  case "$install_mode" in install|no-install) ;; *) die "drew-gtr-pro runs install and --no-install gates only, not --$install_mode" ;; esac
  [ "${gate_class:-}" != dev ] && [ -z "${gate_branch:-}" ] || die "--dev and --branch gates run on the Beelinks, not drew-gtr-pro"
  [ "$install_mode" = install ] || flag=(--no-install)
  log=$(mktemp) || return "$NOT_ADMITTED"
  if gtr_self; then
    parse_repo_url "$repo_url"
    id="$GTR_HOST-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
    dir="$HOME/.cache/gtr-gate/pool/$id"
    printf -v q '%q ' "$@"; derived=$(gtr_reserve_bytes "${q% }") || { rm -f "$log"; return "$NOT_ADMITTED"; }; bytes=$(( derived > ${BEELINK_GATE_RESERVE_BYTES:-0} ? derived : BEELINK_GATE_RESERVE_BYTES ))  # a declared reserve only raises
    lifecycle=$(gtr_lifecycle) || { echo "beelink-gate: storage-lifecycle is not installed on $GTR_HOST; waiting for a Beelink" >&2; rm -f "$log"; return "$NOT_ADMITTED"; }
    echo "beelink-gate: gate_id=$id; storage-lifecycle run-lane --lane op-company:beelink-gate-gtr reserves $bytes bytes (derived $derived, declared ${BEELINK_GATE_RESERVE_BYTES:-none}) for $dir" >&2
    # Its own session, so a stop reaches run-lane, the gate and the command together.
    setsid "$lifecycle" run-lane --lane op-company:beelink-gate-gtr --path "$dir" --bytes "$bytes" -- \
      env BEELINK_GATE_ID="$id" BEELINK_GATE_RESERVE_DERIVED="$derived" BEELINK_GATE_LEASE_BYTES="$bytes" BEELINK_GATE_PLACED_WAIT=$(( ${BEELINK_GATE_PLACED_WAIT:-0} + SECONDS - launched )) \
      "$BASH" "$gate_source_root/beelink-gate" --gtr-run "$(encode "$log")" "$(encode "$dir")" "$(encode "$repo_url")" "$(encode "$sha")" "$(encode "$install_mode")" "$@" &
  else
    printf -v q '%q ' env BEELINK_GATE_PR="${BEELINK_GATE_PR:-}" BEELINK_GATE_LANE="$BEELINK_GATE_LANE" BEELINK_GATE_RESERVE_BYTES="${BEELINK_GATE_RESERVE_BYTES:-}" \
      BEELINK_GATE_MAX_HOLD="${BEELINK_GATE_MAX_HOLD:-}" BEELINK_GATE_PLACED_WAIT=$((SECONDS - launched)) \
      bin/beelink-gate ${flag[@]+"${flag[@]}"} "$GTR_HOST" "$repo_url" "$sha" -- "$@"
    ssh -n "${SSH_OPTIONS[@]}" "$GTR_HOST" "$q" 2> >(tee -a "$log" >&2) &
  fi
  pid=$!
  local saved_traps; saved_traps=$(trap -p TERM INT HUP)
  # A stop goes to the gate under run-lane, which records its receipt, removes its clone and fails, so run-lane releases the
  # lease; TERM to run-lane itself kept it (17.3 GB of the gate lane leaked, 10-26). The SSH path has no child: ssh stops.
  trap 'pkill -TERM -P "$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null; wait "$pid"; rm -f "$log"; exit 143' TERM INT HUP
  # Once GTR admits the gate, its FIFO places on the Beelinks go to the gates behind it.
  while kill -0 "$pid" 2>/dev/null; do
    [ -z "${checkout_reservation_dir:-}" ] || ! grep -q "^beelink-gate: $GTR_HOST admitted" "$log" || { stop_checkout_reservations; checkout_reservation_dir=""; }
    sleep 1
  done
  wait "$pid"; rc=$?
  trap - TERM INT HUP; eval "$saved_traps"
  admitted=$(grep -c "^beelink-gate: $GTR_HOST admitted" "$log")
  # Here the gate's status is its own last line, not run-lane's exit.
  [ "$admitted" != 0 ] || { rm -f "$log"; echo "beelink-gate: $GTR_HOST did not admit this gate (exit $rc); waiting for a Beelink" >&2; return "$NOT_ADMITTED"; }
  if gtr_self; then rc=$(sed -n "s/^beelink-gate: $GTR_HOST status=//p" "$log" | tail -n 1); fi
  rm -f "$log"
  [ "$rc" != 255 ] || tempfail "$(utc_in_minutes 5)" "lost the connection to $GTR_HOST after it admitted the gate; its receipt (beelink-gate --receipt) records the result"
  [[ "$rc" =~ ^[0-9]+$ ]] || rc=1
  exit "$rc"
}

# The gate itself, under run-lane's lease: clone, frozen install, command, receipt, clone removed. Every exit path, a
# signal included, writes a receipt; only a command that returned writes its status.
gtr_run() {  # <log> <dir> <repo-url> <sha> <mode> <command>...
  # Global, as in remote_gate: gtr_finish reads this state from the EXIT trap after gtr_run returned.
  log=$(decode "$1") dir=$(decode "$2") repo_url=$(decode "$3") sha=$(decode "$4") install_mode=$(decode "$5")
  shift 5
  command=("$@") beelink=$GTR_HOST checkout="$dir/checkout" gate_id=${BEELINK_GATE_ID:-} reaped=0 current=""
  # The command must not learn its gate's id: it could append a passing receipt for it.
  unset BEELINK_GATE_ID
  gate_refs_before="" gate_refs_taken=0 bundle_note="" gtr_images_before="" overrun_bytes="" run_token="$$.${EPOCHSECONDS:-$(date +%s)}.$RANDOM$RANDOM"
  parse_repo_url "$repo_url"
  echo "beelink-gate: $GTR_HOST admitted gate_id=$gate_id" | tee -a "$log" >&2 || exit 75
  started=$SECONDS base_sha="" gtr_status="" max_hold=$(seconds_of "${BEELINK_GATE_MAX_HOLD:-45m}") || die "invalid BEELINK_GATE_MAX_HOLD"
  printf -v display '%q ' "${command[@]}"
  # A lost launcher closes stderr: the receipt, the clone's removal and the status line come before any output.
  gtr_finish() {
    local status=$1 bytes
    trap '' PIPE; trap - EXIT TERM INT HUP
    [ -z "$current" ] || kill -TERM "$current" 2>/dev/null
    reap_leftovers
    # Commits the command made that reach no remote are bundled before the clone goes, as on a Beelink.
    save_unpushed
    bytes=$(gtr_used_bytes)
    gtr_write_receipt "$status" "$((SECONDS - started))" "${bytes:-0}" "$base_sha" "${display% }"
    # One rename takes the clone out of the pool that admission's lane accounting walks, so the slow
    # delete runs where no walk sees files vanish (an admission refused on ENOENT mid-rm on 10-26).
    local gone="${dir%/pool/*}/.retiring-${dir##*/}"; mv -T -- "$dir" "$gone" 2>/dev/null || gone=$dir
    chmod -R u+w "$gone" 2>/dev/null; rm -rf -- "$gone" 2>/dev/null || { docker run --rm -v "$gone:/w" busybox:1.36 find /w -mindepth 1 -delete; rm -rf -- "$gone"; }
    echo "beelink-gate: $GTR_HOST status=$status" >> "$log"; echo "beelink-gate receipt: sha=$sha install=$install_mode exit=$status duration=$((SECONDS - started))s host=$GTR_HOST class=normal gtr_bytes=${bytes:-0} gate_id=$gate_id" >&2
    exit "$status"
  }
  # A gate that ends before its command returned is never green, whatever $? says.
  trap 's=$?; gtr_finish "${gtr_status:-$(( s ? s : 1 ))}"' EXIT; trap 'gtr_finish 143' TERM; trap 'gtr_finish 129' HUP; trap 'gtr_finish 130' INT; trap 'gtr_finish 141' PIPE
  # Each step is bounded by the gate's remaining hold, as on a Beelink, and its leftovers are stopped.
  step() {
    local left=$((started + max_hold - SECONDS)) rc
    (( left > 0 )) || { echo "beelink-gate: hold limit of ${max_hold}s reached; stopped $1" >&2; return 124; }
    BEELINK_GATE_RUN=$run_token timeout -k 30 "$left" "${gtr_scope[@]}" "$@" </dev/null & current=$!
    gtr_watch_lease & local watcher=$!
    wait "$current"; rc=$?
    kill "$watcher" 2>/dev/null; wait "$watcher" 2>/dev/null; current=""
    [ ! -f "$dir/.overrun" ] || { overrun_bytes=$(cat "$dir/.overrun"); rc=124; }
    reap_leftovers
    return "$rc"
  }
  # Each step runs on half the CPUs (affinity, which availableParallelism reads) in a user scope capped there and at
  # 32 GiB, and says it is admitted: hostlab's harness then sizes its VM 8 vCPU / 16 GiB. No user manager: unbounded, unsaid.
  local cpus=$(( $(nproc --all) / 2 )) mem=$(( 32 << 30 )) cpu pnpm_fence="$HOME/.cache/tangle/storage-lifecycle/pnpm-store.lock" pnpm_fd; cpu=$(( cpus * 100 )); export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}; gtr_scope=()
  systemd-run --user --scope --quiet true 2>/dev/null && gtr_scope=(systemd-run --user --scope --quiet -p "CPUQuota=$cpu%" -p "MemoryMax=$mem" -- taskset -c "0-$((cpus - 1))") \
    && export BEELINK_GATE_ADMITTED=1 BEELINK_GATE_ADMISSION_SAMPLE="{\"mode\":\"gtr_storage_lease\",\"cpus\":$cpus,\"cpu_quota_pct\":$cpu,\"memory_max_bytes\":$mem}"
  # Keep the shared producer FD through dependency installation, commands and child cleanup.
  (umask 077; : >> "$pnpm_fence") && exec {pnpm_fd}<>"$pnpm_fence" || exit 75
  flock -s -w "$((started + max_hold - SECONDS))" "$pnpm_fd" || exit 75
  python3 -I -c 'from pathlib import Path; import os,stat,sys
p=Path(sys.argv[1]); a=p.lstat(); b=os.fstat(int(sys.argv[2]))
if any(x.is_symlink() for x in p.parents) or not stat.S_ISREG(a.st_mode) or a.st_uid!=os.getuid() or a.st_nlink!=1 or a.st_mode&0o022 or (a.st_dev,a.st_ino)!=(b.st_dev,b.st_ino): sys.exit("unsafe GTR PNPM producer fence")
' "$pnpm_fence" "$pnpm_fd" || exit 75
  mkdir -p "$dir/tmp" || exit 75; export TMPDIR="$dir/tmp" BEELINK_GATE_LEASE_DIR="$dir"; gtr_images_before=$(docker image ls -q --no-trunc 2>/dev/null | sort -u)
  git clone --quiet --no-checkout --filter=blob:none "$(fetch_url "$repo_url")" "$checkout" || exit 75
  git -C "$checkout" fetch --quiet --filter=blob:none origin "$sha" || exit 75
  base_sha=$(git -C "$checkout" rev-parse origin/HEAD 2>/dev/null)
  sparse_apply "$checkout" "$sha" || exit $?
  git -C "$checkout" checkout --quiet --detach "$sha" || exit $?
  [ "$(git -C "$checkout" rev-parse HEAD)" = "${sha,,}" ] || die "checkout SHA mismatch"
  gate_refs_before=$(git -C "$checkout" for-each-ref --format='%(objectname)' refs/heads | sort -u | tr '\n' ' ') gate_refs_taken=1
  cd "$checkout" || exit $?
  prepare_gate_dependencies || exit $?
  gate_command_argv "${command[@]}"
  echo "beelink-gate: running ${display% } on $GTR_HOST" >&2
  step "${command_with_umask[@]}"
  gtr_status=$?
  return "$gtr_status"
}

# The gate's bytes: its leased dir (clone, TMPDIR), Docker images made since it started and hostlab runs tagged with it
# (10-27: a 6.13 GB lease wrote 12.6 GB of images and a /tmp tar; a 16 GB lease's VM disks reached 39.8 GB outside it).
gtr_used_bytes() {
  local size images=0 id; size=$(du -sb "$dir" $(grep -lxF "$dir" "${HOSTLAB_HOME:-$HOME/.cache/hostlab}"/runs/*/gate 2>/dev/null | xargs -r -n1 dirname) 2>/dev/null | awk '{ n += $1 } END { print n + 0 }')
  for id in $(comm -13 <(printf '%s\n' "$gtr_images_before") <(docker image ls -q --no-trunc 2>/dev/null | sort -u)); do images=$(( images + $(docker image inspect -f '{{.Size}}' "$id" 2>/dev/null || echo 0) )); done
  echo $(( ${size:-0} + images ))
}
# Beside each step: past 1.5x the lease the step is stopped (124, a limit) and the receipt records overrun_bytes.
gtr_watch_lease() {
  local lease=${BEELINK_GATE_LEASE_BYTES:-0} used
  while (( lease > 0 )) && sleep "${BEELINK_GATE_LEASE_POLL_SECONDS:-60}"; do
    used=$(gtr_used_bytes); (( used * 2 > lease * 3 )) || continue
    echo "beelink-gate: stopping the command at $used bytes, past 1.5x its $lease-byte lease" >&2; echo "$used" > "$dir/.overrun"; kill -TERM "$current" 2>/dev/null; return 0
  done
}

gtr_write_receipt() {  # <status> <ran_s> <clone bytes> <base sha> <command>
  mkdir -p "$STATE_DIR" && GTR_OVERRUN="${overrun_bytes:-}" GTR_BUNDLE="${bundle_note:-}" python3 - "$STATE_DIR/receipts.jsonl" "$host/$owner/$repo" "$sha" "$install_mode" "$5" "$1" "$2" "$3" "$4" "$gate_id" <<'PY'
import fcntl, json, os, sys, time
path, repo, sha, mode, command, status, ran, size, base, gate_id = sys.argv[1:]
pr = os.environ.get("BEELINK_GATE_PR", "")
row = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "host": "drew-gtr-pro", "repo": repo, "sha": sha,
       "mode": mode, "command": command, "exit": int(status), "waited_s": int(os.environ.get("BEELINK_GATE_PLACED_WAIT") or 0),
       "ran_s": int(ran), "class": "normal", "gate_id": gate_id, "base_sha": base or None,
       "pr_number": int(pr) if pr.isdigit() else None, "lane": os.environ.get("BEELINK_GATE_LANE") or None,
       "gtr_bytes": int(size), "overrun_bytes": int(os.environ["GTR_OVERRUN"]) if os.environ.get("GTR_OVERRUN") else None, **{k: int(os.environ[e]) if os.environ.get(e) else None for k, e in (("reserve_declared", "BEELINK_GATE_RESERVE_BYTES"), ("reserve_derived", "BEELINK_GATE_RESERVE_DERIVED"), ("lease_bytes", "BEELINK_GATE_LEASE_BYTES"))}, "checkout_temperature": "cold", "bundle": os.environ.get("GTR_BUNDLE") or None}
with open(path, "a") as out:
    fcntl.flock(out, fcntl.LOCK_EX)
    out.write(json.dumps(row) + "\n")
PY
}
