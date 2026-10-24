"""Gate disk observations. Internal to the staged gate and its existing report.

Filesystem highwater is sampled host-wide, not an exact transient or attributable
per-gate peak. Directory bytes are bounded du checkpoints, never sampled peaks.
"""
from concurrent.futures import ThreadPoolExecutor
import copy
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import time


INTERVAL_S = 1.0
MAX_SAMPLE_GAP_S = INTERVAL_S * 1.5
DOCKER_QUERY_S = 1.0
# At most context/show+inspect+info+usage at each end, plus sampling wakeups.
STOP_GRACE_S = math.ceil(8 * DOCKER_QUERY_S + 2 * INTERVAL_S)
SCHEMA = 1


def effective_floor(host, limits):
    """Read lifecycle producer admission, independently of Fleet alert buffers; local limits may raise it."""
    if host not in ('beelink1', 'beelink2'):
        raise ValueError('unknown remote beelink')
    policy = Path('/usr/local/libexec/tangle-fleet-disk-policy.py')
    for parent in policy.parents:
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise ValueError('authoritative fleet disk policy ancestors are unprotected')
    info = policy.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('authoritative fleet disk policy is not a protected regular library')
    spec = importlib.util.spec_from_file_location('fleet_disk_policy', policy)
    owner = importlib.util.module_from_spec(spec)
    sys.dont_write_bytecode = True
    spec.loader.exec_module(owner)
    if owner.SCHEMA != 1:
        raise ValueError('authoritative fleet disk policy schema unknown')
    floor = owner.admission_floor_bytes(host, '/')
    if type(floor) is not int or floor <= 0:
        raise ValueError('authoritative storage admission floor unknown')
    limits = Path(limits)
    if limits.exists() or limits.is_symlink():
        if not limits.is_file():
            raise ValueError('invalid disk floor limits file')
        values = [line.partition('=')[2] for line in limits.read_text().splitlines()
                  if line.startswith('disk_floor_gib=')]
        if len(values) > 1 or values and not re.fullmatch(r'[0-9]{1,4}', values[0]):
            raise ValueError('invalid or duplicate disk_floor_gib')
        if values:
            override = int(values[0])
            if override > 1024:
                raise ValueError('invalid disk_floor_gib')
            local = override * 1024 ** 3
            if local < floor:
                print('beelink-gate: local disk limit is below the storage admission floor; using lifecycle policy', file=sys.stderr)
            floor = max(floor, local)
    return floor


def write_json(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, sort_keys=True) + "\n")
    temporary.replace(path)


def read_json(path):
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else None
    except (OSError, ValueError):
        return None


def scan(directory, phase, seconds, paths):
    """The gate's existing du, retaining its per-path rows as well as total."""
    began = time.monotonic()
    observation = {"source": "du_allocated_bytes", "phase": phase,
                   "paths": [{"path": path, "bytes": None, "status": "not_reported_by_du"} for path in paths],
                   "hardlinks": "counted once in argument order; shared stores include other gates",
                   "total_bytes": None, "error": None}
    try:
        result = subprocess.run(["du", "-s", "--total", "-B1", "--", *paths],
                                capture_output=True, text=True, timeout=seconds,
                                env=dict(os.environ, LC_ALL="C"))
        # Preserve the previous owner's allowance for files vanishing mid-scan.
        vanished = all(re.fullmatch(r"du: cannot access .*: No such file or directory", line)
                       for line in result.stderr.splitlines())
        valid = result.returncode == 0 or result.returncode == 1 and vanished
        if valid:
            for line in result.stdout.splitlines():
                size, separator, path = line.partition("\t")
                if not separator or not size.isdigit():
                    continue
                if path == "total":
                    observation["total_bytes"] = int(size)
                else:
                    for entry in observation["paths"]:
                        if entry["path"] == path:
                            entry.update(bytes=int(size), status="measured")
        if not valid or observation["total_bytes"] is None:
            observation["error"] = "du_unreadable"
    except subprocess.TimeoutExpired:
        observation["error"] = "du_timeout"
    except OSError:
        observation["error"] = "du_unavailable"
    observation["duration_ms"] = round((time.monotonic() - began) * 1000)
    if directory:
        write_json(Path(directory) / (phase + ".json"), observation)
    if observation["error"]:
        return 1
    print(observation["total_bytes"])
    return 0


