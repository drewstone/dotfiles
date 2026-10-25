#!/usr/bin/env python3
"""Real Bash/process/receipt checks, plus native SYSTEM cancellation cases.

Every case invokes the complete public CLI and actual managed SYSTEM jobs.
Run outside another gate on a Beelink. No production function is extracted,
replaced or fabricated; admission, FIFO, resource and disk guards remain active.
"""
import argparse
import contextlib
import concurrent.futures
import fcntl
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import signal
import shlex
import socket
import subprocess
import tempfile
import time
import tarfile
import uuid


ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "claude/tools/beelink-gate"


def process_identity(pid):
    try:
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        return {"pid": int(pid), "birth": fields[19], "state": fields[0]}
    except (FileNotFoundError, ProcessLookupError):
        return None


def actual_ssh_peer(frontend, host):
    peer = {"beelink1": "100.98.195.7", "beelink2": "100.127.22.51"}[host]
    pending = [frontend.pid]
    while pending:
        parent = pending.pop()
        try:
            children = Path(f"/proc/{parent}/task/{parent}/children").read_text().split()
        except (FileNotFoundError, ProcessLookupError):
            continue
        for pid in children:
            pending.append(int(pid))
            try:
                argv = Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0")
            except (FileNotFoundError, ProcessLookupError):
                continue
            if Path(os.fsdecode(argv[0])).name != "ssh" or peer.encode() not in argv:
                continue
            sockets = subprocess.run(["ss", "-ntpH"], capture_output=True, text=True, timeout=3)
            joined = [line for line in sockets.stdout.splitlines()
                      if f"pid={pid}," in line and peer + ":22" in line]
            if sockets.returncode == 0 and joined:
                return process_identity(pid) | {"peer": peer + ":22", "socket_join": joined}
    return None


def read_frontend(output):
    paths = re.findall(rb"frontend_observation=([^\r\n]+)", output)
    return json.loads(Path(os.fsdecode(paths[0])).read_text()) if paths else None


@contextlib.contextmanager
def foreign_control(gate):
    """A second real owned gate must survive the first gate's cancellation."""
    host = {"desktop-18ir33v": "beelink1"}.get(socket.gethostname().lower(), socket.gethostname().lower())
    assert host in ("beelink1", "beelink2")
    with tempfile.TemporaryDirectory(prefix="gate-foreign-control-") as tmp:
        root = Path(tmp)
        origin = root / root.name / "repo"
        origin.mkdir(parents=True)
        subprocess.run(["git", "init", "-q", str(origin)], check=True)
        tree = subprocess.check_output(["git", "-C", str(origin), "mktree"], input="", text=True).strip()
        sha = subprocess.check_output(["git", "-C", str(origin), "commit-tree", tree],
                                      input="independent live gate control\n", text=True).strip()
        subprocess.run(["git", "-C", str(origin), "update-ref", "HEAD", sha], check=True)
        env = {k: v for k, v in os.environ.items() if not k.startswith(("BEELINK_GATE_", "BASH_FUNC_"))
               and k not in ("BASH_ENV", "SHELLOPTS", "BASHOPTS")}
        env.update(BEELINK_GATE_LOAD_WAIT="30s", BEELINK_GATE_MAX_HOLD="180s")
        state = Path(env.get("XDG_STATE_HOME", str(Path.home() / ".local/state"))) / "beelink-gate"
        log = root / "frontend.log"
        code = 'touch "$1/ready"; while [ ! -f "$1/release" ]; do sleep 0.05; done; exit 0'
        gate_id = ""
        with log.open("w") as output:
            proc = subprocess.Popen(["bash", str(gate.resolve()), "--light", "--pin-host", host,
                "file://" + str(origin), sha, "--", "bash", "-c", code, "foreign-control", str(root)],
                env=env, stdout=output, stderr=output, start_new_session=True)
            try:
                deadline = time.monotonic() + 90
                while not (root / "ready").exists():
                    assert proc.poll() is None and time.monotonic() < deadline, "foreign control admission unproved"
                    time.sleep(0.02)
                gate_id = re.search(r"gate_id=(beelink[12]-[0-9a-f]{32})", log.read_text())[1]
                pid, birth = (state / "jobs" / gate_id / "gate.pid").read_text().split()
                yield {"id": gate_id, "pid": int(pid), "birth": birth, "state": state}
            finally:
                (root / "release").touch()
                if not gate_id:
                    allocated = re.search(r"gate_id=(beelink[12]-[0-9a-f]{32})", log.read_text())
                    gate_id = allocated[1] if allocated else ""
                if gate_id:
                    cleanup = subprocess.run(["bash", str(gate.resolve()), "--cancel-job", gate_id],
                                             env=env, capture_output=True, timeout=330)
                    assert cleanup.returncode == 0, "foreign fixture cleanup unconfirmed"
                if proc.poll() is None:
                    proc.wait(timeout=15)


def foreign_is_healthy(control):
    actual = process_identity(control["pid"])
    return (actual and actual["birth"] == control["birth"] and actual["state"] not in ("Z", "X")
            and not (control["state"] / "jobs/.canceled" / control["id"]).exists())


