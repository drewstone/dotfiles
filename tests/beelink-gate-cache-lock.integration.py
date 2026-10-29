#!/usr/bin/env python3
"""Real filesystem/lock integration: no simulated commands or lock objects."""
import argparse
import fcntl
import json
import os
from pathlib import Path
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
        resources = (ROOT / "claude/tools/beelink-gate-lib/resources.sh").read_text()
        helpers = "\n".join([function(source, "sparse_normalize"), function(source, "sparse_apply")]
                            + [function(resources, name) for name in ["gate_slice", "cgroup_root", "gate_cgroup"]])
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
    rows.append(watcher_identity_case(source))
    print(json.dumps({"cases": rows, "passed": sum(r["passed"] for r in rows),
                      "total": len(rows)}, indent=2))
    raise SystemExit(0 if all(r["passed"] for r in rows) else 1)


if __name__ == "__main__":
    main()