def docker_query(arguments):
    try:
        result = subprocess.run(["docker", *arguments], capture_output=True, text=True,
                                timeout=DOCKER_QUERY_S, stdin=subprocess.DEVNULL)
        return result.stdout.strip() if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def docker_identity():
    context = docker_query(["context", "show"])
    endpoint = os.environ.get("DOCKER_HOST") if not os.environ.get("DOCKER_CONTEXT") else None
    if not endpoint and context:
        raw = docker_query(["context", "inspect", context, "--format", "{{json .Endpoints.docker.Host}}"])
        try:
            endpoint = json.loads(raw) if raw else None
        except ValueError:
            endpoint = None
    # A daemon's directory is not this machine's directory over TCP/SSH.
    if not isinstance(endpoint, str) or not endpoint.startswith("unix://"):
        return {"status": "unknown", "reason": "remote_or_unreadable_context", "context": context}
    raw = docker_query(["info", "--format", "{{json .DockerRootDir}}"])
    try:
        path = json.loads(raw) if raw else None
    except ValueError:
        path = None
    if not isinstance(path, str) or not os.path.isabs(path) or not os.path.isdir(path):
        return {"status": "unknown", "reason": "docker_root_unreadable", "context": context}
    return {"status": "local", "context": context, "endpoint": endpoint, "path": path}


def docker_usage(identity):
    if identity.get("status") != "local":
        return {"status": "unknown", "reason": identity.get("reason")}
    raw = docker_query(["system", "df", "--format", "{{json .}}"])
    try:
        rows = [json.loads(line) for line in raw.splitlines()] if raw else []
        if not rows or not all(isinstance(row, dict) for row in rows):
            raise ValueError()
        return {"status": "measured", "source": "docker_system_df", "scope": "daemon logical usage, not filesystem allocated bytes",
                "rows": [{key: row.get(key) for key in ("Type", "TotalCount", "Active", "Size", "Reclaimable")} for row in rows]}
    except ValueError:
        return {"status": "unknown", "reason": "docker_usage_unreadable_or_timeout"}


def docker_snapshot():
    try:
        identity = docker_identity()
        return identity, docker_usage(identity)
    except Exception as error:
        # Optional metadata, including subprocess text decoding, must not
        # unwind into a blocked progress writer's executor shutdown.
        unknown = {"status": "unknown", "reason": "docker_metadata_failed", "error": type(error).__name__}
        return unknown, dict(unknown)


def process_info(pid):
    try:
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        return {"start_ticks": fields[19], "parent_pid": int(fields[1])}
    except (OSError, IndexError, ValueError):
        return None


def process_identity(pid):
    value = process_info(pid)
    return value["start_ticks"] if value else None


def signal_sampler(directory, pid, name):
    """pidfd pins the process between identity verification and signal delivery."""
    directory = Path(directory)
    expected = read_json(directory / "ready")
    descriptor = None
    try:
        descriptor = os.pidfd_open(pid)
        actual = process_info(pid)
        if (not expected or expected.get("pid") != pid or not actual
                or actual.get("start_ticks") != expected.get("start_ticks")
                or actual.get("parent_pid") != expected.get("parent_pid")):
            raise ValueError("sampler identity lost")
        signal.pidfd_send_signal(descriptor, getattr(signal, "SIG" + name))
        return 0
    except ProcessLookupError:
        return 1  # Already exited; a finished observation remains valid.
    except ValueError:
        (directory / "ownership_lost").write_text("sampler identity lost; no signal sent\n")
        return 1
    except (AttributeError, OSError):
        # Cooperative stop can still finish and be reaped without pidfds. The
        # caller records incomplete ownership only if the child remains live.
        return 1
    finally:
        if descriptor is not None:
            os.close(descriptor)