def native_cleanup_case(gate, mode):
    """Signal the real finish path after a known command exit, behind an
    externally held PRIVATE cache lock. No other gate can use this fixture's
    XDG cache, and no executable or production function is replaced.
    """
    host = {"desktop-18ir33v": "beelink1"}.get(socket.gethostname().lower(), socket.gethostname().lower())
    assert host in ("beelink1", "beelink2") and not os.environ.get("BEELINK_GATE_RUN")
    with tempfile.TemporaryDirectory(prefix="gate-real-cleanup-") as tmp:
        root = Path(tmp)
        origin = root / root.name / "repo"
        origin.mkdir(parents=True)
        subprocess.run(["git", "init", "-q", str(origin)], check=True)
        tree = subprocess.check_output(["git", "-C", str(origin), "mktree"], input="", text=True).strip()
        sha = subprocess.check_output(["git", "-C", str(origin), "commit-tree", tree],
                                      input="real cleanup integration\n", text=True).strip()
        subprocess.run(["git", "-C", str(origin), "update-ref", "HEAD", sha], check=True)
        env = {k: v for k, v in os.environ.items() if not k.startswith(("BEELINK_GATE_", "BASH_FUNC_"))
               and k not in ("BASH_ENV", "SHELLOPTS", "BASHOPTS")}
        env.update(XDG_CACHE_HOME=str(root / "cache"), BEELINK_GATE_LOAD_WAIT="30s", BEELINK_GATE_MAX_HOLD="90s")
        state = Path(env.get("XDG_STATE_HOME", str(Path.home() / ".local/state"))) / "beelink-gate"
        code = 7 if mode == "failure-cleanup-term" else 0
        command = r'''
printf '%s\n' "$PWD" > "$1/checkout"
printf 'ready\n' > "$1/ready"
while [ ! -f "$1/release" ]; do sleep 0.05; done
echo ALL_REMAINING_CHECKS_EXIT="$2"
exit "$2"
'''
        log = root / "frontend.log"
        gate_id, job, lock = "", None, None
        with log.open("w") as output:
            proc = subprocess.Popen(["bash", str(gate.resolve()), "--light", "--pin-host", host,
                                     "file://" + str(origin), sha, "--", "bash", "-c", command,
                                     "cleanup-command", str(root), str(code)], env=env,
                                    stdout=output, stderr=output, start_new_session=True)
            deadline = time.monotonic() + 120
            try:
                while not (root / "ready").exists():
                    assert proc.poll() is None and time.monotonic() < deadline, "real command did not start"
                    time.sleep(0.02)
                gate_id = re.search(r"gate_id=(beelink[12]-[0-9a-f]{32})", log.read_text())[1]
                job = state / "jobs" / gate_id
                cache = root / "cache/beelink-gate"
                lock = (cache / ".locks/.capacity.lock").open("a+")
                fcntl.flock(lock, fcntl.LOCK_EX)
                (root / "release").touch()
                checkout = Path((root / "checkout").read_text().strip())
                marker = checkout / ".git/beelink-gate-used"
                while not marker.exists():
                    assert proc.poll() is None and time.monotonic() < deadline, "real finish not observed"
                    time.sleep(0.005)
                pid, birth = (job / "gate.pid").read_text().split()
                actual = process_identity(pid)
                assert actual and actual["birth"] == birth, "native gate incarnation changed"
                os.kill(int(pid), signal.SIGTERM)
                fcntl.flock(lock, fcntl.LOCK_UN)
                proc.wait(timeout=20)
                row = json.loads((job / "receipt.json").read_text())
                expected = code or 143
                native_exit = int((job / "exit").read_text())
                return {"case": mode, "passed": proc.returncode == row["exit"] == native_exit == expected
                        and row["command_exit"] == code and row["post_command_exit"] == 143
                        and row["post_command_phase"] == "cleanup_signal",
                        "gate_id": gate_id, "frontend_exit": proc.returncode, "native_exit": native_exit,
                        "command_exit": row["command_exit"], "post_command_exit": row["post_command_exit"],
                        "native_process": actual, "private_cache": str(cache),
                        "source_digest": hashlib.sha256((job / "gate.sh").read_bytes()).hexdigest()}
            finally:
                if lock:
                    lock.close()
                (root / "release").touch()
                if gate_id:
                    cleaned = subprocess.run(["bash", str(gate.resolve()), "--cancel-job", gate_id], env=env,
                                             capture_output=True, timeout=330)
                    assert cleaned.returncode == 0, "exact native fixture retirement unconfirmed"
                if proc.poll() is None:
                    proc.send_signal(signal.SIGTERM)
                    proc.wait(timeout=12)


