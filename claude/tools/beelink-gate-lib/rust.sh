#!/usr/bin/env bash
# Rust build caching for gates: cargo target dirs, keyed holds, their sweep and
# the per-gate sccache server. Sourced by beelink-gate and embedded into every
# submitted script.
# shellcheck disable=SC2154 # State is initialized by the parent remote_gate.

# A --cargo-key names one cargo target dir that a run's gates share on a host.
# No leading dot, so a key never names the .holds directory, `.` or `..`.
valid_cargo_key() { [[ "$1" =~ ^[A-Za-z0-9_-][A-Za-z0-9._-]{0,95}$ ]]; }

# The key's target dir for <host>/<owner>/<repo> (the caller's parse_repo_url
# globals), under ~/.cache beside the lanes' <repo>-build dirs, outside the
# capped gate cache; prune_build_dirs sweeps both.
cargo_key_dir() {  # <key>
  printf '%s/%s/%s/%s-build/%s\n' "${XDG_CACHE_HOME:-$HOME/.cache}" "$host" "$owner" "$repo" "$1"
}

# For the probe: with BEELINK_GATE_CARGO_KEY set, a checkout is warm only when
# this host also holds that key's target dir, so `auto` routes a key's builds
# to the beelink with its warm target and falls over cold to the other one.
cargo_key_warm() {
  local key=${BEELINK_GATE_CARGO_KEY:-} target
  [ -n "$key" ] || return 0
  valid_cargo_key "$key" || return 1
  target=$(cargo_key_dir "$key")
  [ -d "$target" ] && [ ! -L "$target" ]
}

# Every sccache call runs without the gate's lock, slot, lease and heartbeat
# descriptors: --start-server forks the server, and a server holding them would
# keep the checkout locked after the gate ends.
sccache_call() {
  (
    for gate_fd in ${lock_fd:-} ${slot_fd:-} ${capacity_fd:-} ${writer_fd:-} ${gate_turbo_fd:-} ${heartbeat_fd:-}; do
      exec {gate_fd}>&-
    done
    exec timeout -k 5 60 "$gate_sccache" "$@"
  ) </dev/null
}