def add_filesystem(filesystems, kind, path):
    alias = {"kind": kind, "path": path, "directory_readable": os.access(path, os.R_OK | os.X_OK)}
    target = Path(path)
    descriptor = None
    try:
        # A cold checkout may not exist yet; its nearest ancestor identifies its
        # filesystem without pretending the directory itself was measured.
        while not target.exists() and target != target.parent:
            target = target.parent
        descriptor = os.open(target, os.O_RDONLY | os.O_DIRECTORY)
        stat = os.fstat(descriptor)
        fs = os.fstatvfs(descriptor)
        key = (stat.st_dev, fs.f_fsid)
        alias["stat_path"] = str(target)
        if key in filesystems:
            os.close(descriptor)
            filesystems[key]["aliases"].append(alias)
        else:
            filesystems[key] = {"descriptor": descriptor, "device": stat.st_dev, "fsid": fs.f_fsid,
                                "aliases": [alias], "samples": 0, "read_errors": 0,
                                "start_available_bytes": None, "end_available_bytes": None,
                                "min_available_bytes": None, "start_free_bytes": None,
                                "end_free_bytes": None, "max_gap_s": 0, "missed_intervals": 0, "last_monotonic_s": None}
        return True
    except OSError:
        if descriptor is not None:
            os.close(descriptor)
        alias["error"] = "filesystem_unreadable"
        return alias


def sample(filesystems, now):
    for fs in filesystems.values():
        try:
            value = os.fstatvfs(fs["descriptor"])
            available, free = value.f_bavail * value.f_frsize, value.f_bfree * value.f_frsize
            if fs["samples"] == 0:
                fs["start_available_bytes"], fs["start_free_bytes"] = available, free
                fs["first_monotonic_s"] = now
            if fs["last_monotonic_s"] is not None:
                gap = now - fs["last_monotonic_s"]
                fs["max_gap_s"] = max(fs["max_gap_s"], gap)
                fs["missed_intervals"] += max(0, math.floor(gap / INTERVAL_S) - 1)
            fs["min_available_bytes"] = min(fs["min_available_bytes"], available) if fs["samples"] else available
            fs["end_available_bytes"], fs["end_free_bytes"] = available, free
            fs["last_monotonic_s"] = now
            fs["samples"] += 1
        except OSError:
            fs["read_errors"] += 1


def observe(directory, parent, budget, paths):
    directory = Path(directory)
    start = time.monotonic()
    identity = process_identity(parent)
    stop = []
    signal.signal(signal.SIGUSR1, lambda *_: stop.append("finished"))
    signal.signal(signal.SIGTERM, lambda *_: stop.append("terminated"))
    filesystems, unknown = {}, []
    for kind, path in zip(("home", "checkout", "pnpm", "npm", "custom_store"), paths):
        added = add_filesystem(filesystems, kind, path)
        if added is not True:
            unknown.append(added)
    sample(filesystems, start)
    write_json(directory / "ready", {"baseline_monotonic_s": start, "pid": os.getpid(),
                                     "start_ticks": process_identity(os.getpid()), "parent_pid": parent})
    docker = {"status": "unknown", "reason": "docker_metadata_pending"}
    usage_before, usage_after = None, None
    work = {"completed_loops": 0, "max_loop_work_s": 0.0, "max_write_s": 0.0,
            "progress_writes_submitted": 0, "progress_writes_completed": 0,
            "progress_writes_skipped_busy": 0, "write_errors": 0}
    reason = "running"
    finishing_started = None
    # Optional daemon queries must never pause filesystem sampling. One worker
    # bounds before+after work to the same query budget as the serial owner.
    with ThreadPoolExecutor(max_workers=1) as metadata, ThreadPoolExecutor(max_workers=1) as writer:
        before = metadata.submit(docker_snapshot)
        after = None
        progress = None
        while True:
            now = time.monotonic()
            if before is not None and before.done():
                docker, usage_before = before.result()
                before = None
                if docker["status"] == "local":
                    known_filesystems = set(filesystems)
                    added = add_filesystem(filesystems, "docker", docker["path"])
                    for key in set(filesystems) - known_filesystems:
                        filesystems[key]["late_discovery"] = True
                    if added is not True:
                        unknown.append(added)
            sample(filesystems, now)
            if identity is None or process_identity(parent) != identity:
                reason = "parent_exited"
            elif now >= start + budget and reason != "parent_exited":
                reason = "deadline"
            elif "terminated" in stop:
                reason = "terminated"
            elif reason == "running" and (stop or (directory / "stop").exists()):
                reason = "finished"
            if reason != "running" and finishing_started is None:
                finishing_started = now
            if reason != "running" and after is None:
                after = metadata.submit(docker_snapshot)
            if progress is not None and progress.done():
                result = progress.result()
                work["progress_writes_completed"] += 1
                work["max_write_s"] = max(work["max_write_s"], result["duration_s"])
                work["write_errors"] += int(result["error"] is not None)
                progress = None
            metadata_complete = after is not None and after.done() and before is None
            if metadata_complete:
                docker_after, usage_after = after.result()
                if progress is None:
                    break
                if time.monotonic() >= finishing_started + STOP_GRACE_S:
                    # A blocked Python thread cannot be cancelled safely. All
                    # native metadata children are now reaped: exit only this
                    # observer and its threads, retaining incomplete progress.
                    os._exit(1)
            # A killed observer must not leave a qualified finished snapshot
            # while final metadata or a queued initial snapshot is incomplete.
            phase = "running" if reason == "running" else "finishing"
            if not metadata_complete:
                if progress is None:
                    work["progress_writes_submitted"] += 1
                    snapshot = observation_snapshot(start, now, phase, filesystems, unknown,
                                                    docker, usage_before, None, work)
                    progress = writer.submit(write_observation, directory, snapshot)
                else:
                    work["progress_writes_skipped_busy"] += 1
            work["max_loop_work_s"] = max(work["max_loop_work_s"], time.monotonic() - now)
            work["completed_loops"] += 1
            # Work and JSON I/O consume this interval; do not add a full interval
            # afterwards and manufacture an over-threshold sampling gap.
            time.sleep(max(0, now + INTERVAL_S - time.monotonic()))
    if docker != docker_after:
        usage_after = {"status": "unknown", "reason": "docker_context_changed"}
        docker = {"status": "unknown", "reason": "docker_context_changed"}
        for fs in filesystems.values():
            for alias in fs["aliases"]:
                if alias["kind"] == "docker":
                    alias["error"] = "docker_context_changed"
    end = time.monotonic()
    sample(filesystems, end)
    # Both executors have joined. No older progress snapshot can overwrite this
    # final publication; its filesystem write is outside the sampled boundary.
    snapshot = observation_snapshot(start, end, reason, filesystems, unknown,
                                    docker, usage_before, usage_after, work)
    result = write_observation(directory, snapshot)
    for fs in filesystems.values():
        os.close(fs["descriptor"])
    return int(result["error"] is not None or work["write_errors"] > 0)


