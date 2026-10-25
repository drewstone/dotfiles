#!/usr/bin/env python3
"""Real filesystem/lock integration: no simulated commands or lock objects."""
import argparse
import base64
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time


ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "claude/tools/beelink-gate"


def function(source, name):
    start = source.index(name + "() {")
    first_end = source.index("\n", start)
    if source[start:first_end].rstrip().endswith("}"):
        return source[start:first_end]
    return source[start:source.index("\n}", start) + 2]


def run_case(lock_name, timeout):
    with tempfile.TemporaryDirectory(prefix="gate-cache-lock-integration-") as tmp:
        root = Path(tmp) / "cache"
        locks = root / ".locks"
        repo = root / "local/owner/idle"
        repo.mkdir(parents=True)
        locks.mkdir()
        subprocess.run(["git", "init", "-q", str(repo)], check=True)
        (repo / "allocated").write_bytes(b"x" * 16_777_216)
        source = GATE.read_text()
        helpers = "\n".join(function(source, name) for name in
                            ["sparse_normalize", "sparse_apply"])
        module = ROOT / "claude/tools/beelink-gate-lib/cache.sh"
        prune = module.read_text() if module.exists() else function(source, "prune_cache")
        script = helpers + "\n" + prune + '\nprune_cache "$1" "$2" 8388608\n'
        with (locks / lock_name).open("a+") as held:
            mode = fcntl.LOCK_SH if lock_name == ".capacity.lock" else fcntl.LOCK_EX
            fcntl.flock(held, mode)
            started = time.monotonic()
            err_path = Path(tmp) / "child.stderr"
            err_file = err_path.open("w")
            child = subprocess.Popen(
                ["bash", "-c", script, "gate-cache-integration", str(root),
                 str(root / "not-current")], stdout=subprocess.PIPE,
                stderr=err_file, text=True,
                env={**os.environ, "BEELINK_GATE_CAPACITY_INTENT_WAIT_SECONDS": "1"},
            )
            # Wait for the child's own announcement, not a fixed sleep: on a loaded
            # host the child can still be in its brief repo-lock window at 0.35 s.
            announce = "waiting up to"
            start_wait = time.monotonic()
            while (time.monotonic() - start_wait < 5 and child.poll() is None
                   and announce not in err_path.read_text()):
                time.sleep(0.02)
            waited = child.poll() is None and announce in err_path.read_text()
            with (locks / "local-owner-idle.lock").open("a+") as repo_lock:
                try:
                    fcntl.flock(repo_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    repo_free = True
                except BlockingIOError:
                    repo_free = False
            if not timeout:
                fcntl.flock(held, fcntl.LOCK_UN)
            try:
                stdout, _ = child.communicate(timeout=4)
            except subprocess.TimeoutExpired:
                child.kill()
                child.communicate()
                raise AssertionError("lock acquisition exceeded its 1s budget")
            finally:
                err_file.close()
            stderr = err_path.read_text()
        elapsed = time.monotonic() - started
        if timeout:
            passed = (waited and repo_free and child.returncode == 3
                      and "timed out" in stderr and lock_name in stderr
                      and 0.9 <= elapsed < 3 and repo.exists())
        else:
            passed = (waited and repo_free and child.returncode == 0
                      and not repo.exists())
        passed = passed and not (locks / ".capacity.writer.intent").exists()
        return {"lock": lock_name, "timeout": timeout, "passed": passed,
                "waited": waited, "repo_lock_free_while_waiting": repo_free,
                "exit": child.returncode, "elapsed_seconds": elapsed,
                "stderr": stderr, "stdout": stdout}


def wait_until(predicate, message, seconds=3):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError(message)


def reservation_case(source, refusal, expected_id=True):
    """Local reservation/watcher seam; managed systemd admission is not exercised.

    Execute production source slices as in the cache cases. The disk predicate
    reads real df, with a fixture policy threshold; the privileged lifecycle
    policy reader is outside this seam. No executable or function is mocked.
    """
    admission = (ROOT / "claude/tools/beelink-gate-lib/admission.sh").read_text()
    common = "\n".join(function(source, name) for name in
                       ["decode", "parse_repo_url", "free_bytes", "utc_in_minutes",
                        "tempfail_line", "tempfail"])
    reservations = common + "\n" + "\n".join(
        function(admission, name) for name in ["proc_start", "ticket_body"])
    reservations += "\n" + function(source, "reserve_checkout")
    transport = (ROOT / "claude/tools/beelink-gate-lib/source.sh").read_text()
    begin = transport.index("  heartbeat_input() {")
    end = transport.index("\n  }", begin) + len("\n  }")
    reservations += "\n" + transport[begin:end]
    remote = function(source, "remote_gate")
    guards = list(re.finditer(
        r'^  \(\( floor_ok == 0 \)\) \|\| tempfail .*$', remote, re.M))
    assert len(guards) == 2, "re-read placement: disk guards changed"
    marker = r'^  \[ -z "\$gate_id" \] \|\| echo "beelink-gate: placement handoff .*?$'

    def handoffs(begin, end):
        return "\n".join(re.findall(marker, remote[begin:end], re.M))

    floor_body = function(source, "check_floor")
    floor_body = floor_body[floor_body.index("  available=$(free_bytes)"):-2]
    echo = next(line for line in function(admission, "acquire_checkout_admission").splitlines()
                if line.startswith('  echo "beelink-gate: lock, host slot'))
    floor_refusal = remote[remote.index('    # The host can cross its floor'):]
    floor_refusal = floor_refusal[:floor_refusal.index('\n  fi')]
    placement = common + "\nfixture_disk_predicate() {\n" + floor_body + "\n}\n" + r'''
set -uo pipefail
root=$1 refusal=$2 gate_id=$3
beelink=beelink1 waited=0 urgent=0 placed_auto=1
TEMPFAIL=75 NOT_ADMITTED=76
exec {lock_fd}>"$root/checkout.lock"
flock -x "$lock_fd"
exec {slot_fd}>"$root/slot.lock"
flock -x "$slot_fd"
''' + echo + r'''
if [ "$refusal" = 2 ]; then
  host=$beelink reserve=0 floor_bytes=$(( $(free_bytes) + 1073741824 ))
  if ! fixture_disk_predicate; then
''' + floor_refusal + '\n  fi\nfi\n' + handoffs(0, guards[0].start()) + r'''
git -C "$root/checkout" fetch -q origin HEAD || exit $?
git -C "$root/checkout" checkout -q --detach FETCH_HEAD || exit $?
''' + "\n"
    for index, guard in enumerate(guards):
        # Raise only a private fixture threshold; never fill the host disk.
        placement += "floor_ok=0\n( host=$beelink reserve=0; floor_bytes=1; "
        placement += f'if [ "$refusal" = "{index}" ]; then floor_bytes=$(( $(free_bytes) + 1073741824 )); fi\n'
        placement += "fixture_disk_predicate\n) || floor_ok=1\n" + guard.group() + "\n"
        end = (guards[index + 1].start() if index == 0 else
               remote.index("  cancel_if_requested", guard.end()))
        placement += handoffs(guard.end(), end) + "\n"
    placement += r'''
: > "$root/guards-passed"
IFS= read -r _
printf 'ran\n' > "$root/command-ran"
'''
    with tempfile.TemporaryDirectory(prefix="gate-reservation-integration-") as tmp:
        root = Path(tmp)
        origin = root / "origin"
        subprocess.run(["git", "init", "-q", str(origin)], check=True)
        (origin / "tracked").write_text("private fixture\n")
        subprocess.run(["git", "-C", str(origin), "add", "tracked"], check=True)
        tree = subprocess.check_output(["git", "-C", str(origin), "write-tree"], text=True).strip()
        commit = subprocess.check_output(["git", "-C", str(origin), "commit-tree", tree],
                                         input="private integration fixture\n", text=True).strip()
        subprocess.run(["git", "-C", str(origin), "update-ref", "HEAD", commit], check=True)
        subprocess.run(["git", "clone", "-q", str(origin), str(root / "checkout")], check=True)
        gate_id = "beelink1-" + "a" * 32
        token, epoch = "b" * 32, str(int(time.time()) - 30)
        children, tickets, original, files = [], [], [], []
        watcher = child = None
        log = root / "placement.log"
        log.touch()
        try:
            for host in ["beelink1", "beelink2"]:
                cache = root / host
                state = root / (host + ".reservation")
                files.append(state)
                args = [host, "https://github.com/fixture/reservation", "no-install", "normal", epoch, token]
                proc = subprocess.Popen(
                    ["bash", "-c", reservations + r'''
BEELINK_GATE_HEARTBEAT_STOP=$1; shift
me=$$
exec {heartbeat_fd}< <(heartbeat_input)
heartbeat_pid=$!
reserve_checkout "$@" <&"$heartbeat_fd"
rc=$?
kill -TERM "$heartbeat_pid" 2>/dev/null || true
wait "$heartbeat_pid" 2>/dev/null || true
exit "$rc"
''', "reservation", str(state) + ".stop",
                     *[base64.b64encode(a.encode()).decode() for a in args]],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    text=True, start_new_session=True,
                    env={**os.environ, "BEELINK_GATE_CACHE_ROOT": str(cache)})
                children.append(proc)
                wait_until(lambda: bool(list(cache.glob(".locks/queue-*"))), "reservation did not enqueue")
                ticket, = cache.glob(".locks/queue-*")
                wait_until(lambda: token in ticket.read_text() and "start=" in ticket.read_text(),
                           "reservation did not finish writing its ticket")
                tickets.append(ticket)
                original.append((ticket.stat().st_ino, ticket.read_text()))
            watch = function(source, "watch_checkout_admission") + r'''
checkout_reservation_files=("$2" "$3")
PS4='+ '
set -x
watch_checkout_admission "$1" "$4"
'''
            trace = root / "watcher.trace"
            with trace.open("w") as stream:
                watcher = subprocess.Popen(["bash", "-c", watch, "watcher", str(log),
                                            *map(str, files), gate_id if expected_id else ""],
                                           stderr=stream, start_new_session=True)
            with log.open("a") as output:
                child = subprocess.Popen(["bash", "-c", placement, "placement", str(root),
                                          str(refusal), gate_id], stdin=subprocess.PIPE,
                                         stdout=output, stderr=output, text=True,
                                         start_new_session=True)
                wait_until(lambda: child.poll() is not None or (root / "guards-passed").exists(),
                           "placement did not reach its disk guard", seconds=5)
                # Observe two completed negative polls, or the watcher's exit;
                # an arbitrary sleep could hide the bug on a busy machine.
                polls = trace.read_text().count("+ sleep 0.2")
                wait_until(lambda: watcher.poll() is not None or
                           trace.read_text().count("+ sleep 0.2") >= polls + 2,
                           "watcher did not consume placement output")
                stopped = [Path(str(f) + ".stop").exists() for f in files]
                intact = all(p.poll() is None and t.exists() and
                             (t.stat().st_ino, t.read_text()) == old
                             for p, t, old in zip(children, tickets, original))
                held = []
                for name in ["checkout.lock", "slot.lock"]:
                    with (root / name).open("a") as lock:
                        try:
                            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                            held.append(False)
                        except BlockingIOError:
                            held.append(True)
                if child.poll() is None:
                    if expected_id is True:
                        wait_until(lambda: all(p.poll() is not None for p in children),
                                   "heartbeat did not retire reservations", seconds=6)
                    child.communicate("continue\n", timeout=3)
                text = log.read_text()
                handoff = "beelink-gate: placement handoff gate_id=" + gate_id
                if refusal >= 0:
                    passed = (child.returncode == (76 if refusal == 2 else 75)
                              and not any(stopped) and intact
                              and "below its disk floor" in text and handoff not in text
                              and not (root / "command-ran").exists())
                else:
                    passed = (child.returncode == 0 and all(held) and handoff in text.splitlines()
                              and stopped == [expected_id, expected_id] and intact
                              and (root / "command-ran").read_text() == "ran\n")
                    if expected_id:
                        passed = passed and all(p.returncode == 0 for p in children) and not any(t.exists() for t in tickets)
            return {"case": f"reservation-disk-{refusal}" if refusal >= 0 else
                    "reservation-handoff" if expected_id else "reservation-empty-id",
                    "passed": passed, "exit": child.returncode, "retired": stopped,
                    "tickets_unchanged": intact, "locks_held_at_handoff": held,
                    "stderr": text}
        finally:
            for proc in [child, watcher, *children]:
                if proc is None:
                    continue
                if proc.poll() is None:
                    try:
                        os.killpg(proc.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                proc.communicate(timeout=3)


def watcher_identity_case(source):
    """Only the complete native line for the allocated ID may stop heartbeats."""
    gate_id = "beelink1-" + "c" * 32
    line = "beelink-gate: placement handoff gate_id=" + gate_id
    with tempfile.TemporaryDirectory(prefix="gate-watcher-identity-") as tmp:
        root = Path(tmp)
        log = root / "attach.log"
        files = [root / "beelink1", root / "beelink2"]
        log.write_text("\n".join([line + "0", line[:-1], "prefix " + line,
                                   line + " suffix", line + " ", line + "\r"]) + "\n")
        script = function(source, "watch_checkout_admission") + r'''
checkout_reservation_files=("$2" "$3")
watch_checkout_admission "$1" "$4"
'''
        child = subprocess.Popen(["bash", "-c", script, "watcher", str(log),
                                  *map(str, files), gate_id], start_new_session=True)
        try:
            time.sleep(0.5)
            exact = child.poll() is None and not any(Path(str(f) + ".stop").exists() for f in files)
            with log.open("a") as stream:
                stream.write(line + "\n")
            try:
                child.wait(timeout=1)
            except subprocess.TimeoutExpired:
                exact = False
            return {"case": "watcher-exact-id-line", "passed": exact and
                    all(Path(str(f) + ".stop").exists() for f in files)}
        finally:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
            child.wait(timeout=2)


def main():
    global GATE
    parser = argparse.ArgumentParser()
    parser.add_argument("--gate", type=Path, default=GATE,
                        help="gate source to compare with the current integration cases")
    GATE = parser.parse_args().gate
    rows = [run_case(lock, timeout) for lock in
            [".capacity.writer.lock", ".capacity.lock"]
            for timeout in [False, True]]
    source = GATE.read_text()
    rows.extend(reservation_case(source, refusal) for refusal in [2, 0, 1, -1])
    rows.append(reservation_case(source, -1, expected_id=False))
    rows.append(watcher_identity_case(source))
    print(json.dumps({"cases": rows, "passed": sum(r["passed"] for r in rows),
                      "total": len(rows)}, indent=2))
    raise SystemExit(0 if all(r["passed"] for r in rows) else 1)


if __name__ == "__main__":
    main()
