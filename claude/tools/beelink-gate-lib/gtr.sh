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

# The lease's bytes: the clone this repo's newest GTR gate measured plus a quarter, else the 4 GiB lane quota.
gtr_reserve_bytes() {
  python3 - "$STATE_DIR/receipts.jsonl" "$host/$owner/$repo" <<'PY'
import json, sys
newest = 0
try:
    for line in open(sys.argv[1], errors="replace"):
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if row.get("repo") == sys.argv[2] and isinstance(row.get("gtr_bytes"), int):
            newest = row["gtr_bytes"]
except OSError:
    pass
print(max(1 << 30, newest * 5 // 4) if newest else 4 << 30)
PY
}

# Runs the gate on GTR and exits with its status. Returns NOT_ADMITTED only when
# storage-lifecycle did not admit it, so the caller keeps waiting for a Beelink.
gtr_gate() {  # <command>...
  local rc lane flag=() q
  case "$install_mode" in install) ;; no-install) flag=(--no-install) ;;
    *) echo "beelink-gate: drew-gtr-pro runs install and --no-install gates only, not --$install_mode" >&2; return "$NOT_ADMITTED" ;; esac
  [ "${gate_class:-}" != dev ] || { echo "beelink-gate: a --dev gate does not fall back to drew-gtr-pro" >&2; return "$NOT_ADMITTED"; }
  if ! gtr_self; then
    printf -v q '%q ' env BEELINK_GATE_GTR_AUTO="$([ "$requested" = auto ] && echo 1)" BEELINK_GATE_PR="${BEELINK_GATE_PR:-}" \
      BEELINK_GATE_LANE="$BEELINK_GATE_LANE" BEELINK_GATE_MAX_HOLD="${BEELINK_GATE_MAX_HOLD:-}" BEELINK_GATE_PLACED_WAIT=$((SECONDS - launched)) \
      bin/beelink-gate "${flag[@]}" "$GTR_HOST" "$repo_url" "$sha" -- "$@"
    ssh -n "${SSH_OPTIONS[@]}" "$GTR_HOST" "$q"; rc=$?
    [ "$rc" = "$NOT_ADMITTED" ] && return "$rc"
    exit "$rc"
  fi
  local id dir marker bytes
  parse_repo_url "$repo_url"
  id="$GTR_HOST-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
  dir="$HOME/.cache/gtr-gate/$id" marker=$(mktemp) bytes=$(gtr_reserve_bytes)
  lane=${BEELINK_GATE_LANE:-gtr-gate}
  echo "beelink-gate: gate_id=$id; storage-lifecycle run-lane --lane $lane reserves $bytes bytes for $dir" >&2
  storage-lifecycle run-lane --lane "$lane" --path "$dir" --bytes "$bytes" -- \
    env BEELINK_GATE_ID="$id" BEELINK_GATE_PLACED_WAIT=$(( ${BEELINK_GATE_PLACED_WAIT:-0} + SECONDS - launched )) \
    "$BASH" "$0" --gtr-run "$(encode "$marker")" "$(encode "$dir")" "$(encode "$repo_url")" "$(encode "$sha")" "$(encode "$install_mode")" "$@" &
  local pid=$!
  # Once GTR admits the gate, its FIFO places on the Beelinks go to the gates behind it.
  while [ -n "${checkout_reservation_dir:-}" ] && kill -0 "$pid" 2>/dev/null; do
    if [ -s "$marker" ]; then stop_checkout_reservations; checkout_reservation_dir=""; fi
    sleep 1
  done
  wait "$pid"; rc=$?
  if [ ! -s "$marker" ]; then
    rm -f "$marker"
    echo "beelink-gate: drew-gtr-pro storage admission did not admit $id (run-lane exit $rc); waiting for a Beelink" >&2
    return "$NOT_ADMITTED"
  fi
  # The gate writes its status last; a gate killed before that has only "admitted".
  rc=$(tail -n 1 "$marker"); rm -f "$marker"
  [[ "$rc" =~ ^[0-9]+$ ]] || rc=1
  exit "$rc"
}