def observation_snapshot(start, end, reason, filesystems, unknown, docker, before, after, work):
    """Detach every mutable alias/metadata/work value before the writer sees it."""
    rows = []
    for fs in filesystems.values():
        row = {key: value for key, value in fs.items() if key != "descriptor"}
        first = row.get("first_monotonic_s", end)
        row["expected_samples"] = max(1, math.floor((end - first) / INTERVAL_S) + 1)
        row["sampled_highwater_bytes"] = (max(0, row["start_available_bytes"] - row["min_available_bytes"])
                                          if row["samples"] else None)
        row["full_window"] = (reason == "finished" and row["samples"] >= 2 and row["read_errors"] == 0
                              and first - start < INTERVAL_S and end - row["last_monotonic_s"] < INTERVAL_S
                              and row["missed_intervals"] == 0 and row["max_gap_s"] <= MAX_SAMPLE_GAP_S
                              and not row.get("late_discovery", False) and work["write_errors"] == 0)
        rows.append(row)
    return copy.deepcopy({
        "schema": SCHEMA, "source": "statvfs", "scope": "shared_host_filesystems",
        "sampler_pid": os.getpid(), "sampler_start_ticks": process_identity(os.getpid()),
        "boundary": "admission_to_checkout_release; post-unlock global cache reclaim excluded",
        "interval_s": INTERVAL_S, "max_qualified_gap_s": MAX_SAMPLE_GAP_S,
        "start_monotonic_s": start, "end_monotonic_s": end,
        "termination": reason, "filesystems": rows, "unknown_paths": unknown,
        "work": dict(work, scope="completed sampling loops and progress writes; final publication excluded"),
        "docker": dict(docker, usage_before=before, usage_after=after),
        "limits": "Sampled lower bound, not exact transient peak. Concurrent gates, CI, Docker, and reclaim affect host free space. Deduplicate filesystems; never sum aliases. f_bavail is process-available; f_bfree also includes reserved blocks."})


def write_observation(directory, snapshot):
    started = time.monotonic()
    error = None
    try:
        write_json(directory / "observation.json", snapshot)
    except (OSError, ValueError, TypeError) as failure:
        error = type(failure).__name__
    return {"duration_s": time.monotonic() - started, "error": error}