# Exports the command's Rust settings; a command that sets its own keeps them.
# Without a key, output lives inside .git, which checkout and clean leave alone,
# so it survives between gates and the LRU cap counts and evicts it with its
# repo. With BEELINK_GATE_CARGO_KEY (--cargo-key) it lives in that key's target
# dir, whose hold (BEELINK_GATE_CARGO_HOLD_SECONDS, default 7 days) every gate
# with the key renews; prune_build_dirs keeps it until the hold expires.
# A checkout that tracks a Cargo.toml then compiles through this gate's own
# sccache server when sccache is installed (host/install.sh pins it).
gate_rust_begin() {
  local hold=${BEELINK_GATE_CARGO_HOLD_SECONDS:-604800} target="" holds bin size shift_by=0 err
  gate_cargo_key=${BEELINK_GATE_CARGO_KEY:-} gate_sccache="" sccache_note=none
  unset BEELINK_GATE_CARGO_KEY BEELINK_GATE_CARGO_HOLD_SECONDS BEELINK_GATE_RUST_RECEIPT
  [[ "$hold" =~ ^[1-9][0-9]{0,8}$ ]] || die "invalid BEELINK_GATE_CARGO_HOLD_SECONDS: $hold"
  if [ -n "$gate_cargo_key" ]; then
    valid_cargo_key "$gate_cargo_key" || die "invalid cargo key: $gate_cargo_key"
    target=$(cargo_key_dir "$gate_cargo_key"); holds="${target%/*}/.holds"
    mkdir -p "$target" "$holds" || die "cannot create cargo target dir $target"
    # Cargo writes the same tag on its first build; the sweep needs it before then.
    [ -e "$target/CACHEDIR.TAG" ] || printf 'Signature: 8a477f597d28d172789f06886806bc55\n# This file is a cache directory tag created by cargo.\n' > "$target/CACHEDIR.TAG"
    printf '%s\n' "$(( $(date +%s) + hold ))" > "$holds/.$gate_cargo_key.$$" && mv -f "$holds/.$gate_cargo_key.$$" "$holds/$gate_cargo_key" \
      || die "cannot write the hold for cargo key $gate_cargo_key"
    echo "beelink-gate: cargo key $gate_cargo_key builds in $target, held ${hold}s past this gate" >&2
    export CARGO_TARGET_DIR="$target"
  else
    export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$checkout/.git/beelink-gate-target}"
  fi
  export CARGO_INCREMENTAL="${CARGO_INCREMENTAL:-0}"

  # One sccache server per gate, on an abstract Unix socket named by the gate.
  # Each gate's systemd unit stops its whole cgroup at gate end, so a server
  # shared by gates would die with the gate that started it, mid-build for the
  # rest; a TCP port from the slot number collides through the shared overflow
  # slot and with a server a killed gate left. An abstract socket has no file to
  # clean up and a name no other gate uses, and the idle timeout bounds a server
  # outside a managed unit. All servers share one disk cache in the gate cache
  # root, so hits carry across gates and both checkout copies (SCCACHE_BASEDIRS).
  # prune_cache counts it toward BEELINK_GATE_CACHE_MAX_BYTES and never deletes
  # in it; SCCACHE_CACHE_SIZE (default a quarter of that cap, at most half) bounds it.
  [ -n "$(git -C "$checkout" ls-files -- ':(glob)**/Cargo.toml' | head -n 1)" ] || return 0
  if [ -n "${RUSTC_WRAPPER:-}" ]; then sccache_note=caller; return 0; fi
  bin=$(command -v sccache) || bin=/usr/local/bin/sccache
  [ -x "$bin" ] || { sccache_note=missing; echo "beelink-gate: sccache is not installed on $beelink; Rust compiles uncached (host/install.sh installs it)" >&2; return 0; }
  size=${SCCACHE_CACHE_SIZE:-$(( cache_max / 4 ))}
  [[ "$size" =~ ^([1-9][0-9]{0,17})([KkMmGgTt]?)$ ]] || die "invalid SCCACHE_CACHE_SIZE: $size"
  case "${BASH_REMATCH[2],,}" in k) shift_by=10 ;; m) shift_by=20 ;; g) shift_by=30 ;; t) shift_by=40 ;; esac
  (( ${BASH_REMATCH[1]} <= (cache_max / 2) >> shift_by )) || die "SCCACHE_CACHE_SIZE $size is over half the $cache_max-byte gate cache cap"
  mkdir -p "$cache_root/.sccache" || die "cannot create $cache_root/.sccache"
  gate_sccache=$bin
  export RUSTC_WRAPPER="$bin" SCCACHE_DIR="$cache_root/.sccache" SCCACHE_CACHE_SIZE="$size" \
    SCCACHE_SERVER_UDS="\\x00beelink-gate-sccache-${gate_id:-$run_token}" SCCACHE_IDLE_TIMEOUT=$(( max_hold + 300 )) \
    SCCACHE_BASEDIRS="$checkout${target:+:$target}"
  err=$(mktemp) || err=/dev/null
  if sccache_call --start-server >/dev/null 2>"$err"; then
    sccache_note=on
    echo "beelink-gate: sccache $("$bin" --version 2>/dev/null | cut -d' ' -f2) server for this gate, cache $SCCACHE_DIR (cap $size)" >&2
  else
    echo "beelink-gate: sccache server did not start ($(tr '\n' ' ' < "$err" | cut -c1-200)); Rust compiles uncached" >&2
    unset RUSTC_WRAPPER SCCACHE_DIR SCCACHE_CACHE_SIZE SCCACHE_SERVER_UDS SCCACHE_IDLE_TIMEOUT SCCACHE_BASEDIRS
    gate_sccache="" sccache_note=unavailable
  fi
  [ "$err" = /dev/null ] || rm -f "$err"
}

