#!/usr/bin/env bash
# Owned gate-cache reclamation; sourced locally and bundled for remote gates.
# Cache directories are owned by this command. A global lock serializes size
# decisions; per-repo locks keep active gates out of the eviction set.
# shellcheck disable=SC2154 # State is initialized by the parent remote_gate.
# One private helper for pool layout, validation and managed-consumer lifetime.
# Empty gate-ID markers outlive a killed Bash owner: only the kernel unit's
# absence or populated=0 permits reclamation, never a missing PID or free flock.
gate_turbo_cache_python=$(cat <<'PYTURBOCACHE'
import hashlib
import os
from pathlib import Path
import re
import stat

def turbo_directory(path, create=False):
    if create:
        try:
            path.mkdir(mode=0o700)
        except FileExistsError:
            pass
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o022:
        raise ValueError(f"unsafe shared Turbo directory: {path}")

def turbo_layout(root, identity):
    parts = identity.split('/')
    if len(parts) != 3 or any(not part or part in ('.', '..') or '\\' in part for part in parts):
        raise ValueError('invalid shared Turbo repository identity')
    pool = root / '.turbo' / parts[0] / parts[1] / parts[2] / 'normal'
    key = hashlib.sha256((identity + '/normal').encode()).hexdigest()
    return pool, root / '.locks' / f'turbo-{key}.lock'

def turbo_regular(path, descriptor=None):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o022:
        raise ValueError(f"unsafe shared Turbo metadata: {path}")
    if descriptor is not None:
        opened = os.fstat(descriptor)
        if (info.st_dev, info.st_ino) != (opened.st_dev, opened.st_ino):
            raise ValueError('shared Turbo lock changed')
    return info

def turbo_prepare_lock(root, identity):
    _, lock = turbo_layout(root, identity)
    turbo_directory(root)
    turbo_directory(lock.parent)
    fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        turbo_regular(lock, fd)
    finally:
        os.close(fd)

def turbo_register(root, identity, gate_id, normal_group, descriptor):
    pool, lock = turbo_layout(root, identity)
    turbo_regular(lock, descriptor)
    if not re.fullmatch(r'beelink[12]-[0-9a-f]{32}', gate_id):
        raise ValueError('invalid shared Turbo gate ID')
    expected = str(normal_group / f'beelink-gate-{gate_id}.service')
    joined = Path('/proc/self/cgroup').read_text().strip()
    if joined != '0::' + expected.removeprefix('/sys/fs/cgroup'):
        raise ValueError('shared Turbo requires the actual managed normal unit')
    turbo_directory(root)
    for part in pool.relative_to(root).parts:
        root = root / part
        turbo_directory(root, create=True)
    users = pool / '.users'
    turbo_directory(users, create=True)
    marker = users / gate_id
    try:
        fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        os.close(fd)
    except FileExistsError:
        pass
    if turbo_regular(marker).st_size:
        raise ValueError('shared Turbo consumer marker must be empty')
    turbo_idle(pool, normal_group, clean=True)
    used = pool / 'beelink-gate-used'
    fd = os.open(used, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        turbo_regular(used, fd)
        os.utime(fd, None)
    finally:
        os.close(fd)
    return pool

def turbo_idle(pool, normal_group, clean=False):
    try:
        turbo_directory(pool)
        users = pool / '.users'
        turbo_directory(users)
        # A missing class root is incomplete visibility, not an empty unit.
        if normal_group.is_symlink() or not normal_group.is_dir():
            return False
        stale, idle = [], True
        for marker in users.iterdir():
            if not re.fullmatch(r'beelink[12]-[0-9a-f]{32}', marker.name) or turbo_regular(marker).st_size:
                return False
            unit = normal_group / f'beelink-gate-{marker.name}.service'
            try:
                if unit.is_symlink():
                    return False
                with (unit / 'cgroup.events').open() as stream:
                    events = stream.read(4097)
                values = [line.split()[1:] for line in events.splitlines() if line.split()[:1] == ['populated']]
                if len(events) <= 4096 and values == [['1']]:
                    idle = False
                    continue
                if len(events) > 4096 or values != [['0']]:
                    return False
            except FileNotFoundError:
                if os.path.lexists(unit):
                    return False
            stale.append(marker)
        if clean:
            for marker in stale:
                marker.unlink(missing_ok=True)
        return idle
    except (OSError, ValueError):
        return False  # Unreadable/unsafe unit or marker keeps the entire pool.

def turbo_pools(root):
    base = root / '.turbo'
    if not base.exists():
        return
    turbo_directory(base)
    for host in base.iterdir():
        turbo_directory(host)
        for owner in host.iterdir():
            turbo_directory(owner)
            for repo in owner.iterdir():
                try:
                    turbo_directory(repo)
                    pool, lock = turbo_layout(root, '/'.join((host.name, owner.name, repo.name)))
                    turbo_directory(pool)
                    used = pool / 'beelink-gate-used'
                    stamp = turbo_regular(used).st_mtime_ns
                    yield stamp, pool, lock
                except (OSError, ValueError):
                    # A newly registering or incomplete pool is still in the
                    # root du, but cannot yet be an eviction candidate.
                    continue

def turbo_idle_paths(root, normal_group):
    import fcntl
    for _, pool, lock in turbo_pools(root):
        fd = os.open(lock, os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            turbo_regular(lock, fd)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                continue
            if turbo_idle(pool, normal_group):
                print(str(pool), end='\0')
        finally:
            os.close(fd)
PYTURBOCACHE
)

prepare_gate_turbo_cache() {
  # Development, light and no-install outputs retain their private namespace.
  [ "$install_mode" = install ] && [ "${dev:-0}" = 0 ] && [ "${light:-0}" = 0 ] && [ -z "${TURBO_CACHE_DIR:-}" ] || return 0
  [ "${BEELINK_GATE_SYSTEMD_MANAGER:-}" = system ] && [ -n "${gate_cgroup_joined:-}" ] || return 0
  local pool lease normal_group left
  normal_group=$(dev=0 BEELINK_GATE_CLASS='' gate_cgroup) || return 75
  IFS=$'\t' read -r pool lease < <(python3 -c "$gate_turbo_cache_python"$'\n''import sys; root=Path(sys.argv[1]); turbo_prepare_lock(root, sys.argv[2]); print(*turbo_layout(root, sys.argv[2]), sep="\t")' "$cache_root" "$host/$owner/$repo")
  [ -n "$pool" ] && [ -n "$lease" ] && [ ! -L "$lease" ] || return 75
  exec {gate_turbo_fd}>>"$lease" || return 75
  left=$((deadline - SECONDS))
  if (( left <= 0 )) || ! flock -w "$left" -s "$gate_turbo_fd" ||
    ! python3 -c "$gate_turbo_cache_python"$'\n''import sys; turbo_register(Path(sys.argv[1]), sys.argv[2], sys.argv[3], Path(sys.argv[4]), int(sys.argv[5]))' "$cache_root" "$host/$owner/$repo" "$gate_id" "$normal_group" "$gate_turbo_fd"; then
    exec {gate_turbo_fd}>&-
    gate_turbo_fd=""
    return 75
  fi
  gate_turbo_root=$pool
  package_stores+=("$gate_turbo_root")
}

gate_turbo_node_cache() {
  python3 -c "$gate_turbo_cache_python"$'\n''import sys; root=Path(sys.argv[1]); turbo_directory(root); path=root/sys.argv[2]; turbo_directory(path, create=True); print(path)' "$gate_turbo_root" "$1"
}

release_gate_turbo_cache() {
  [ -z "${gate_turbo_fd:-}" ] || {
    touch "$gate_turbo_root/beelink-gate-used" || true
    # LOCK_UN would also unlock inherited descriptors. Close only this copy;
    # the persistent unit marker remains authoritative after an owner death.
    exec {gate_turbo_fd}>&-
    gate_turbo_fd=""
  }
}

prune_cache() {
  BEELINK_GATE_TIMING_FILE="${timing_file:-}" BEELINK_GATE_TIMING_PHASE="${timing_phase:-precheck}" \
    python3 - "$1" "$2" "$3" "${4:-0}" "$(declare -f sparse_normalize sparse_apply)" "$gate_turbo_cache_python" "$(dev=0 BEELINK_GATE_CLASS='' gate_cgroup)" <<'PY'
import contextlib
import fcntl
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

root, current, cap, required_reclaim = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
sparse_code = sys.argv[5]
exec(sys.argv[6])  # The same private pool/marker owner used by admission.
normal_group = Path(sys.argv[7])
locks = root / ".locks"
size_scans = 0
removal_deadline = None

def wait_capacity_lock(fd, path, deadline):
    announced = False
    while True:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return
        except BlockingIOError:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"timed out waiting for capacity lock {path}")
            if not announced:
                print(f"beelink-gate: waiting up to {remaining:.1f}s for capacity lock {path}", file=sys.stderr)
                announced = True
            time.sleep(min(0.1, remaining))

@contextlib.contextmanager
def writer_intent():
    # Advertise only the brief namespace change, never scans or recursive work.
    writer_fd = os.open(locks / ".capacity.writer.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    intent = locks / ".capacity.writer.intent"
    try:
        wait_seconds = int(os.environ.get("BEELINK_GATE_CAPACITY_INTENT_WAIT_SECONDS", "120"))
        if not 1 <= wait_seconds <= 120:
            raise ValueError("invalid BEELINK_GATE_CAPACITY_INTENT_WAIT_SECONDS (1..120)")
        deadline = time.monotonic() + wait_seconds
        wait_capacity_lock(writer_fd, locks / ".capacity.writer.lock", deadline)
        # The writer lock, not a PID or clock lease, proves an intent is live.
        # A process death releases it, so the next writer can clear the marker.
        intent.unlink(missing_ok=True)
        marker_fd = os.open(intent, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        os.close(marker_fd)
        try:
            yield deadline
        finally:
            intent.unlink(missing_ok=True)
    finally:
        os.close(writer_fd)

def size(path):
    global size_scans
    size_scans += 1
    result = subprocess.run(
        ["du", "-s", "-B1", "--", str(path)],
        text=True, capture_output=True, env={**os.environ, "LC_ALL": "C"},
    )
    warnings = result.stderr.splitlines()
    # Other repo gates can remove node_modules entries during this scan. GNU du
    # still prints a total; only that expected race may use its partial result.
    if result.returncode and not (
        result.returncode == 1 and warnings and all(
            line.startswith("du: cannot access ") and line.endswith(": No such file or directory")
            for line in warnings
        )
    ):
        raise OSError(f"du {path}: {result.stderr.strip() or f'exit {result.returncode}'}")
    fields = result.stdout.split()
    if not fields:
        raise OSError(f"du {path}: no size result")
    return int(fields[0])

def free_bytes(path):
    stat = os.statvfs(path)
    return stat.f_bavail * stat.f_frsize

def remove(path):
    # One pass budget covers all detached removals, including pending retries.
    # No writer, capacity or candidate repo lock is held during recursive work.
    global removal_deadline
    started = time.monotonic()
    if removal_deadline is None:
        removal_deadline = started + 60
    remaining = removal_deadline - started
    # GNU timeout treats a duration rounded to zero as no deadline.
    if remaining < 0.001:
        raise TimeoutError(f"cache removal budget exhausted before {path}")
    result = subprocess.run(
        ["timeout", "--verbose", "-s", "KILL", f"{remaining:.3f}s", "rm", "-rf", "--", str(path)],
        stdin=subprocess.DEVNULL, text=True, capture_output=True,
        env={**os.environ, "LC_ALL": "C"},
    )
    elapsed = time.monotonic() - started
    sys.stderr.write(result.stderr)
    outcome = ("owner-deadline" if "timeout: sending signal KILL" in result.stderr else
               "unexpected-sigkill" if result.returncode == -9 else
               "completed" if result.returncode == 0 else "unexpected-exit")
    print(f"beelink-gate: detached cache removal {path}: outcome={outcome} "
          f"elapsed={elapsed:.3f}s budget_remaining_before={remaining:.3f}s exit={result.returncode}",
          file=sys.stderr)
    if result.returncode:
        raise OSError(f"bounded cache removal {path}: {outcome}, exit {result.returncode}")

try:
    for pending in locks.glob(".evicted-*"):
        if pending.is_dir() and not pending.is_symlink():
            remove(pending)
    with (locks / ".capacity.lock").open("a+") as global_lock:
        lock_wait_start = time.monotonic_ns()
        # Sizing and sparse work share capacity with new checkout claims.
        fcntl.flock(global_lock, fcntl.LOCK_SH)
        lock_acquired = time.monotonic_ns()
        candidates = []
        for host in root.iterdir():
            if host.name in (".locks", ".turbo") or host.is_symlink() or not host.is_dir():
                continue
            for owner in host.iterdir():
                if owner.is_symlink() or not owner.is_dir():
                    continue
                for repo in owner.iterdir():
                    git_dir = repo / ".git"
                    if repo.is_symlink() or not repo.is_dir() or git_dir.is_symlink() or not git_dir.is_dir():
                        continue
                    used = git_dir / "beelink-gate-used"
                    stamp = used if used.is_file() and not used.is_symlink() else git_dir / "FETCH_HEAD"
                    if not stamp.exists() or stamp.is_symlink():
                        stamp = git_dir
                    candidates.append((stamp.stat().st_mtime_ns, repo, locks / f"{host.name}-{owner.name}-{repo.name}.lock", False))
        candidates.extend((stamp, pool, lock, True) for stamp, pool, lock in turbo_pools(root))
        # Size after sparse maintenance, once. A second identical tree walk
        # without a mutation costs CPU/IO but proves no stronger capacity bound.
        initial_total = None
        initial_free = free_bytes(root)
        target_free = initial_free + required_reclaim
        # An idle checkout first shrinks to the sparse patterns its HEAD commits: those
        # are paths no gated command reads, and the checkout stays warm for the
        # next gate. LRU eviction then weighs what remains.
        sparsified = False
        for stamp_ns, repo, lock_path, shared in candidates:
            if shared:
                continue  # Archives have no Git sparse-checkout work.
            fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            try:
                if repo != current:
                    try:
                        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError:
                        continue
                result = subprocess.run(
                    ["bash", "-c", sparse_code + '\nsparse_apply "$@"', "beelink-gate", str(repo), "HEAD", "--shrink-only"],
                    text=True, capture_output=True, stdin=subprocess.DEVNULL,
                )
                # sparse_apply writes to stderr only when it changes the checkout.
                sys.stderr.write(result.stderr)
                if result.returncode:
                    print(f"beelink-gate: sparse patterns not applied to idle cache {repo} (exit {result.returncode})", file=sys.stderr)
                elif result.stderr:
                    sparsified = True
                    print(f"beelink-gate: sparse patterns applied to idle cache {repo}", file=sys.stderr)
            finally:
                os.close(fd)
        total = size(root)
        fcntl.flock(global_lock, fcntl.LOCK_UN)
        evictions = 0
        for stamp_ns, repo, lock_path, shared in sorted(candidates):
            if total <= cap and (not required_reclaim or free_bytes(root) >= target_free):
                break
            # Wait without taking a candidate repo lock. Writer intent stops
            # new shared claimers while existing readers finish their snapshots.
            with writer_intent() as deadline:
                wait_capacity_lock(global_lock, locks / ".capacity.lock", deadline)
                try:
                    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | (os.O_NONBLOCK if shared else 0), 0o600)
                    try:
                        if shared or repo != current:
                            try:
                                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                            except BlockingIOError:
                                continue
                        if shared:
                            turbo_regular(lock_path, fd)
                            if not turbo_idle(repo, normal_group, clean=True):
                                print(f"beelink-gate: keeping shared Turbo pool {repo}: managed consumer active or unknown", file=sys.stderr)
                                continue
                            used = repo / "beelink-gate-used"
                        else:
                            git_dir = repo / ".git"
                            if repo.is_symlink() or git_dir.is_symlink() or not git_dir.is_dir():
                                continue
                            used = git_dir / "beelink-gate-used"
                        if used.is_file() and used.stat().st_mtime_ns > stamp_ns:
                            continue  # Used since the shared snapshot; no longer LRU.
                        removed = locks / f".evicted-{uuid.uuid4().hex}"
                        repo.rename(removed)
                    finally:
                        os.close(fd)
                finally:
                    fcntl.flock(global_lock, fcntl.LOCK_UN)
            remove(removed)
            evictions += 1
            print(f"beelink-gate: evicted LRU cache {repo}", file=sys.stderr)
            fcntl.flock(global_lock, fcntl.LOCK_SH)
            total = size(root)
            fcntl.flock(global_lock, fcntl.LOCK_UN)
        fcntl.flock(global_lock, fcntl.LOCK_SH)
        final_free = free_bytes(root)
        reclaimed = max(0, final_free - initial_free)
        if evictions or sparsified or required_reclaim or total > cap:
            print(
                f"beelink-gate: cache prune: cache_before={initial_total} cache_after={total} "
                f"free_before={initial_free} free_after={final_free}",
                file=sys.stderr,
            )
        if total > cap:
            print(f"beelink-gate: cache cap exceeded: {total} > {cap} bytes; active checkouts cannot be evicted", file=sys.stderr)
            sys.exit(3)
        if reclaimed < required_reclaim:
            print(f"beelink-gate: cache reclaimed {reclaimed} of {required_reclaim} needed bytes; active checkouts or other disk users need the host owner", file=sys.stderr)
            sys.exit(3)
except (OSError, ValueError) as exc:
    print(f"beelink-gate: cache prune failed: {exc}", file=sys.stderr)
    sys.exit(3)
finally:
    timing_file = os.environ.get("BEELINK_GATE_TIMING_FILE")
    if timing_file and "lock_acquired" in locals():
        try:
            with open(timing_file, "a", encoding="utf-8") as timing:
                timing.write(
                    f"{os.environ.get('BEELINK_GATE_TIMING_PHASE', 'precheck')} "
                    f"{(lock_acquired - lock_wait_start) // 1_000_000} "
                    f"{(time.monotonic_ns() - lock_acquired) // 1_000_000}\n"
                )
                timing.write(f"cache_scans {os.environ.get('BEELINK_GATE_TIMING_PHASE', 'precheck')} {size_scans}\n")
        except OSError:
            pass  # Measurement must not change the gate result.
PY
}

# A .beelink-gate/sparse-checkout file's patterns, without comments, blank
# lines or trailing spaces (stdin to stdout).
sparse_normalize() { sed -e 's/[[:space:]]*$//' -e '/^#/d' -e '/^$/d'; }

# The checkout shape an install reserve was measured on: full, or sha256 of
# the normalized patterns of the .beelink-gate/sparse-checkout read on stdin.
sparse_spec_of() {
  local want
  want=$(sparse_normalize)
  if [ -z "$want" ]; then
    echo full
  else
    printf '%s\n' "$want" | python3 -c 'import hashlib, sys; print("sha256:" + hashlib.sha256(sys.stdin.buffer.read()).hexdigest())'
  fi
}

# A repo keeps tracked paths its gated commands never read out of its gate
# checkouts by committing .beelink-gate/sparse-checkout: `git sparse-checkout
# --no-cone` patterns, one per line, # for comments. Discovery Lab's excludes
# historical /pursuits/: its full gate checkout held 11 GB on
# beelink1, and its 22-28 GB measured install reserve kept Lab gates off both
# beelinks. A commit without the file, or with no patterns in it, gets a full
# checkout. This keeps <checkout> at the patterns committed at <rev>, the
# commit it is about to check out (an idle checkout passes HEAD); the caller
# holds the checkout's repo lock. Setting patterns removes the excluded
# tracked files now, and later checkouts never write them. The cache prune
# passes --shrink-only: it never restores a full tree, which would write
# gigabytes in the step that frees disk (an idle Lab checkout at
# a commit older than its file was rewritten with 4.7 GB of pursuits/). Sets
# sparse_source to repo or empty, and says on stderr when it changed the
# checkout.
sparse_apply() {  # <checkout> <rev> [--shrink-only]
  local want enabled
  want=$(git -C "$1" cat-file blob "$2:.beelink-gate/sparse-checkout" 2>/dev/null | sparse_normalize)
  enabled=$(git -C "$1" config --bool core.sparseCheckout)
  sparse_source=${want:+repo}
  if [ -z "$want" ]; then
    [ "$enabled" = true ] && [ "${3:-}" != --shrink-only ] || return 0
    echo "beelink-gate: $1 has no sparse patterns at $2; restoring its full tree" >&2
    git -C "$1" sparse-checkout disable
  elif [ "$enabled" != true ] || [ "$want" != "$(cat "$1/.git/info/sparse-checkout" 2>/dev/null)" ]; then
    echo "beelink-gate: applying repo sparse patterns to $1: $(printf '%s' "$want" | tr '\n' ' ')" >&2
    printf '%s\n' "$want" | git -C "$1" sparse-checkout set --no-cone --stdin
  fi
}


# A writer holds the fd lock for its brief intent and rename. If it dies,
# flock releases that lock; a claimant can then remove its abandoned marker.



# Lanes may point CARGO_TARGET_DIR at ~/.cache/<repo>-build, outside the capped
# cache. Sweep entries of those cargo target dirs (CACHEDIR.TAG) untouched for
# 24 h. Each sweep holds every gate lock for <repo> and cargo's own profile
# locks, so no gate or cargo build is using the files it removes; a removed
# artifact only costs a rebuild. Failure is reported but never fails a gate.
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
cutoff = time.time() - max_age
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

try:
    with (locks / ".build-prune.lock").open("a+") as sweep_lock:
        try:
            fcntl.flock(sweep_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            sys.exit(0)
        for target in sorted(build_root.glob("*-build")):
            tag = target / "CACHEDIR.TAG"
            if target.is_symlink() or not target.is_dir() or tag.is_symlink() or not tag.is_file():
                continue
            with tag.open() as tagfile:
                if not tagfile.read(len(TAG)) == TAG:
                    continue
            repo = target.name[:-len("-build")]
            held = []
            try:
                busy = [lock for lock in sorted([*locks.glob(f"*-{repo}.lock"), *locks.glob(f"*-{repo}@*.lock")])
                        if lock != current_lock and not try_lock(lock, held)]
                if busy:
                    print(f"beelink-gate: skipped {target}; a {repo} gate holds its lock", file=sys.stderr)
                    continue
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

# The fixed 10 GiB pre-install headroom is the safe fallback for a repo with
# no receipt yet. Later receipts include that headroom plus bytes consumed
# between admission and the install check (fetch, checkout and install), the
# checkout shape they measured (sparse_spec: full or a pattern digest) and its
# temperature (checkout_temperature: warm when the checkout already had that
# shape, cold when the gate cloned it, reshaped otherwise). A reserve measured
# on another shape says nothing about this one: beelink2's newest
# Lab receipt was a 28.2 GB full clone, which refused every sparse Lab gate, so
# none could write a sparse receipt. A cold clone's cost says little about a
# warm checkout: beelink2's 15.58 GB cold sparse clone then refused its own warm
# checkout at 226 GB free.
# With the gated commit's shape known (<spec>), a cold gate uses this host's
# newest cold receipt of that shape, else the other beelink's (<peer-cold>),
# else the headroom. A warm gate uses this host's newest warm receipt of that
# shape, else the other beelink's (<peer-warm>), else the cold value. With the
# shape unknown, use this host's newest receipt, as before. Receipts from before
# temperatures count as cold. A malformed receipt never counts, and an older one
# never overrides a newer one. match-only prints this host's newest cold and
# warm values for the shape, for the other beelink.
last_install_reserve_bytes() {  # <beelink> <host/owner/repo> <mode> [<spec> <peer-cold> <peer-warm> <warm|cold> [match-only]]
  local beelink="$1" repo_key="$2" mode="$3"
  case "$mode" in install|ship|dev) ;; *) echo 0; return ;; esac
  python3 - "$STATE_DIR/receipts.jsonl" "$beelink" "$repo_key" "${4:-}" "${5:-}" "${6:-}" "${7:-cold}" "${8:-}" <<'PY'
import json
import mmap
import os
import re
import sys

path, host, repo, spec, peer_cold, peer_warm, temperature, match_only = sys.argv[1:]
fallback = 10 * 1024 ** 3
SPEC = re.compile(r"full|sha256:[0-9a-f]{64}")
spec = spec if SPEC.fullmatch(spec) else ""
warm = temperature == "warm"

def measured(value):
    return type(value) is int and fallback <= value <= 1024 ** 4

def peer(value):
    return int(value) if value.isdigit() and measured(int(value)) else None

def shape(row):
    # Receipts from before sparse_spec: one with sparse patterns measured
    # unknown patterns; every other one measured a full checkout.
    if "sparse_spec" not in row:
        return None if row.get("sparse") else "full"
    value = row["sparse_spec"]
    return value if isinstance(value, str) and SPEC.fullmatch(value) else None

def heat(row):
    # Receipts from before temperatures count as cold, the costlier case.
    if "checkout_temperature" not in row:
        return "cold"
    value = row["checkout_temperature"]
    return value if value in ("warm", "cold", "reshaped") else None

def answer(value, source):
    print(f"beelink-gate: install reserve {value} bytes from {source}", file=sys.stderr)
    print(value)
    sys.exit(0)

newest = {}
try:
    with open(path, "rb") as receipts:
        if os.fstat(receipts.fileno()).st_size:
            with mmap.mmap(receipts.fileno(), 0, access=mmap.ACCESS_READ) as data:
                pos = len(data)
                for _ in range(10000):
                    if pos == 0 or len(newest) == 2:
                        break
                    if data[pos - 1:pos] == b"\n":
                        pos -= 1
                    start = data.rfind(b"\n", 0, pos) + 1
                    line, pos = data[start:pos], start
                    try:
                        row = json.loads(line)
                    except ValueError:
                        continue
                    if not isinstance(row, dict) or row.get("host") != host or row.get("repo") != repo:
                        continue
                    value = row.get("install_reserve_bytes")
                    if not measured(value):
                        continue
                    if not spec and not match_only:
                        answer(value, f"{host}'s newest receipt (checkout shape unknown)")
                    if shape(row) == spec and heat(row) in ("warm", "cold"):
                        newest.setdefault(heat(row), value)
except FileNotFoundError:
    pass
if match_only:
    for kind in ("cold", "warm"):
        if kind in newest:
            print(f"{kind} {newest[kind]}")
    sys.exit(0)
if warm and "warm" in newest:
    answer(newest["warm"], f"{host}'s newest warm receipt for checkout shape {spec}")
if warm and peer(peer_warm):
    answer(peer(peer_warm), f"the other beelink's newest warm receipt for checkout shape {spec}")
note = "; a warm checkout pays it until a beelink has a warm receipt of its shape" if warm else ""
if "cold" in newest:
    answer(newest["cold"], f"{host}'s newest cold receipt for checkout shape {spec}{note}")
if peer(peer_cold):
    answer(peer(peer_cold), f"the other beelink's newest cold receipt for checkout shape {spec}{note}")
answer(fallback, f"the 10 GiB headroom (no receipt for checkout shape {spec}){note}")
PY
}

# The bytes a gate owns on disk: its checkout and the package stores its install
# writes, in one du, so a node_modules file hardlinked into the store counts once.
# On beelink1 at load 12-16 the Lab checkout and the 15 GiB pnpm store (486,018
# files) took 1.1-2.7 s. Prints nothing when du fails, warns about anything but a
# file that vanished mid-scan, or runs past <seconds> (the caller passes 60 s or the
# gate's remaining hold, whichever is less, so a scan never holds the lock past it).
gate_bytes() {  # <seconds> <checkout> <store>...
  local limit=$1
  shift
  (( limit > 0 )) || return 1
  gate_disk scan "${disk_dir:-}" "${disk_snapshot_phase:-before}" "$limit" "$@"
}

# The shape a cached checkout has now: full, or the digest of its applied
# patterns. Fails when there is no checkout.
checkout_shape() {  # <checkout>
  [ -d "$1/.git" ] || return 1
  if [ "$(git -C "$1" config --bool core.sparseCheckout)" = true ]; then
    sparse_spec_of < "$1/.git/info/sparse-checkout"
  else
    echo full
  fi
}

# Before a gate holds a checkout lock it cannot know which copy it gets, so the
# probe and the first admission check assume warm when any copy of the repo has
# the gated commit's shape. Only the check after the lock is binding.
any_copy_warm() {  # <repo cache dir> <spec>
  local copy
  [ -n "$2" ] || return 1
  for copy in "$1" "$1"@*; do
    [ "$(checkout_shape "$copy" 2>/dev/null)" != "$2" ] || return 0
  done
  return 1
}

# The cache is keyed by host/owner/repo, so any spelling of that repo (https or
# SSH, with or without .git) owns it; a different repo in that path is refused.
# The checkout keeps the origin it was created with: that transport has already
# fetched on this host, while the caller's spelling may need credentials the
# beelink does not have (an https URL without a token prompts and hangs).
adopt_origin() {
  local checkout=$1 url=$2 origin origin_key
  # The recorded URL, not `remote get-url`, which applies url.*.insteadOf rewrites.
  origin=$(git -C "$checkout" config --get remote.origin.url) || return $?
  origin_key=$(parse_repo_url "$origin" 2>/dev/null && printf '%s/%s/%s' "$host" "$owner" "$repo")
  [ "$origin_key" = "$host/$owner/$repo" ] || die "cache origin mismatch at $checkout: $origin is not $url"
  # A GitHub cache fetches over SSH, the transport the beelinks hold a key for;
  # an https origin left by an earlier gate is moved to it.
  if [ "$origin" != "$(fetch_url "$url")" ] && [ "$host" = github.com ]; then
    git -C "$checkout" remote set-url origin "$(fetch_url "$url")" || return $?
  fi
}

# The URL a cache fetches from. The beelinks have an SSH key for GitHub and no
# https credentials, so https://github.com/<owner>/<repo> is fetched as
# git@github.com:<owner>/<repo>.git: a cold tangle-tools cache
# cloned from the https spelling failed with "could not read Username".
fetch_url() {
  if [ "$host" = github.com ]; then echo "git@github.com:$owner/$repo.git"; else echo "$1"; fi
}