def collect(directory):
    directory = Path(directory)
    observation = read_json(directory / "observation.json")
    if observation is None:
        observation = {"schema": SCHEMA, "source": "statvfs", "termination": "unobserved", "filesystems": []}
    if (directory / "late_start").exists() or (directory / "ownership_lost").exists():
        for fs in observation.get("filesystems", []):
            fs["full_window"] = False
        observation["coverage_error"] = "baseline_not_ready_or_sampler_ownership_lost"
    observation["directory_snapshots"] = {phase: read_json(directory / (phase + ".json"))
                                           for phase in ("before", "after_install", "end")}
    observation["directory_complete"] = all(isinstance(observation["directory_snapshots"].get(phase), dict)
                                                and not observation["directory_snapshots"][phase].get("error")
                                                for phase in ("before", "end"))
    observation["directory_scope"] = "Nontransient du checkpoints; missing/timeout stays unknown; shared-store growth is not attributable to one gate."
    print(json.dumps(observation))


def disk_summary(history, since):
    """Newest twenty completed admitted rows per host, with unknowns retained."""
    def admitted(row):
        timing = row.get("timing")
        timing = timing if isinstance(timing, dict) else {}
        return not (row.get("exit") in (75, 76) and timing.get("command_s") is None)
    groups = {}
    for host in ("beelink1", "beelink2"):
        rows = sorted((r for r in history if r.get("host") == host and r.get("at", "") >= since
                       and admitted(r)),
                      key=lambda r: r.get("at", ""))[-20:]
        values, observed, records = [], [], []
        for row in rows:
            observation = row.get("disk_observation")
            filesystems = observation.get("filesystems") if isinstance(observation, dict) else None
            filesystems = filesystems if isinstance(filesystems, list) else []
            home = next((fs for fs in filesystems if isinstance(fs, dict) and isinstance(fs.get("aliases"), list)
                         and any(isinstance(a, dict) and a.get("kind") == "home" for a in fs["aliases"])), {})
            value = home.get("sampled_highwater_bytes")
            numeric = type(value) is int and value >= 0
            valid = home.get("full_window") is True and numeric
            if numeric:
                observed.append(value)
            if valid:
                values.append(value)
            records.append({"gate_id": row.get("gate_id"), "at": row.get("at"), "measured": valid,
                            "observed": numeric, "sampled_highwater_bytes": value if numeric else None,
                            "disk_observation": observation})
        groups[host] = {"n": len(rows), "measured_n": len(values), "unknown_n": len(rows) - len(values),
                        "missing_history_n": 20 - len(rows), "observed_n": len(observed),
                        "sampled_highwater_p99_bytes": max(values) if len(values) == 20 else None,
                        "qualified_subset_p99_bytes": max(values) if values else None,
                        "observed_highwater_lower_bound_max_bytes": max(observed) if observed else None,
                        "records": records}
    return {"selection": "last20 completed admitted receipt rows per host in report window; missing history remains unknown",
            "scope": "Shared home filesystem sampled lower bounds, not assured transient peaks or a new floor. Whole-last20 p99 requires20 qualified rows; otherwise unknown. Qualified-subset p99 excludes partial rows; observed maximum includes their numeric lower bounds. Never use a subset as whole-window coverage.",
            "hosts": groups}


if __name__ == "__main__":
    os.umask(0o077)
    action, *arguments = sys.argv[1:]
    if action == "scan":
        directory, phase, seconds, *paths = arguments
        sys.exit(scan(directory, phase, int(seconds), paths))
    elif action == "observe":
        directory, parent, budget, *paths = arguments
        sys.exit(observe(directory, int(parent), int(budget), paths))
    elif action == "collect":
        collect(arguments[0])
    elif action == "signal":
        sys.exit(signal_sampler(Path(arguments[0]), int(arguments[1]), arguments[2]))
    elif action == "grace":
        print(STOP_GRACE_S)
    elif action == "floor":
        try:
            print(effective_floor(*arguments))
        except (OSError, ValueError, TypeError, KeyError, AttributeError, ImportError, SyntaxError):
            print('beelink-gate: authoritative disk floor unavailable or invalid; growth refused', file=sys.stderr)
            sys.exit(75)
    else:
        sys.exit(64)
