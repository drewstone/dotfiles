"""Real observer processes, CPU contention and blocking filesystem publications.

Run directly with Python. --observer can point at an unmodified base revision
for the same regression check. All busy processes share one CPU with the
observer, keeping total CPU use bounded even on a large host. No Docker daemon,
hostlab, fake executables, or imported/replaced production helpers are needed.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import tempfile
import time


def until(predicate, process, seconds=20):
    deadline = time.monotonic() + seconds
    while True:
        value = predicate()
        if value:
            return value
        assert process.poll() is None, f"observer exited early: {process.returncode}"
        assert time.monotonic() < deadline, "observer did not reach the expected filesystem boundary"
        time.sleep(0.02)


def release_fifo(path, process):
    # Opening a real FIFO for writing waits for a reader. Keep the observer (or
    # its writer thread) blocked there for >2 sampling intervals, then consume
    # the real JSON write. The next publication replaces the FIFO normally.
    until(lambda: any(p.read_text().strip() == "wait_for_partner"
                      for p in Path(f"/proc/{process.pid}/task").glob("*/wchan")), process)
    time.sleep(3.2)
    descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
    try:
        payload = bytearray()

        def receive():
            try:
                payload.extend(os.read(descriptor, 65536))
            except BlockingIOError:
                pass
            return b"\n" in payload

        until(receive, process)
        return json.loads(payload)
    finally:
        os.close(descriptor)


def regular_json(path):
    try:
        if stat.S_ISREG(path.stat().st_mode):
            return json.loads(path.read_text())
    except (FileNotFoundError, ValueError):
        pass
    return None


def exercise(observer, cpu, case, root):
    directory = root / case
    directory.mkdir()
    if case != "cpu":
        os.mkfifo(directory / ("ready.tmp" if case == "slow-ready" else "observation.tmp"))
    # Use the real installed CLI if present, with an explicitly remote endpoint;
    # optional daemon usage remains honestly unknown on this temp filesystem.
    env = {**os.environ, "DOCKER_HOST": "tcp://127.0.0.1:1", "DOCKER_CONTEXT": ""}
    with (directory / "stderr").open("w") as errors:
        process = subprocess.Popen(
            [sys.executable, str(observer), "observe", str(directory), str(os.getpid()), "60",
             *[str(directory)] * 5], env=env, stderr=errors, start_new_session=True)
        try:
            os.sched_setaffinity(process.pid, {cpu})
            ready = (release_fifo(directory / "ready.tmp", process) if case == "slow-ready" else
                     until(lambda: regular_json(directory / "ready"), process))
            assert ready["pid"] == process.pid
            if case == "slow-progress":
                first = release_fifo(directory / "observation.tmp", process)
                assert first["termination"] == "running"
            # Also write actual allocated bytes while the observer samples.
            with (directory / "payload").open("wb") as payload:
                payload.write(b"x" * (4 * 1024 * 1024))
                payload.flush()
                os.fsync(payload.fileno())
            time.sleep(4.2)
            process.send_signal(signal.SIGUSR1)
            process.wait(timeout=20)
            assert process.returncode == 0, (process.returncode, (directory / "stderr").read_text())
            observation = regular_json(directory / "observation.json")
            assert observation and observation["termination"] == "finished"
            assert observation["interval_s"] == 1.0 and observation["max_qualified_gap_s"] == 1.5
            fs, = observation["filesystems"]  # All five aliases share this filesystem.
            assert len(fs["aliases"]) == 5 and fs["read_errors"] == 0
            assert fs["samples"] >= 5 and fs["start_available_bytes"] is not None
            assert fs["sampled_highwater_bytes"] == max(0, fs["start_available_bytes"] - fs["min_available_bytes"])
            assert fs["start_free_bytes"] >= fs["start_available_bytes"]
            assert fs["end_free_bytes"] >= fs["end_available_bytes"]
            work = observation["work"]
            assert work["write_errors"] == 0
            assert work["progress_writes_completed"] == work["progress_writes_submitted"] > 0
            if case == "slow-progress":
                assert work["max_write_s"] >= 3 and work["progress_writes_skipped_busy"] > 0
            (directory / "result.json").write_text(json.dumps(observation, indent=2) + "\n")
            return {"case": case, "max_gap_s": fs["max_gap_s"], "missed_intervals": fs["missed_intervals"],
                    "full_window": fs["full_window"], "samples": fs["samples"], "work": work}
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()


def exercise_identity(observer, cpu, case, root):
    """Swap a real path while ready publication blocks only the controller."""
    directory = root / case
    directory.mkdir()
    original, replacement = directory / "original", directory / "replacement"
    original.mkdir()
    replacement.mkdir()
    watched = directory / "watched"
    watched.symlink_to(original, target_is_directory=True)
    os.mkfifo(directory / "ready.tmp")
    # Exercise both the held fd's path and another alias deduplicated onto it.
    paths = [watched] * 5 if case != "alias-swap" else [original, watched, original, original, original]
    with (directory / "stderr").open("w") as errors:
        process = subprocess.Popen(
            [sys.executable, str(observer), "observe", str(directory), str(os.getpid()), "60",
             *map(str, paths)], stderr=errors,
            env={**os.environ, "DOCKER_HOST": "tcp://127.0.0.1:1", "DOCKER_CONTEXT": ""},
            start_new_session=True)
        try:
            os.sched_setaffinity(process.pid, {cpu})
            until(lambda: any(p.read_text().strip() == "wait_for_partner"
                              for p in Path(f"/proc/{process.pid}/task").glob("*/wchan")), process)
            if case == "path-missing":
                watched.unlink()
            else:
                swap = directory / "swap"
                swap.symlink_to(replacement, target_is_directory=True)
                swap.replace(watched)
            time.sleep(2.2)  # At least two ticks see the changed/unreadable identity.
            restore = directory / "restore"
            restore.symlink_to(original, target_is_directory=True)
            restore.replace(watched)
            release_fifo(directory / "ready.tmp", process)
            process.send_signal(signal.SIGUSR1)
            process.wait(timeout=20)
            assert process.returncode == 0, (directory / "stderr").read_text()
            observation = regular_json(directory / "observation.json")
            assert observation and observation["termination"] == "finished"
            collected = subprocess.run([sys.executable, str(observer), "collect", str(directory)],
                                       capture_output=True, text=True, check=True)
            receipt = json.loads(collected.stdout)
            fs, = receipt["filesystems"]
            result = {"case": case, "samples": fs["samples"], "max_gap_s": fs["max_gap_s"],
                      "checked_samples": fs.get("checked_samples"),
                      "unchecked_samples": fs.get("unchecked_samples"), "full_window": fs["full_window"],
                      "docker_identity_revalidated": receipt.get("docker_identity_revalidated")}
            (directory / "result.json").write_text(json.dumps(receipt, indent=2) + "\n")
            print(json.dumps(result), flush=True)
            assert fs.get("unchecked_samples", 0) >= 2, result
            assert fs["checked_samples"] + fs["unchecked_samples"] == fs["samples"], result
            assert not fs["full_window"], result
            assert receipt.get("docker_identity_revalidated") != "every_sample_and_collect", result
            return result
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()


def check_termination(observer, cpu, root):
    for reason in ("deadline", "terminated"):
        directory = root / reason
        directory.mkdir()
        with (directory / "stderr").open("w") as errors:
            process = subprocess.Popen(
                [sys.executable, str(observer), "observe", str(directory), str(os.getpid()),
                 "2" if reason == "deadline" else "60", *[str(directory)] * 5], stderr=errors,
                env={**os.environ, "DOCKER_HOST": "tcp://127.0.0.1:1", "DOCKER_CONTEXT": ""},
                start_new_session=True)
            try:
                os.sched_setaffinity(process.pid, {cpu})
                until(lambda: regular_json(directory / "ready"), process)
                if reason == "terminated":
                    process.terminate()
                process.wait(timeout=15)
                assert process.returncode == 0, (directory / "stderr").read_text()
                observation = regular_json(directory / "observation.json")
                assert observation["termination"] == reason
                assert all(not fs["full_window"] for fs in observation["filesystems"])
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--observer", type=Path,
                        default=Path(__file__).resolve().parents[1] / "claude/tools/beelink_gate_disk.py")
    parser.add_argument("--busy", type=int, default=8)
    parser.add_argument("--results", type=Path, help="retain full observations in this directory")
    parser.add_argument("--case", choices=("path-swap", "alias-swap", "path-missing"))
    args = parser.parse_args()
    assert args.busy > 0
    cpu = min(os.sched_getaffinity(0))
    workers = []
    try:
        for _ in range(args.busy):
            worker = subprocess.Popen([sys.executable, "-c", "while True: pass"])
            workers.append(worker)
            os.sched_setaffinity(worker.pid, {cpu})
        with tempfile.TemporaryDirectory(prefix="disk-sampling-") as tmp:
            root = args.results or Path(tmp)
            root.mkdir(parents=True, exist_ok=True)
            if args.case:
                exercise_identity(args.observer.resolve(), cpu, args.case, root)
                return
            results = [exercise(args.observer.resolve(), cpu, case, root)
                       for case in ("cpu", "slow-ready", "slow-progress")]
            print(json.dumps({"observer": str(args.observer), "busy_processes": args.busy,
                              "affinity_cpu": cpu, "results": results}), flush=True)
            check_termination(args.observer.resolve(), cpu, root)
            assert all(r["max_gap_s"] < 1.5 and r["missed_intervals"] == 0 and r["full_window"]
                       for r in results), "sampling lost cadence during CPU contention / blocking publication"
            failed = []
            for case in ("path-swap", "alias-swap", "path-missing"):
                try:
                    exercise_identity(args.observer.resolve(), cpu, case, root)
                except AssertionError as error:
                    failed.append({"case": case, "error": str(error)})
            print(json.dumps({"passed": 8 - len(failed), "failed": len(failed), "failures": failed}), flush=True)
            assert not failed, failed
    finally:
        for worker in workers:
            worker.terminate()
        for worker in workers:
            worker.wait(timeout=5)


if __name__ == "__main__":
    main()
