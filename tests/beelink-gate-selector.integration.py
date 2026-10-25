#!/usr/bin/env python3
"""Real frontend/retry/reservation/PSI integration; no replacement commands.

Both logical hosts run the production local Beelink transport against a private
pressure file. The source fixture sets SELF as a Bash nameref to each call's
target; all production functions and ssh/git executables remain unchanged.
This exercises two real reservation/probe process trees on one Linux host,
not a two-machine SSH admission journey.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import uuid


ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "claude/tools/beelink-gate"


def processes(token):
    result = []
    for path in Path("/proc").glob("[0-9]*/environ"):
        try:
            if ("GATE_SELECTOR_INTEGRATION=" + token).encode() in path.read_bytes().split(b"\0"):
                result.append(int(path.parent.name))
        except (FileNotFoundError, PermissionError, ProcessLookupError):
            pass
    return result


def run_case(gate, mode, bound):
    with tempfile.TemporaryDirectory(prefix="gate-selector-integration-") as tmp:
        root = Path(tmp)
        state = root / "state"
        state.mkdir()
        pressure = root / "pressure"
        pressure.write_text("some avg10=99.00 avg60=99.00 avg300=99.00 total=1\n")
        # The real Windows registry is unavailable on Linux. Its maintained
        # cache fallback accepts this private, fresh policy outside today's window.
        day = (datetime.datetime.now(datetime.timezone.utc).isoweekday() % 7 + 3) % 7 + 1
        (state / "policy-beelink1").write_text(
            f"ScheduledInstallDay REG_DWORD 0x{day:x}\nScheduledInstallTime REG_DWORD 0xc\n")
        (state / "policy-beelink2").write_bytes((state / "policy-beelink1").read_bytes())
        tools = root / "tools"
        tools.mkdir()
        source = gate.read_text()
        assert source.count("SELF=$(self_beelink)") == 1
        # Fixture wiring at the existing local/remote transport seam, without
        # replacing probe_of, on_beelink, remote_probe or reservation functions.
        source = source.replace("SELF=$(self_beelink)", "target=beelink1\ndeclare -n SELF=target")
        fixture_gate = tools / "beelink-gate"
        fixture_gate.write_text(source)
        for name in ["beelink-gate-lib", "beelink_gate_disk.py", "beelink_gate_release.py",
                     "beelink_gate_metrics.py"]:
            (tools / name).symlink_to(gate.parent / name)
        origin = root / "owner/repo"
        origin.mkdir(parents=True)
        subprocess.run(["git", "init", "-q", str(origin)], check=True)
        tree = subprocess.check_output(["git", "-C", str(origin), "mktree"], input="", text=True).strip()
        sha = subprocess.check_output(["git", "-C", str(origin), "commit-tree", tree],
                                      input="selector integration fixture\n", text=True).strip()
        token = uuid.uuid4().hex
        env = {k: v for k, v in os.environ.items()
               if not k.startswith(("BEELINK_GATE_", "BASH_FUNC_")) and
               k not in ("BASH_ENV", "SHELLOPTS", "BASHOPTS")}
        env.update(BEELINK_GATE_SELF="beelink1", BEELINK_GATE_REG="/usr/bin/true",
                   BEELINK_GATE_STATE_DIR=str(state), BEELINK_GATE_CACHE_ROOT=str(root / "cache"),
                   BEELINK_GATE_HOST_PRESSURE=str(pressure), BEELINK_GATE_LIMITS_FILE=str(root / "limits"),
                   BEELINK_GATE_AUTO_POLL_SECONDS="120", BEELINK_GATE_PROBE_RETRY_SECONDS="1",
                   GATE_SELECTOR_INTEGRATION=token)
        (root / "limits").write_text("host_max_cpu_pressure=20\n")
        started = time.monotonic()
        log_path = root / "frontend.log"
        with log_path.open("w+") as log:
            proc = subprocess.Popen(["bash", str(fixture_gate), "--no-install", "--retry", "1", "--cancel-on-term", "auto",
                                     "file://" + str(origin), sha, "--", "/usr/bin/true"],
                                    env=env, stdout=log, stderr=log, start_new_session=True)
            reached_selector = timed_out = False
            try:
                while proc.poll() is None and time.monotonic() - started < bound:
                    text = log_path.read_text()
                    if ("no beelink is both free" in text and
                            "beelink1: host=beelink1 state=busy" in text and
                            "beelink2: host=beelink2 state=busy" in text and "load=99.0" in text):
                        reached_selector = True
                        if mode == "term":
                            proc.send_signal(signal.SIGTERM)
                            break
                    time.sleep(0.05)
                try:
                    proc.wait(timeout=8 if mode == "term" else 0.1)
                except subprocess.TimeoutExpired:
                    timed_out = True
                elapsed = time.monotonic() - started
                survivors = processes(token)
                text = log_path.read_text()
                markers = list((root / "cache/.locks").glob("queue-*"))
                wanted = 143 if mode == "term" else 75
                passed = (reached_selector and not timed_out and proc.returncode == wanted
                          and not survivors and not markers)
                if mode == "deadline":
                    passed = passed and 58 <= elapsed <= 90 and "TEMPFAIL next_allowed=" in text
                else:
                    passed = passed and elapsed < bound
                return {"case": "selector-" + mode, "passed": passed,
                        "exit": proc.returncode, "elapsed_s": round(elapsed, 3),
                        "reached_busy_selector": reached_selector, "timed_out": timed_out,
                        "surviving_children": survivors, "reservation_markers": len(markers),
                        "log": text if not passed else text.splitlines()[-5:]}
            finally:
                # The baseline is deliberately unbounded. Terminate only this
                # test's tagged real processes when its external bound expires.
                for pid in processes(token):
                    try:
                        os.kill(pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                proc.wait(timeout=3)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gate", type=Path, default=GATE)
    parser.add_argument("--case", choices=["deadline", "term"], action="append")
    parser.add_argument("--bound", type=float, default=90)
    args = parser.parse_args()
    rows = [run_case(args.gate.resolve(), mode, args.bound) for mode in args.case or ["deadline", "term"]]
    print(json.dumps({"cases": rows, "passed": sum(row["passed"] for row in rows), "total": len(rows)}, indent=2))
    raise SystemExit(0 if all(row["passed"] for row in rows) else 1)


if __name__ == "__main__":
    main()