# From finish: prints this gate's sccache stats on stderr, stops its server,
# and exports BEELINK_GATE_RUST_RECEIPT for the receipt row.
gate_rust_end() {
  local stats=""
  if [ -n "${gate_sccache:-}" ]; then
    stats=$(sccache_call --show-stats --stats-format json 2>/dev/null) || stats=""
    sccache_call --stop-server >/dev/null 2>&1 || echo "beelink-gate: WARNING sccache --stop-server failed; its idle timeout ends it" >&2
    gate_sccache=""
  fi
  BEELINK_GATE_RUST_RECEIPT=$(python3 - "${gate_cargo_key:-}" "${sccache_note:-none}" "$stats" <<'PY'
import json, sys
key, note, raw = sys.argv[1:]
row = {"cargo_key": key or None, "sccache": None if note == "none" else {"state": note}}
if raw:
    try:
        stats = json.loads(raw)["stats"]
        hits, misses = sum(stats["cache_hits"]["counts"].values()), sum(stats["cache_misses"]["counts"].values())
        row["sccache"] = {"state": "on", "compile_requests": stats["compile_requests"], "hits": hits, "misses": misses,
                          "hit_rate": round(hits / (hits + misses), 4) if hits + misses else None,
                          "not_cacheable": stats["requests_not_cacheable"], "errors": sum(stats["cache_errors"]["counts"].values())}
        print(f"beelink-gate: sccache compile_requests={stats['compile_requests']} hits={hits} misses={misses} "
              f"hit_rate={row['sccache']['hit_rate'] if hits + misses else '-'}", file=sys.stderr)
    except (ValueError, KeyError, TypeError, AttributeError):
        row["sccache"] = {"state": "unreadable"}
elif note == "on":
    row["sccache"] = {"state": "unreadable"}
state = row["sccache"] or {"state": "none"}
print(json.dumps(row))
print(f"{state['hits']}/{state['hits'] + state['misses']}" if "hits" in state else state["state"])
PY
)
  sccache_note=${BEELINK_GATE_RUST_RECEIPT#*$'\n'}
  BEELINK_GATE_RUST_RECEIPT=${BEELINK_GATE_RUST_RECEIPT%%$'\n'*}
  export BEELINK_GATE_RUST_RECEIPT
}

# Lanes may point CARGO_TARGET_DIR at ~/.cache/<repo>-build, and --cargo-key
# gates build in ~/.cache/<host>/<owner>/<repo>-build/<key>, both outside the
# capped cache. Sweep entries of those cargo target dirs (CACHEDIR.TAG)
# untouched for 24 h. A keyed target is kept whole while its hold
# (<repo>-build/.holds/<key>, an expiry epoch) is live; once the hold has
# expired and nothing in it was touched for 24 h it is removed with its hold,
# so the probe stops calling it warm. Each sweep holds every gate lock for
# <repo> and cargo's own profile locks, so no gate or cargo build is using the
# files it removes; a removed artifact only costs a rebuild. Failure is
# reported but never fails a gate.
prune_build_dirs() {
  python3 - "$@" <<'PY'
import fcntl
import os
from pathlib import Path
import shutil
import sys
import time

build_root, locks, current_lock = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
max_age = int(sys.argv[4])
now = time.time()
cutoff = now - max_age
TAG = "Signature: 8a477f597d28d172789f06886806bc55"
ARTIFACT_DIRS = ("deps", "build", ".fingerprint", "incremental", "examples")
CARGO_LOCKS = (".cargo-lock", ".cargo-build-lock", ".cargo-artifact-lock")

def try_lock(path, held):
    try:
        fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
    except FileNotFoundError:
        return True
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        return False
    held.append(fd)
    return True

def release(held):
    while held:
        os.close(held.pop())

def newest(path):
    # relatime refreshes atime on a read at most daily; cargo's locks, not
    # this age, are what keep an active build's inputs safe.
    st = path.lstat()
    latest = max(st.st_atime, st.st_mtime)
    if path.is_dir() and not path.is_symlink():
        for parent, dirs, files in os.walk(path):
            for name in dirs + files:
                st = os.lstat(os.path.join(parent, name))
                latest = max(latest, st.st_atime, st.st_mtime)
    return latest

def reclaimable(path):
    if not path.is_dir() or path.is_symlink():
        st = path.lstat()
        return st.st_blocks * 512 if st.st_nlink == 1 else 0
    total = 0
    for parent, _, files in os.walk(path):
        for name in files:
            st = os.lstat(os.path.join(parent, name))
            if st.st_nlink == 1:
                total += st.st_blocks * 512
    return total

def profiles(target):
    # <target>/<profile> and <target>/<triple>/<profile>
    for child in target.iterdir():
        if child.is_symlink() or not child.is_dir():
            continue
        if (child / ".fingerprint").is_dir():
            yield child
            continue
        for grandchild in child.iterdir():
            if not grandchild.is_symlink() and (grandchild / ".fingerprint").is_dir():
                yield grandchild

def tagged(target):
    tag = target / "CACHEDIR.TAG"
    if target.is_symlink() or not target.is_dir() or tag.is_symlink() or not tag.is_file():
        return False
    with tag.open() as tagfile:
        return tagfile.read(len(TAG)) == TAG

def hold_until(hold):
    try:
        return int(hold.read_text().split()[0]) if not hold.is_symlink() else 0
    except (OSError, ValueError, IndexError):
        return 0

def targets():
    # (target, label, repo lock prefix glob, hold marker or None)
    for target in sorted(build_root.glob("*-build")):
        repo = target.name[:-len("-build")]
        yield target, repo, (f"*-{repo}.lock", f"*-{repo}@*.lock"), None
    for repo_dir in sorted(build_root.glob("*/*/*-build")):
        host, owner = repo_dir.parent.parent, repo_dir.parent
        # Only gate-keyed dirs: gate_rust_begin creates <repo>-build/.holds.
        if any(p.is_symlink() or p.name.startswith(".") for p in (host, owner, repo_dir)) or not (repo_dir / ".holds").is_dir():
            continue
        prefix = f"{host.name}-{owner.name}-{repo_dir.name[:-len('-build')]}"
        for target in sorted(repo_dir.iterdir()):
            if not target.name.startswith("."):
                yield target, prefix, (f"{prefix}.lock", f"{prefix}@*.lock"), repo_dir / ".holds" / target.name

try:
    with (locks / ".build-prune.lock").open("a+") as sweep_lock:
        try:
            fcntl.flock(sweep_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            sys.exit(0)
        for target, repo, lock_globs, hold in targets():
            if not tagged(target):
                continue
            if hold is not None and hold_until(hold) > now:
                print(f"beelink-gate: kept cargo target {target}; its key is held until {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(hold_until(hold)))}", file=sys.stderr)
                continue
            held = []
            try:
                busy = [lock for lock in sorted({p for pattern in lock_globs for p in locks.glob(pattern)})
                        if lock != current_lock and not try_lock(lock, held)]
                if busy:
                    print(f"beelink-gate: skipped {target}; a {repo} gate holds its lock", file=sys.stderr)
                    continue
                if hold is not None:
                    # An expired key's target goes whole once no cargo holds it
                    # and nothing in it was touched within max_age.
                    probe_held = []
                    try:
                        if all(try_lock(p / n, probe_held) for p in profiles(target) for n in CARGO_LOCKS) and newest(target) < cutoff:
                            freed = reclaimable(target)
                            shutil.rmtree(target)
                            hold.unlink(missing_ok=True)
                            print(f"beelink-gate: removed {freed} bytes in cargo target {target}; its key's hold expired", file=sys.stderr)
                            continue
                    finally:
                        release(probe_held)
                freed = 0
                for profile in profiles(target):
                    profile_held = []
                    try:
                        if not all(try_lock(profile / name, profile_held) for name in CARGO_LOCKS):
                            print(f"beelink-gate: skipped {profile}; cargo is building there", file=sys.stderr)
                            continue
                        for name in ARTIFACT_DIRS:
                            area = profile / name
                            if area.is_symlink() or not area.is_dir():
                                continue
                            for entry in area.iterdir():
                                if newest(entry) >= cutoff:
                                    continue
                                bytes_used = reclaimable(entry)
                                if entry.is_dir() and not entry.is_symlink():
                                    shutil.rmtree(entry)
                                else:
                                    entry.unlink()
                                freed += bytes_used
                    finally:
                        release(profile_held)
                if freed:
                    print(f"beelink-gate: pruned {freed} bytes of cargo output untouched for {max_age}s from {target}", file=sys.stderr)
            finally:
                release(held)
except OSError as exc:
    print(f"beelink-gate: build cache sweep failed: {exc}", file=sys.stderr)
PY
}