# The gate itself, under run-lane's lease: clone, frozen install, command, receipt, clone removed.
gtr_run() {  # <marker> <dir> <repo-url> <sha> <mode> <command>...
  local marker dir repo_url
  marker=$(decode "$1") dir=$(decode "$2") repo_url=$(decode "$3") sha=$(decode "$4") install_mode=$(decode "$5")
  shift 5
  command=("$@") beelink=$GTR_HOST checkout="$dir/checkout" gate_id=${BEELINK_GATE_ID:-}
  parse_repo_url "$repo_url"
  echo admitted > "$marker" || exit 75
  local started=$SECONDS max_hold base_sha="" status display
  max_hold=$(seconds_of "${BEELINK_GATE_MAX_HOLD:-45m}") || die "invalid BEELINK_GATE_MAX_HOLD"
  printf -v display '%q ' "${command[@]}"
  gtr_finish() {
    local status=$1 bytes
    trap - EXIT
    bytes=$(du -sb "$dir" 2>/dev/null | cut -f1)
    gtr_write_receipt "$status" "$((SECONDS - started))" "${bytes:-0}" "$base_sha" "${display% }"
    chmod -R u+w "$dir" 2>/dev/null; rm -rf -- "$dir"
    echo "$status" >> "$marker"
    exit "$status"
  }
  trap 'gtr_finish $?' EXIT
  # Each step is bounded by the gate's remaining hold, as on a Beelink.
  step() {
    local left=$((started + max_hold - SECONDS))
    (( left > 0 )) || { echo "beelink-gate: hold limit of ${max_hold}s reached; stopped $1" >&2; return 124; }
    timeout -k 30 "$left" "$@" </dev/null
  }
  reap_leftovers() { :; }
  mkdir -p "$dir" || exit 75
  git clone --quiet --no-checkout --filter=blob:none "$(fetch_url "$repo_url")" "$checkout" || exit 75
  git -C "$checkout" fetch --quiet --filter=blob:none origin "$sha" || exit 75
  base_sha=$(git -C "$checkout" rev-parse origin/HEAD 2>/dev/null)
  sparse_apply "$checkout" "$sha" || exit $?
  git -C "$checkout" checkout --quiet --detach "$sha" || exit $?
  [ "$(git -C "$checkout" rev-parse HEAD)" = "${sha,,}" ] || die "checkout SHA mismatch"
  cd "$checkout" || exit $?
  prepare_gate_dependencies || exit $?
  gate_command_argv "${command[@]}"
  echo "beelink-gate: running ${display% } on $GTR_HOST" >&2
  step "${command_with_umask[@]}"
}

gtr_write_receipt() {  # <status> <ran_s> <clone bytes> <base sha> <command>
  echo "beelink-gate receipt: sha=$sha install=$install_mode command=$5 exit=$1 duration=$2s host=$GTR_HOST class=normal gtr_bytes=$3 gate_id=$gate_id" >&2
  mkdir -p "$STATE_DIR" && python3 - "$STATE_DIR/receipts.jsonl" "$host/$owner/$repo" "$sha" "$install_mode" "$5" "$1" "$2" "$3" "$4" "$gate_id" <<'PY'
import fcntl, json, os, sys, time
path, repo, sha, mode, command, status, ran, size, base, gate_id = sys.argv[1:]
pr = os.environ.get("BEELINK_GATE_PR", "")
row = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "host": "drew-gtr-pro", "repo": repo, "sha": sha,
       "mode": mode, "command": command, "exit": int(status), "waited_s": int(os.environ.get("BEELINK_GATE_PLACED_WAIT") or 0),
       "ran_s": int(ran), "class": "normal", "gate_id": gate_id, "base_sha": base or None,
       "pr_number": int(pr) if pr.isdigit() else None, "lane": os.environ.get("BEELINK_GATE_LANE") or None,
       "gtr_bytes": int(size), "checkout_temperature": "cold"}
with open(path, "a") as out:
    fcntl.flock(out, fcntl.LOCK_EX)
    out.write(json.dumps(row) + "\n")
PY
}
