#!/usr/bin/env bash
# Owned gate-cache reclamation; sourced locally and bundled for remote gates.
# Cache directories are owned by this command. A global lock serializes size
# decisions; per-repo locks keep active gates out of the eviction set.
prune_cache() {
  BEELINK_GATE_TIMING_FILE="${timing_file:-}" BEELINK_GATE_TIMING_PHASE="${timing_phase:-precheck}" \
    python3 - "$1" "$2" "$3" "${4:-0}" "$(declare -f sparse_normalize sparse_apply)" <<'PY'
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
            if host.name == ".locks" or host.is_symlink() or not host.is_dir():
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
                    candidates.append((stamp.stat().st_mtime_ns, repo, host.name, owner.name))
        # Size after sparse maintenance, once. A second identical tree walk
        # without a mutation costs CPU/IO but proves no stronger capacity bound.
        initial_total = None
        initial_free = free_bytes(root)
        target_free = initial_free + required_reclaim
        # An idle checkout first shrinks to the sparse patterns its HEAD commits: those
        # are paths no gated command reads, and the checkout stays warm for the
        # next gate. LRU eviction then weighs what remains.
        sparsified = False
        for stamp_ns, repo, host, owner in candidates:
            fd = os.open(locks / f"{host}-{owner}-{repo.name}.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
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
        for stamp_ns, repo, host, owner in sorted(candidates):
            if total <= cap and (not required_reclaim or free_bytes(root) >= target_free):
                break
            # Wait without taking a candidate repo lock. Writer intent stops
            # new shared claimers while existing readers finish their snapshots.
            with writer_intent() as deadline:
                wait_capacity_lock(global_lock, locks / ".capacity.lock", deadline)
                try:
                    lock_path = locks / f"{host}-{owner}-{repo.name}.lock"
                    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
                    try:
                        if repo != current:
                            try:
                                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                            except BlockingIOError:
                                continue
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