def exercise_ssh_case(gate, mode, proc, host, root, state, job, gate_id, output,
                      env, frontends, source_digest, native_alive, unit_active, control):
    deadline = time.monotonic() + 5
    peer = None
    while peer is None and time.monotonic() < deadline:
        peer = actual_ssh_peer(proc, host)
        if peer is None:
            time.sleep(0.02)
    assert peer, "no actual Windows SSH socket/owned descendant join"
    assert process_identity(peer["pid"])["birth"] == peer["birth"]
    if mode == "native-wrapper-handoff-term":
        # Pause an actual owned tee, so the public wrapper's real bounded drain
        # gives a deciding child-release/parent-custody window. No code hook.
        children = Path(f"/proc/{proc.pid}/task/{proc.pid}/children").read_text().split()
        tees = []
        for pid in children:
            try:
                argv = Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0")
                if Path(os.fsdecode(argv[0])).name == "tee":
                    tees.append(process_identity(pid))
            except (FileNotFoundError, ProcessLookupError):
                pass
        assert tees and foreign_is_healthy(control), "no real tee/foreign live control"
        held_tee = tees[0]
        assert process_identity(held_tee["pid"])["birth"] == held_tee["birth"]
        os.kill(held_tee["pid"], signal.SIGSTOP)
        os.kill(peer["pid"], signal.SIGTERM)
        deadline = time.monotonic() + 10
        while True:
            row = read_frontend(output)
            if row and row["active_phase"] == "result_read" and row["writer_id"] == row["root_invocation_id"] and row["delegated_to"] is None:
                break
            assert proc.poll() is None and time.monotonic() < deadline, "no real parent handoff window"
            time.sleep(0.005)
    first_exit = deadline_elapsed = None
    preserved = mode in ("native-lost-ssh", "native-global-deadline")
    if mode in ("native-lost-ssh", "native-attach-term", "native-global-deadline"):
        if mode != "native-global-deadline":
            os.kill(peer["pid"], signal.SIGTERM)
        began = time.monotonic()
        tail, _ = proc.communicate(timeout=75 if mode == "native-global-deadline" else 12)
        output.extend(tail)
        first_exit = proc.returncode
        deadline_elapsed = time.monotonic() - began
        assert first_exit == 75 and native_alive() and unit_active()
        assert not (state / "jobs/.canceled" / gate_id).exists(), "transport/deadline canceled native job"
        assert ("beelink-gate --attach " + gate_id).encode() in output
        if mode == "native-global-deadline":
            deadline_row = read_frontend(output)
            assert 58 <= (deadline_row["end_ns"] - deadline_row["start_ns"]) / 1e9 <= 75, "global deadline changed its absolute window"
        options = ["--cancel-on-term"] if mode == "native-attach-term" else []
        proc = subprocess.Popen(["bash", str(gate.resolve()), *options, "--attach", gate_id],
                                env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                start_new_session=True)
        frontends.append(proc)
        deadline = time.monotonic() + 5
        while actual_ssh_peer(proc, host) is None:
            assert time.monotonic() < deadline, "reconnect has no real SSH peer"
            time.sleep(0.02)
    term_at = None
    if preserved:
        (root / "release").touch()
    else:
        term_at = time.monotonic()
        proc.send_signal(signal.SIGTERM)
    tail, _ = proc.communicate(timeout=8)
    output.extend(tail)
    term_elapsed = time.monotonic() - term_at if term_at else None
    deadline = time.monotonic() + 30
    while (native_alive() or unit_active()) and time.monotonic() < deadline:
        time.sleep(0.05)
    canceled = (state / "jobs/.canceled" / gate_id).exists()
    expected = 0 if preserved else 143
    final = read_frontend(output)
    terminal = (job / "exit").exists() and not native_alive() and not unit_active()
    foreign_healthy = foreign_is_healthy(control) if control else None
    return proc, {"case": mode, "passed": proc.returncode == expected and terminal
            and canceled == (not preserved) and final["end_ns"] is not None
            and final["source_digest"] == source_digest
            and any(p["gate_id"] == gate_id for p in final["placements"])
            and (control is None or foreign_healthy),
            "gate_id": gate_id, "frontend_exit": proc.returncode, "canceled": canceled,
            "native_terminal": terminal, "ssh_peer": peer, "source_digest": source_digest,
            "request_id": final["request_id"], "root_invocation_id": final["root_invocation_id"],
            "delegated_to": final["delegated_to"], "tainted": final["tainted"],
            "term_elapsed_s": term_elapsed, "first_frontend_exit": first_exit,
            "deadline_elapsed_s": deadline_elapsed, "foreign_healthy": foreign_healthy,
            "foreign_id": control["id"] if control else None}


