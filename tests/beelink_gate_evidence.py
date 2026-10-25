"""Shared real-process observations and private receipts for CLI integration."""
import base64
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import time
import traceback


def process_identity(pid):
    try:
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        return {"pid": int(pid), "birth": fields[19], "state": fields[0]}
    except (FileNotFoundError, ProcessLookupError):
        return None


def observe_leaf(state, gate_id):
    assert re.fullmatch(r"beelink[12]-[0-9a-f]{32}", gate_id)
    job = Path(state) / "jobs" / gate_id
    result = dict(alive=None, exit=None, receipt=None, unit_active=None,
                  unit_populated=None, drained=False, live=False, errors=[])
    for name, key in (("exit", "exit"), ("receipt.json", "receipt")):
        try:
            result[key] = json.loads((job / name).read_text())
        except FileNotFoundError:
            pass
        except (OSError, ValueError) as error:
            result["errors"].append(f"{name}: {error}")
    if result["exit"] is not None and (type(result["exit"]) is not int or not 0 <= result["exit"] <= 255):
        result["exit"] = None
        result["errors"].append("invalid native exit")
    if result["receipt"] is not None and not isinstance(result["receipt"], dict):
        result["receipt"] = None
        result["errors"].append("invalid native receipt")
    try:
        pid, birth = (job / "gate.pid").read_text().split()
        pid = int(pid)
        if pid <= 0 or not birth.isdecimal():
            raise ValueError("invalid native process identity")
        actual = process_identity(pid)
        result.update(pid=int(pid), birth=birth, process=actual,
                      alive=bool(actual and actual["birth"] == birth and actual["state"] not in ("Z", "X")))
    except (OSError, ValueError) as error:
        result["errors"].append(f"process identity: {error}")
    try:
        (job.parent / ".canceled" / gate_id).stat()
        result["canceled"] = True
    except FileNotFoundError:
        result["canceled"] = False
    except OSError as error:
        result["canceled"] = None
        result["errors"].append(f"cancellation marker: {error}")
    for name, key in (("gate.sh", "source_digest"),):
        try:
            result[key] = hashlib.sha256((job / name).read_bytes()).hexdigest()
        except OSError as error:
            result["errors"].append(f"{name}: {error}")
    try:
        args = job / "args"
        result["payload_digest"] = hashlib.sha256(base64.b64decode(args.read_bytes().split(bytes([0]))[-2])).hexdigest()
        result["args_mode"] = args.stat().st_mode & 0o777
    except (OSError, ValueError, IndexError) as error:
        result["errors"].append(f"args: {error}")
    unit = "beelink-gate-" + gate_id + ".service"
    manager = {}
    try:
        read = subprocess.run(["systemctl", "show", unit, "-p", "LoadState", "-p", "ActiveState", "-p", "ControlGroup"],
                              capture_output=True, text=True, timeout=4)
        manager = dict(line.split("=", 1) for line in read.stdout.splitlines() if "=" in line)
        result["manager"] = dict(exit=read.returncode, fields=manager, stderr=read.stderr)
        if read.returncode == 0 and manager.get("LoadState") in ("loaded", "not-found"):
            active = manager.get("ActiveState")
            if active in ("active", "activating", "reloading", "deactivating"):
                result["unit_active"] = True
            elif active in ("inactive", "failed"):
                result["unit_active"] = False
    except (OSError, subprocess.TimeoutExpired) as error:
        result["errors"].append(f"systemd: {error}")
    groups = {(result["receipt"] or {}).get("cgroup"), manager.get("ControlGroup")}
    groups.discard(None); groups.discard("")
    try:
        events = []
        if not groups and result["unit_active"] is False:
            base = Path("/sys/fs/cgroup/beelinkgate.slice")
            groups = {str(p / unit) for p in base.iterdir() if stat.S_ISDIR(p.stat().st_mode)}
        for group in groups:
            path = Path(group)
            if path.name != unit or ".." in path.parts:
                raise ValueError("unbound native cgroup")
            path = path if str(path).startswith("/sys/fs/cgroup/") else Path("/sys/fs/cgroup") / str(path).lstrip("/")
            try:
                values = dict(line.split() for line in (path / "cgroup.events").read_text().splitlines())
                if values.get("populated") not in ("0", "1"):
                    raise ValueError("missing kernel populated observation")
                events.append(values["populated"] == "1")
            except FileNotFoundError:
                events.append(False)
        if events:
            result["unit_populated"] = any(events)
    except (OSError, ValueError) as error:
        result["errors"].append(f"kernel cgroup: {error}")
    result["drained"] = (result["exit"] is not None and result["alive"] is False
                         and result["unit_active"] is False and result["unit_populated"] is False)
    actual = result.get("process") or {}
    result["live"] = (result["alive"] is True and actual.get("state") not in ("T", "t")
                      and result["unit_active"] is True and result["unit_populated"] is True
                      and result["canceled"] is False and result["exit"] is None)
    return result