def native_job_case(gate, mode, control=None):
    """Prove exit-0 receipts and cancel-on-term using actual SYSTEM jobs.

    Run outside another gate. Each public --light request uses a genuine
    local Git origin, a real managed SYSTEM unit, and the maintained cancel CLI.
    No systemctl, systemd-run, SSH, Git or production function is replaced.
    """
    host = socket.gethostname().lower()
    host = {"desktop-18ir33v": "beelink1"}.get(host, host)
    assert host in ("beelink1", "beelink2"), "native integration requires a real Beelink"
    assert not os.environ.get("BEELINK_GATE_RUN"), "run native process cases outside another gate"
    with tempfile.TemporaryDirectory(prefix="gate-native-cancel-") as tmp:
        root = Path(tmp)
        origin = root / root.name / "repo"
        origin.mkdir(parents=True)
        subprocess.run(["git", "init", "-q", str(origin)], check=True)
        tree = subprocess.check_output(["git", "-C", str(origin), "mktree"], input="", text=True).strip()
        sha = subprocess.check_output(["git", "-C", str(origin), "commit-tree", tree],
                                      input="native cancellation integration\n", text=True).strip()
        subprocess.run(["git", "-C", str(origin), "update-ref", "HEAD", sha], check=True)
        env = {k: v for k, v in os.environ.items()
               if not k.startswith(("BEELINK_GATE_", "BASH_FUNC_")) and
               k not in ("BASH_ENV", "SHELLOPTS", "BASHOPTS")}
        env.update(BEELINK_GATE_LOAD_WAIT="30s", BEELINK_GATE_MAX_HOLD="90s")
        # Keep SYSTEM jobs and their receipts in the real owner's state store;
        # schedule_cancellation runs independently under the user manager.
        state_assignment = next(line for line in gate.read_text().splitlines()
                                if line.startswith("STATE_DIR="))
        state = Path(subprocess.check_output(
            ["bash", "-c", state_assignment + '\nprintf "%s" "$STATE_DIR"'], env=env, text=True))
        command = r'''
trap 'printf "terminal\n" > "$1/native-terminal"' EXIT
printf 'ready\n' > "$1/native-ready"
while :; do printf 'native gate output\n'; sleep 0.05; done
'''
        positive = mode.startswith("native-pass")
        if positive:
            command = r'''
set -euo pipefail
printf 'ready\n' > "$1/native-ready"
if [ "$2" = native-pass-observation ]; then
  mkdir -p .turbo/runs
  printf 'not JSON\n' > .turbo/runs/unreadable.json
fi
echo CHECK_ONE_EXIT=0
echo CHECK_TWO_EXIT=0
echo ALL_REMAINING_CHECKS_EXIT=0
exit 0
'''
        retry_term = mode == "native-retry-term"
        if retry_term:
            command = r'''
printf 'ready\n' > "$1/native-ready"
echo "beelink-gate: TEMPFAIL next_allowed=2099-01-01T00:00:00Z retry integration" >&2
exit 75
'''
        ssh_case = mode in ("native-lost-ssh", "native-pid-term", "native-attach-term", "native-wrapper-term", "native-global-deadline", "native-wrapper-handoff-term")
        if ssh_case:
            env["BEELINK_GATE_SELF"] = "beelink2" if host == "beelink1" else "beelink1"
            command = r'''
printf 'ready\n' > "$1/native-ready"
while [ ! -f "$1/release" ]; do sleep 0.05; done
exit 0
'''
        if mode == "native-foreign-id-refusal":
            assert control and foreign_is_healthy(control)
            # Deliberately hostile COMMAND output must not grant authority to
            # attach to or cancel this independent actual healthy job.
            command = ('printf "ready\\n" > "$1/native-ready"\n'
                       + 'echo "beelink-gate: TEMPFAIL next_allowed=2099-01-01T00:00:00Z run beelink-gate --attach '
                       + control["id"] + '" >&2\nexit 75\n')
        payload = mode.startswith("native-pass-payload")
        product = ["/usr/bin/bash", "-lc" if positive else "-c", command,
                   "native-job", str(root), mode]
        if payload:
            # Use the real Windows SSH -> WSL route back to this same Beelink,
            # so the fixture Git origin stays accessible to the actual job.
            # SELF only controls transport selection; no executable is replaced.
            env["BEELINK_GATE_SELF"] = "beelink2" if host == "beelink1" else "beelink1"
            length = 5902 if mode.endswith("boundary") else 120000
            command = ("from pathlib import Path\n" +
                       f"Path({str(root / 'native-ready')!r}).write_text('ready\\n')\n" +
                       "print('ALL_REMAINING_CHECKS_EXIT=0', flush=True)\n# ")
            command += ("quotes '\" $ backticks ` tabs\t " * length)[:length - len(command)]
            assert len(command.encode()) == length
            assert mode.endswith("boundary") or len(base64.b64encode(command.encode())) > 131072
            product = ["python3", "-c", command]
        tty_case = mode == "native-pass-tty"
        if tty_case:
            assert os.isatty(0) and os.tcgetpgrp(0) == os.getpgrp(), "launch this case through script(1) on a real PTY"
            env["BEELINK_GATE_SELF"] = "beelink2" if host == "beelink1" else "beelink1"
        retry_options = ["--retry", "10"] if retry_term else ["--retry", "1"] if mode in ("native-wrapper-term", "native-global-deadline", "native-wrapper-handoff-term", "native-foreign-id-refusal") else []
        proc = subprocess.Popen(
            ["bash", str(gate.resolve()), "--light", "--pin-host", "--cancel-on-term", *retry_options, host,
             "file://" + str(origin), sha, "--", *product], env=env, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, start_new_session=not tty_case,
            preexec_fn=os.setpgrp if tty_case else None)
        frontends = [proc]
        gate_id = ""
        job = None
        output = bytearray()
        os.set_blocking(proc.stdout.fileno(), False)

        def native_alive():
            try:
                pid, birth = (job / "gate.pid").read_text().split()
                fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
                return fields[19] == birth and fields[0] not in ("Z", "X")
            except (FileNotFoundError, ProcessLookupError):
                return False

        def unit_active():
            result = subprocess.run(
                ["systemctl", "show", "beelink-gate-" + gate_id + ".service",
                 "-p", "ActiveState", "--value"], capture_output=True, text=True, timeout=4)
            return result.returncode == 0 and result.stdout.strip() in (
                "active", "activating", "reloading", "deactivating")

        try:
            deadline = time.monotonic() + 90
            while not (root / "native-ready").exists():
                try:
                    output.extend(os.read(proc.stdout.fileno(), 65536))
                except BlockingIOError:
                    pass
                match = re.search(rb"gate_id=(beelink[12]-[0-9a-f]{32})", output)
                if match:
                    gate_id = match[1].decode()
                assert proc.poll() is None and time.monotonic() < deadline, "native job never reached its real command"
                time.sleep(0.05)
            if not gate_id:
                try:
                    output.extend(os.read(proc.stdout.fileno(), 65536))
                except BlockingIOError:
                    pass
                match = re.search(rb"gate_id=(beelink[12]-[0-9a-f]{32})", output)
                gate_id = match[1].decode() if match else ""
            assert gate_id, "frontend did not publish its exact allocated gate ID"
            job = state / "jobs" / gate_id
            assert (job / "systemd-manager").read_text() == "system\n"
            source_digest = hashlib.sha256((job / "gate.sh").read_bytes()).hexdigest()
            frontend = read_frontend(output)
            assert frontend and frontend["source_digest"] == source_digest, "frontend/staged source mismatch"
            if mode == "native-foreign-id-refusal":
                tail, _ = proc.communicate(timeout=15)
                output.extend(tail)
                healthy = foreign_is_healthy(control)
                return {"case": mode, "passed": proc.returncode == 75 and healthy
                        and b"retry attachment custody unconfirmed" in output
                        and (job / "exit").read_text().strip() == "75",
                        "gate_id": gate_id, "frontend_exit": proc.returncode,
                        "foreign_id": control["id"], "foreign_healthy": healthy,
                        "source_digest": source_digest}
            if ssh_case:
                proc, row = exercise_ssh_case(gate, mode, proc, host, root, state, job,
                    gate_id, output, env, frontends, source_digest, native_alive, unit_active, control)
                return row
            if retry_term:
                # Wait for the actual owned sleep, not merely the preceding log.
                sleeper = None
                deadline = time.monotonic() + 20
                while sleeper is None and time.monotonic() < deadline:
                    try:
                        output.extend(os.read(proc.stdout.fileno(), 65536))
                    except BlockingIOError:
                        pass
                    children = Path(f"/proc/{proc.pid}/task/{proc.pid}/children").read_text().split()
                    for pid in children:
                        try:
                            argv = Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0")
                            if argv[0] == b"sleep" and float(argv[1]) >= 30:
                                sleeper = int(pid)
                        except (FileNotFoundError, ProcessLookupError):
                            pass
                    if sleeper is None:
                        time.sleep(0.05)
                assert sleeper is not None, "frontend never reached a real between-attempt retry sleep"
                assert (job / "exit").read_text().strip() == "75" and not native_alive() and not unit_active()
                term_at = time.monotonic()
                proc.send_signal(signal.SIGTERM)
                tail, _ = proc.communicate(timeout=8)
                output.extend(tail)
                elapsed = time.monotonic() - term_at
                sleeper_reaped = not Path(f"/proc/{sleeper}").exists()
                terminal = (job / "exit").read_text().strip() == "75" and not native_alive() and not unit_active()
                return {"case": mode, "passed": proc.returncode == 143 and elapsed < 8 and sleeper_reaped and terminal,
                        "gate_id": gate_id, "frontend_exit": proc.returncode, "term_elapsed_s": round(elapsed, 3),
                        "retry_sleeper_reaped": sleeper_reaped, "native_exit": 75, "native_confirmed_terminal": terminal}
            if positive:
                tail, _ = proc.communicate(timeout=60)
                output.extend(tail)
                receipt = json.loads((job / "receipt.json").read_text())
                exit_code = int((job / "exit").read_text())
                admission_exit = (receipt["timing"]["admission_wait"] or {}).get("exit")
                unreadable = receipt["timing"]["turbo_cache"]["unreadable"]
                payload_intact = True
                payload_info = {}
                if payload:
                    args_file = job / "args"
                    stored = args_file.read_bytes().split(b"\0")
                    actual = base64.b64decode(stored[-2])
                    expected_hash = hashlib.sha256(command.encode()).hexdigest()
                    actual_hash = hashlib.sha256(actual).hexdigest()
                    submit_bytes = len(b"--job-submit " + gate_id.encode() + b" " + b" ".join(stored[:-1]))
                    boundary_valid = not mode.endswith("boundary") or submit_bytes <= 8192
                    payload_intact = (actual_hash == expected_hash and boundary_valid and
                                      args_file.stat().st_mode & 0o777 == 0o600)
                    payload_info = {"payload_bytes": len(actual), "expected_sha256": expected_hash,
                                    "received_sha256": actual_hash, "submit_argument_bytes": submit_bytes, "args_mode": oct(args_file.stat().st_mode & 0o777),
                                    "transport": "ssh Windows wsl.exe (same physical Beelink)"}
                return {"case": mode, "passed": payload_intact and proc.returncode == exit_code == receipt["exit"] ==
                        receipt.get("command_exit") == receipt.get("post_command_exit") == admission_exit == 0
                        and b"ALL_REMAINING_CHECKS_EXIT=0" in output
                        and (mode != "native-pass-observation" or unreadable == 1),
                        "gate_id": gate_id, "frontend_exit": proc.returncode, "exit_file": exit_code,
                        "receipt_exit": receipt["exit"], "command_exit": receipt.get("command_exit"),
                        "post_command_exit": receipt.get("post_command_exit"),
                        "admission_wait_exit": admission_exit, "unreadable_observations": unreadable, **payload_info}
            assert native_alive() and unit_active(), "no independent live SYSTEM job"
            # The native command writes to its retained log, independent of the
            # frontend's pipe and process group. It stops only through cancel-job.
            proc.stdout.close()
            if mode == "cancel-group-term":
                os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=12)
            except subprocess.TimeoutExpired:
                return {"case": mode, "passed": False, "gate_id": gate_id,
                        "reason": "frontend survived closed stdout / group TERM"}
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline and (native_alive() or unit_active()):
                time.sleep(0.1)
            canceled = (state / "jobs/.canceled" / gate_id).exists()
            terminal = (job / "exit").exists()
            stopped = not native_alive() and not unit_active()
            return {"case": mode, "passed": proc.returncode != 0 and canceled and terminal and stopped,
                    "frontend_exit": proc.returncode, "gate_id": gate_id,
                    "manager": "system", "canceled": canceled,
                    "native_terminal": terminal, "native_stopped": stopped}
        finally:
            for frontend in frontends:
                if frontend.poll() is None:
                    os.killpg(frontend.pid, signal.SIGTERM)
                    try:
                        frontend.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        os.killpg(frontend.pid, signal.SIGKILL)
                        frontend.wait(timeout=3)
                if frontend.stdout is not None:
                    frontend.stdout.close()
            # The red baseline must not leave the independently managed unit
            # running. Retire it only through the maintained exact-ID cancel CLI.
            if gate_id:
                cleanup = subprocess.run(["bash", str(gate.resolve()), "--cancel-job", gate_id],
                                         env=env, capture_output=True, text=True, timeout=330)
                assert cleanup.returncode == 0, "maintained fixture cancellation was not confirmed: " + cleanup.stderr