def wait_drained(state, gate_id, seconds=30):
    deadline = time.monotonic() + seconds
    while True:
        row = observe_leaf(state, gate_id)
        if row["drained"] or time.monotonic() >= deadline:
            return row
        time.sleep(0.1)


def record_result(record, row):
    record["result"] = row
    return row


def cleanup_owned(gate, env, state, gate_id, record):
    row = record.setdefault("cleanup", {})
    if "result" in record:
        record["result"]["cleanup"] = row
    try:
        command = subprocess.run(["bash", str(gate.resolve()), "--cancel-job", gate_id], env=env,
                                 capture_output=True, text=True, timeout=330)
        row.update(gate_id=gate_id, cancel_exit=command.returncode,
                   stdout=command.stdout, stderr=command.stderr)
        row["native"] = wait_drained(state, gate_id)
        assert command.returncode == 0 and row["native"]["drained"], "exact native leaf/kernel drain unproved"
    except BaseException as error:
        row["error"] = f"{type(error).__name__}: {error}"
        raise


@contextlib.contextmanager
def retain_before_stop():
    previous = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGTERM, signal.SIGHUP, signal.SIGINT})
    try:
        yield
    finally:
        signal.pthread_sigmask(signal.SIG_SETMASK, previous)


@contextlib.contextmanager
def case_evidence(out, mode, root):
    directory = Path(out) / mode
    directory.mkdir(mode=0o700, parents=True, exist_ok=False)
    record = {"case": mode, "fixture": str(root), "started_monotonic": time.monotonic()}
    try:
        yield record
    except BaseException as error:
        record.update(error=f"{type(error).__name__}: {error}", traceback=traceback.format_exc())
        record.setdefault("result", {})["passed"] = False
        raise
    finally:
        # Only private evidence publication defers catchable stop signals. It
        # changes no cleanup authority, and the unit stop bound still applies.
        with retain_before_stop():
            raw = record.pop("output", b"")
            log = root / "frontend.log"
            try:
                if log.exists():
                    raw = log.read_bytes()
            except OSError as error:
                record["log_error"] = str(error)
            target = directory / "frontend.raw"
            target.write_bytes(bytes(raw)); target.chmod(0o600)
            paths = re.findall(rb"frontend_observation=([^\r\n]+)", raw)
            if paths:
                try:
                    target = directory / "frontend-frame.raw.json"
                    target.write_bytes(Path(os.fsdecode(paths[0])).read_bytes()); target.chmod(0o600)
                except OSError as error:
                    record["frame_error"] = str(error)
            else:
                record["frame_error"] = "no frontend marker observed"
            if record.get("gate_id"):
                try:
                    record["native_after_cleanup"] = observe_leaf(record["state"], record["gate_id"])
                    job = Path(record["state"]) / "jobs" / record["gate_id"]
                    for name in ("stdout.log", "stderr.log", "receipt.json", "gate.pid", "exit", "systemd-manager", "gate.sh", "args"):
                        try:
                            target = directory / ("native-" + name)
                            target.write_bytes((job / name).read_bytes()); target.chmod(0o600)
                        except OSError as error:
                            record.setdefault("native_file_errors", {})[name] = str(error)
                except Exception as error:
                    record["native_observation_error"] = str(error)
            incomplete = (record.get("log_error") or record.get("frame_error") or record.get("native_observation_error")
                          or set(record.get("native_file_errors", {})) - {"receipt.json"})
            if incomplete:
                record.setdefault("result", {})["passed"] = False
                record["evidence_incomplete"] = str(incomplete)
            record["ended_monotonic"] = time.monotonic()
            target = directory / "outcome.json"
            target.write_text(json.dumps(record, indent=2, default=str) + "\n"); target.chmod(0o600)
            if incomplete and "error" not in record:
                raise AssertionError("private case evidence incomplete: " + str(incomplete))