class NativePeer:
    """File and process observations for one real native fixture, over SSH."""
    def __init__(self, host):
        self.host = host
        self.ip = {"beelink1": "100.98.195.7", "beelink2": "100.127.22.51"}[host]
        self.nonce = uuid.uuid4().hex
        self.root = None

    def call(self, body, data=None):
        script = "python3 - <<'NATIVE_PEER_PY'\nimport json,os,pathlib,sys\ndata=" + repr(data or {}) + "\n" + body + "\nNATIVE_PEER_PY\n"
        result = subprocess.run(["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
            "-o", "ConnectTimeout=10", self.ip, "wsl.exe", "--", "bash", "-s"],
            input=script, capture_output=True, text=True, timeout=25)
        if result.returncode:
            raise RuntimeError(f"native observation transport exit={result.returncode}: {result.stderr[-1000:]}")
        return json.loads(result.stdout)

    def stage(self, origin):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode="w") as archive:
            archive.add(origin, arcname="origin")
        result = self.call('''
import base64,io,tarfile
root=pathlib.Path.home()/'.local/state/agent-work/pr680-acceptance'/data['nonce']
root.mkdir(parents=True,mode=0o700)
with tarfile.open(fileobj=io.BytesIO(base64.b64decode(data['archive']))) as archive:
    archive.extractall(root,filter='data')
print(json.dumps({'root':str(root),'origin':str(root/'origin')}))
''', {"nonce": self.nonce, "archive": base64.b64encode(stream.getvalue()).decode()})
        self.root = result["root"]
        return result["origin"]

    def observe(self, gate_id):
        return self.call('''
import hashlib,re,base64
root=pathlib.Path(data['root'])
state=pathlib.Path(os.environ.get('BEELINK_GATE_STATE_DIR') or pathlib.Path(os.environ.get('XDG_STATE_HOME',str(pathlib.Path.home()/'.local/state')))/'beelink-gate')
result={'ready':(root/'ready').exists(),'state':str(state),'alive':False,'exit':None,'receipt':None,'canceled':False,'unit_populated':None}
cache=pathlib.Path(os.environ.get('BEELINK_GATE_CACHE_ROOT') or pathlib.Path(os.environ.get('XDG_CACHE_HOME',str(pathlib.Path.home()/'.cache')))/'beelink-gate')
result['tickets']=[]
for ticket in (cache/'.locks').glob('queue-local-'+root.name+'-origin@light.*'):
    try:
        with ticket.open('rb') as stream:
            raw=stream.read(); info=os.fstat(stream.fileno())
        if b'start=' in raw:
            result['tickets'].append({'name':ticket.name,'inode':info.st_ino,'body_sha256':hashlib.sha256(raw).hexdigest()})
    except FileNotFoundError: pass
gate=data['gate']
if gate:
    assert re.fullmatch(r'beelink[12]-[0-9a-f]{32}',gate)
    job=state/'jobs'/gate
    for name,key in [('exit','exit'),('receipt.json','receipt')]:
        try: result[key]=json.loads((job/name).read_text())
        except FileNotFoundError: pass
    try:
        pid,birth=(job/'gate.pid').read_text().split()
        fields=pathlib.Path('/proc/'+pid+'/stat').read_text().rsplit(')',1)[1].split()
        result.update(pid=int(pid),birth=birth,alive=fields[19]==birth and fields[0] not in ('Z','X'))
    except FileNotFoundError: pass
    result['canceled']=(state/'jobs/.canceled'/gate).exists()
    try: result['source_digest']=hashlib.sha256((job/'gate.sh').read_bytes()).hexdigest()
    except FileNotFoundError: pass
    try:
        args=job/'args'
        result['payload_digest']=hashlib.sha256(base64.b64decode(args.read_bytes().split(bytes([0]))[-2])).hexdigest()
        result['args_mode']=args.stat().st_mode & 0o777
    except FileNotFoundError: pass
    except (IndexError,ValueError): result['payload_error']='incomplete_args_publication'
    group=(result['receipt'] or {}).get('cgroup')
    if group and group.endswith('/beelink-gate-'+gate+'.service') and '..' not in pathlib.PurePosixPath(group).parts:
        try:
            events=dict(line.split() for line in (pathlib.Path('/sys/fs/cgroup')/group.lstrip('/')/'cgroup.events').read_text().splitlines())
            if events.get('populated') in ('0','1'): result['unit_populated']=events['populated']=='1'
        except FileNotFoundError: result['unit_populated']=False
print(json.dumps(result))
''', {"root": self.root, "gate": gate_id})

    def release(self):
        return self.call("(pathlib.Path(data['root'])/'release').touch(); print('{}')", {"root": self.root})


def gtr_case(gate, host, mode, directory):
    """GTR only launches the public CLI; every command runs in a normal gate."""
    assert socket.gethostname().lower() not in ("beelink1", "beelink2", "desktop-18ir33v")
    assert mode in ('native-pass','native-command-failure','native-command-255','native-command-75',
        'native-pass-payload-large','native-lost-ssh','native-pid-term','native-attach-term',
        'native-wrapper-term','native-global-deadline','native-pass-tty',
        'native-reservation-lifetime','native-reservation-failure'), 'unsupported GTR case'
    peer = NativePeer(host)
    env = {k: v for k, v in os.environ.items() if not k.startswith(("BEELINK_GATE_", "BASH_FUNC_"))
           and k not in ("BASH_ENV", "SHELLOPTS", "BASHOPTS")}
    env.update(BEELINK_GATE_LOAD_WAIT="30s", BEELINK_GATE_MAX_HOLD="90s")
    log = directory / (mode + ".log")
    gate_id, observation, proc, saved = "", {}, None, []
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="gate-origin-") as temporary:
        origin = Path(temporary) / Path(temporary).name / "repo"
        origin.mkdir(parents=True)
        subprocess.run(["git", "init", "-q", str(origin)], check=True)
        tree = subprocess.check_output(["git", "-C", str(origin), "mktree"], input="", text=True).strip()
        sha = subprocess.check_output(["git", "-C", str(origin), "commit-tree", tree], input="GTR control-plane fixture\n", text=True).strip()
        subprocess.run(["git", "-C", str(origin), "update-ref", "HEAD", sha], check=True)
        native_origin = peer.stage(origin)
        reservation = mode in ('native-reservation-lifetime','native-reservation-failure')
        peers = {host:peer}
        if reservation:
            other_host='beelink2' if host=='beelink1' else 'beelink1'
            other=NativePeer(other_host); other.nonce=peer.nonce
            assert other.stage(origin)==native_origin, 'native fixture paths differ'
            peers[other_host]=other
        controlled = mode in ("native-lost-ssh", "native-pid-term", "native-attach-term", "native-wrapper-term", "native-global-deadline")
        command_exit = {"native-command-failure":7,"native-command-255":255,"native-command-75":75}.get(mode, 0)
        code = ("import pathlib,time,sys,os\np=pathlib.Path(" + repr(peer.root) + ")\n(p/'ready').touch()\n" +
                ("while not (p/'release').exists(): time.sleep(.05)\n" if controlled else "") +
                "print('ALL_REMAINING_CHECKS_EXIT=" + str(command_exit) + "',flush=True)\nsys.exit(" + str(command_exit) + ")\n")
        if mode == "native-pass-payload-large":
            code += "# " + ("quotes '\" $ ` tabs\t " * 10000)[:120000-len(code)-2]
            assert len(code.encode()) == 120000 and len(base64.b64encode(code.encode())) > 131072
        retry = ["--retry", "1"] if mode in ("native-wrapper-term", "native-global-deadline") else []
        requested_sha='f'*40 if mode=='native-reservation-failure' else sha
        argv = ["bash", str(gate.resolve()), "--light", "--no-install", *([] if reservation else ['--pin-host']), "--cancel-on-term", *retry,
                'auto' if reservation else host, "file://" + native_origin, requested_sha, "--", "python3", "-c", code]
        if mode == "native-pass-tty":
            # The CLI is in a background process group of a real controlling PTY.
            # A policy SSH that reads that TTY is stopped by SIGTTIN.
            shell = "set -m; " + shlex.join(argv) + " </dev/tty & child=$!; wait $child; exit $?"
            argv = ["script", "-q", "-e", "-c", "bash -c " + shlex.quote(shell), "/dev/null"]
        result = {"case": mode, "host":host, "caller":socket.gethostname(), "passed":False}
        try:
            with log.open("w") as output:
                proc = subprocess.Popen(argv, env=env, stdout=output, stderr=output, start_new_session=True)
                saved.append(proc)
                tickets = {}; ticket_samples=[]
                while time.monotonic()-started < 60:
                    text = log.read_text()
                    frames = re.findall(r"frontend_observation=(\S+)", text)
                    frame = json.loads(Path(frames[0]).read_text()) if frames else None
                    if frame and frame['placements']:
                        gate_id=frame['placements'][-1]['gate_id']
                        if reservation: peer=peers[gate_id.split('-')[0]]
                    observation=peer.observe(gate_id)
                    if reservation:
                        def snapshot(item): return item[0],item[1].observe('')['tickets']
                        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                            snapshots=dict(pool.map(snapshot,peers.items()))
                        stops=bool(frames and any(Path(frames[0]).parent.glob('reservations.*/*.stop')))
                        handed_off=bool(gate_id and 'beelink-gate: placement handoff gate_id='+gate_id in log.read_text().splitlines())
                        authorized=observation['exit'] is not None or observation['ready'] or handed_off
                        assert not stops or authorized, 'reservation stop preceded an owner-bound handoff or native terminal outcome'
                        if not authorized:
                            for name,current in snapshots.items():
                                if current and name not in tickets: tickets[name]=current
                                if name in tickets:
                                    assert current==tickets[name], 'reservation changed or retired before owned handoff'
                        ticket_samples.append({'at_monotonic':time.monotonic(),'tickets':snapshots,'stopped':stops,
                            'owner_handoff':handed_off,'native_terminal':observation['exit'] is not None})
                    if observation['ready']: break
                    if proc.poll() is not None:
                        if mode=='native-reservation-failure' and gate_id and observation['exit'] is not None:
                            assert len(tickets)==2, 'both real reservations were not observed'
                            assert proc.returncode!=0 and observation['receipt']['command_exit'] is None
                            assert 'placement handoff gate_id='+gate_id not in text
                            final_tickets={name:p.observe('')['tickets'] for name,p in peers.items()}
                            assert not any(final_tickets.values()), 'native reservations survived terminal refusal'
                            result.update(passed=True,gate_id=gate_id,frontend_exit=proc.returncode,native=observation,
                                ticket_samples=ticket_samples,initial_tickets=tickets,final_tickets=final_tickets)
                            return result
                        result.update(infrastructure=True,reason="native admission/transport refused before command",frontend_exit=proc.returncode)
                        return result
                    time.sleep(.2)
                assert observation.get('ready'), "finite first-command bound expired"
                assert gate_id and frame['source_digest']==observation['source_digest'], "native source/frame mismatch"
                if reservation:
                    assert len(tickets)==2, 'both real reservations were not observed'
                    assert 'placement handoff gate_id='+gate_id in log.read_text()
                native_peer = actual_ssh_peer(proc,host) if controlled else None
                first_exit = None
                if mode in ("native-lost-ssh", "native-attach-term", "native-global-deadline"):
                    if mode != "native-global-deadline":
                        assert native_peer and process_identity(native_peer['pid'])['birth']==native_peer['birth']
                        os.kill(native_peer['pid'],signal.SIGTERM)
                    proc.wait(timeout=75 if mode == "native-global-deadline" else 15)
                    first_exit=proc.returncode
                    if mode=='native-global-deadline':
                        final_frame=json.loads(Path(frames[0]).read_text())
                        assert 58 <= (final_frame['end_ns']-final_frame['start_ns'])/1e9 <= 75
                    observation=peer.observe(gate_id)
                    assert first_exit==75 and observation['alive'] and not observation['canceled'], "transport/deadline canceled live native leaf"
                    opts=['--cancel-on-term'] if mode=='native-attach-term' else []
                    proc=subprocess.Popen(['bash',str(gate.resolve()),*opts,'--attach',gate_id],env=env,stdout=output,stderr=output,start_new_session=True)
                    saved.append(proc)
                    deadline=time.monotonic()+10
                    while actual_ssh_peer(proc,host) is None:
                        assert time.monotonic()<deadline, "no actual GTR reconnect SSH peer"
                        time.sleep(.05)
                term_elapsed=None
                if mode in ('native-pid-term','native-attach-term','native-wrapper-term'):
                    assert actual_ssh_peer(proc,host), "no actual owned Windows SSH peer"
                    term_at=time.monotonic(); proc.send_signal(signal.SIGTERM); proc.wait(timeout=10)
                    term_elapsed=time.monotonic()-term_at
                elif controlled:
                    peer.release()
                proc.wait(timeout=20)
                deadline=time.monotonic()+30
                while time.monotonic()<deadline:
                    observation=peer.observe(gate_id)
                    if observation['exit'] is not None and not observation['alive'] and observation['unit_populated'] is False: break
                    time.sleep(.1)
                assert observation['exit'] is not None and not observation['alive'] and observation['unit_populated'] is False, "native leaf/cgroup drain unproved"
                canceled=mode in ('native-pid-term','native-attach-term','native-wrapper-term')
                assert proc.returncode==(143 if canceled else command_exit)
                if not canceled:
                    assert observation['exit']==observation['receipt']['exit']==observation['receipt']['command_exit']==command_exit
                    assert not observation['canceled']
                else:
                    assert observation['canceled']
                if mode=='native-pass-payload-large':
                    assert observation['payload_digest']==hashlib.sha256(code.encode()).hexdigest() and observation['args_mode']==0o600
                if mode=='native-pass-tty':
                    assert 'windows_policy_ssh result=command_zero exit=0' in log.read_text(), 'TTY policy read did not actually succeed'
                result.update(passed=True,gate_id=gate_id,frontend_exit=proc.returncode,first_frontend_exit=first_exit,
                    term_elapsed_s=term_elapsed,native=observation,ssh_peer=native_peer,source_digest=frame['source_digest'],
                    ticket_samples=ticket_samples,initial_tickets=tickets)
                return result
        except Exception as error:
            result.update(error=str(error),gate_id=gate_id,native=observation)
            return result
        finally:
            cleanup={}
            if not gate_id:
                try:
                    current=read_frontend(log.read_bytes())
                    if current and current['placements'] and current['placements'][-1]['association'] in ('created','reattached'):
                        gate_id=current['placements'][-1]['gate_id']
                except (OSError,ValueError,KeyError) as error:
                    cleanup['custody_unknown']=str(error)
            if gate_id:
                try:
                    peer.release()
                    finished=subprocess.run(['bash',str(gate.resolve()),'--cancel-job',gate_id],env=env,capture_output=True,text=True,timeout=330)
                    cleanup['cancel_exit']=finished.returncode
                    cleanup['native']=peer.observe(gate_id)
                    if finished.returncode or cleanup['native']['alive'] or cleanup['native']['unit_populated'] is not False: result['passed']=False
                except Exception as error:
                    cleanup['unknown']=str(error); result['passed']=False
            for frontend in saved:
                if frontend.poll() is None:
                    frontend.send_signal(signal.SIGTERM)
                    try: frontend.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        cleanup['frontend_unknown']=frontend.pid; result['passed']=False
            result.update(cleanup=cleanup,elapsed_s=time.monotonic()-started,log=str(log),native_fixture=peer.root)
            (directory/(mode+'.json')).write_text(json.dumps(result,indent=2)+'\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gate", type=Path, default=GATE)
    parser.add_argument("--host", choices=["beelink1", "beelink2"], help="GTR control-plane caller; workloads stay native-gated")
    parser.add_argument("--out", type=Path, help="private acceptance receipts")
    parser.add_argument("--case", choices=["native-pass", "native-pass-observation",
        "native-pass-payload-boundary", "native-pass-payload-large", "native-retry-term",
        "native-lost-ssh", "native-pid-term", "native-attach-term", "native-wrapper-term", "native-wrapper-handoff-term", "native-foreign-id-refusal", "native-global-deadline", "native-pass-tty",
        "failure-cleanup-term", "pass-cleanup-term",
        "native-command-failure", "native-command-255", "native-command-75", "native-reservation-lifetime", "native-reservation-failure",
        "cancel-group-term", "cancel-stdout-pipe"], action="append")
    args = parser.parse_args()
    if args.host:
        assert args.out, '--out is required for GTR acceptance'
        def stop_controller(signum, frame):
            raise KeyboardInterrupt('owned acceptance stop requested')
        signal.signal(signal.SIGTERM, stop_controller)
        signal.signal(signal.SIGHUP, stop_controller)
        args.out.mkdir(parents=True,exist_ok=True)
        modes=args.case or ['native-pass','native-command-failure','native-command-255','native-command-75',
            'native-pass-payload-large','native-lost-ssh','native-pid-term','native-attach-term',
            'native-wrapper-term','native-global-deadline','native-pass-tty','native-reservation-lifetime','native-reservation-failure']
        rows=[]; began=time.monotonic()
        for mode in modes:
            assert time.monotonic()-began<1200, 'global acceptance bound reached'
            row=gtr_case(args.gate,args.host,mode,args.out); rows.append(row)
            (args.out/'summary.json').write_text(json.dumps({'cases':rows,'passed':sum(r['passed'] for r in rows),'total':len(rows)},indent=2)+'\n')
            if not row['passed']: break
        print(json.dumps({'cases':rows,'passed':sum(r['passed'] for r in rows),'total':len(rows)},indent=2))
        raise SystemExit(0 if len(rows)==len(modes) and all(r['passed'] for r in rows) else 75 if rows[-1].get('infrastructure') else 1)
    rows = []
    for mode in args.case or [
        "native-pass", "native-pass-observation", "native-pass-payload-boundary",
        "native-pass-payload-large", "native-retry-term", "native-lost-ssh", "native-pid-term",
        "native-attach-term", "native-wrapper-term", "native-wrapper-handoff-term", "native-foreign-id-refusal", "native-global-deadline", "failure-cleanup-term", "pass-cleanup-term",
        "cancel-group-term", "cancel-stdout-pipe"]:
        if mode in ("native-wrapper-handoff-term", "native-foreign-id-refusal"):
            with foreign_control(args.gate) as control:
                rows.append(native_job_case(args.gate, mode, control))
        else:
            rows.append(native_cleanup_case(args.gate, mode) if mode.endswith("cleanup-term") else native_job_case(args.gate, mode))
    print(json.dumps({"bash": subprocess.check_output(["bash", "--version"], text=True).splitlines()[0],
                      "cases": rows, "passed": sum(row["passed"] for row in rows),
                      "total": len(rows)}, indent=2))
    raise SystemExit(0 if all(row["passed"] for row in rows) else 1)


if __name__ == "__main__":
    main()
