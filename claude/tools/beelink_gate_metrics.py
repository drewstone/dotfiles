"""Timing populations shared by the text and JSON gate reports."""
# BEELINK_GATE_PHASE_SPANS_V1
import collections
import datetime as dt
import math

CALLER_PHASE_LABELS = {
    "typecheck": "caller typecheck span; selected preflight includes prerequisite builds and canonical typechecks",
    "prerequisite_build": "selected preflight prerequisite builds",
    "canonical_typecheck": "selected preflight complete canonical package typechecks",
    "tests": "caller integration tests",
}


def phase_timing(path):
    """Read the gate's append-only monotonic spans; malformed/missing stays unknown."""
    timing = {phase + "_s": None for phase in CALLER_PHASE_LABELS}
    timing.update(cache_lock_wait_ms=None, cache_size_scans=None, cache_prune_work_ms=None)
    spans = collections.defaultdict(list)
    try:
        with open(path, encoding="utf-8") as source:
            timing.update(cache_lock_wait_ms={"precheck": 0, "cleanup": 0},
                          cache_size_scans={"precheck": 0, "cleanup": 0},
                          cache_prune_work_ms={"precheck": 0, "cleanup": 0})
            for line in source:
                fields = line.split()
                if len(fields) != 3:
                    continue
                phase, first, last = fields
                try:
                    if phase in ("precheck", "cleanup"):
                        wait, work = int(first), int(last)
                        if min(wait, work) >= 0:
                            timing["cache_lock_wait_ms"][phase] += wait
                            timing["cache_prune_work_ms"][phase] += work
                    elif phase == "cache_scans" and first in ("precheck", "cleanup"):
                        count = int(last)
                        if count >= 0:
                            timing["cache_size_scans"][first] += count
                    elif phase in CALLER_PHASE_LABELS:
                        begin, end = float(first), float(last)
                        if seconds(begin) and seconds(end) and begin <= end:
                            spans[phase].append((begin, end))
                except ValueError:
                    continue
    except (OSError, TypeError, UnicodeError):
        pass  # A measurement must not change the gate's command result.
    for phase, intervals in spans.items():
        elapsed = right = 0
        for begin, end in sorted(intervals):
            elapsed += max(0, end - max(begin, right))
            right = max(right, end)
        timing[phase + "_s"] = round(elapsed, 3)
    return timing


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)] if ordered else None


def seconds(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def capacity_claim_summary(rows):
    """Recorded lock-claim spans only; matched coverage is not a causal wait split."""
    measured = [(r["timing"].get("capacity_claim_wait_ms"), r["waited_s"]) for r in rows
                if seconds(r["timing"].get("capacity_claim_wait_ms"))]
    claims = [milliseconds / 1000 for milliseconds, _ in measured]
    total, waited = sum(claims), sum(wait for _, wait in measured)
    total = round(total, 3) if seconds(total) else None
    waited = round(waited, 3) if seconds(waited) else None
    ratio = total / waited if total is not None and waited else None
    return {"measured_n": len(measured), "unknown_n": len(rows) - len(measured),
            "sum_s": total if measured else None, "p90_s": percentile(claims, .9),
            "max_s": max(claims) if claims else None,
            "recorded_wait_sum_s": waited if measured else None,
            "ratio_to_recorded_wait": round(ratio, 6) if seconds(ratio) else None,
            "scope": "diagnostic recorded capacity lock-claim spans / recorded wait on the same measured rows; not a causal split, disk-floor refusal count, or PSI/FIFO/slot attribution"}


def throughput(history, since, until):
    start = dt.datetime.fromisoformat(since.replace("Z", "+00:00"))
    groups = collections.defaultdict(list)
    excluded = collections.Counter()
    records = []
    for row in history:
        if not isinstance(row, dict):
            excluded["invalid_record"] += 1
            continue
        timing = row.get("timing") if isinstance(row.get("timing"), dict) else {}
        wait, wall = row.get("waited_s"), row.get("ran_s")
        if not seconds(wait) or not seconds(wall):
            excluded["missing_timing"] += 1
            continue
        try:
            finish = dt.datetime.fromisoformat(str(row["at"]).replace("Z", "+00:00"))
            submitted = finish - dt.timedelta(seconds=wall + wait)
        except (KeyError, ValueError, TypeError, OverflowError):
            excluded["invalid_timestamp"] += 1
            continue
        if submitted.tzinfo is None:
            excluded["invalid_timestamp"] += 1
            continue
        if not start <= submitted <= until:
            continue
        # Commands legitimately return 2/3 (notably tsc); exit alone cannot prove non-admission.
        if row.get("exit") in (75, 76) and not seconds(timing.get("command_s")):
            excluded["unadmitted_or_incomplete"] += 1
            continue
        key = (row.get("repo", "?"), row.get("class", "normal"))
        row = dict(row, timing=timing)
        groups[key].append(row)
        # Commands can contain private caller inputs; the live instrument exports only timings.
        records.append({k: row.get(k) for k in ("gate_id", "host", "repo", "sha", "class", "exit", "waited_s", "ran_s", "timing", "admission")}
                       | {"submitted_at": submitted.isoformat(), "finished_at": finish.isoformat()})
    summary = []
    for (repo, gate_class), rows in sorted(groups.items()):
        phases = {}
        observations = [row["timing"].get("turbo_cache") for row in rows]
        measured = [o for o in observations if isinstance(o, dict) and o.get("source") == "turbo_run_summary"]
        turbo_runs = [run for o in measured if isinstance(o.get("runs"), list) for run in o["runs"]
                      if isinstance(run, dict) and all(isinstance(run.get(k), int) and not isinstance(run[k], bool) and run[k] >= 0 for k in ("cached_tasks", "total_tasks"))
                      and run["cached_tasks"] <= run["total_tasks"]]
        turbo = {"measured_gates": len(measured), "runs": len(turbo_runs),
                 "cached_tasks": sum(run["cached_tasks"] for run in turbo_runs), "total_tasks": sum(run["total_tasks"] for run in turbo_runs)}
        for phase in ("fetch_s", "pre_command_s", "install_s", *(name + "_s" for name in CALLER_PHASE_LABELS), "command_s", "cleanup_s"):
            values = [(r.get("timing") or {}).get(phase) for r in rows]
            measured = [v for v in values if seconds(v)]
            phases[phase] = {"n": len(measured), "p50_s": percentile(measured, .5), "p90_s": percentile(measured, .9)}
        summary.append({"repo": repo, "class": gate_class, "n": len(rows),
                        "exit_counts": dict(collections.Counter(str(r.get("exit")) for r in rows)),
                        "passed_n": sum(r.get("exit") == 0 for r in rows),
                        "passed_wait_p90_s": percentile([r["waited_s"] for r in rows if r.get("exit") == 0], .9),
                        "passed_wall_p50_s": percentile([r["ran_s"] for r in rows if r.get("exit") == 0], .5),
                        "wait_p90_s": percentile([r["waited_s"] for r in rows], .9),
                        "wall_p50_s": percentile([r["ran_s"] for r in rows], .5),
                        "phases": phases,
                        "turbo_cache": turbo,
                        "capacity_claim_wait": capacity_claim_summary(rows),
                        "admission_wait": admission_summary([(r.get("timing") or {}).get("admission_wait") for r in rows]),
                        "phase_coverage": {k: phases[k]["n"] for k in ("install_s", *(name + "_s" for name in CALLER_PHASE_LABELS))}})
    return {"window_from": start.isoformat(), "window_to": until.isoformat(),
            "groups": summary, "records": records, "excluded": dict(excluded),
            "phase_labels": {name + "_s": label for name, label in CALLER_PHASE_LABELS.items()},
            "selection": "completed admitted gates whose inferred submission (receipt finish minus wall minus cumulative wait) is in window",
            "limits": "Pending gates and launcher time before remote waiting are not in receipt percentiles; phases are nested, not additive. Historical unrecorded phases and claim spans are unknown. Retained history completeness is unknown; missing_timing/invalid records are counted before window filtering."}


# BEELINK_GATE_ADMISSION_TIMING_V1
ADMISSION_STAGES = ("checks", "host_psi", "capacity_writer", "capacity_lock", "fifo", "checkout_lock", "host_slot", "unknown")


def _admission_state(row):
    """Validate compact producer state once for mutation and report consumers."""
    import re
    if not isinstance(row, dict) or row.get("schema") != 1:
        raise ValueError("invalid admission state")
    if not re.fullmatch(r"beelink[12]-[0-9a-f]{32}", row.get("gate_id", "")):
        raise ValueError("invalid admission identity")
    if row.get("host") != row["gate_id"].split("-")[0] or row.get("class") not in ("normal", "dev", "light"):
        raise ValueError("invalid admission host/class")
    if not re.fullmatch(r"[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+", row.get("repo", "")) or not re.fullmatch(r"[0-9a-fA-F]{40}|[0-9a-fA-F]{64}", row.get("sha", "")):
        raise ValueError("invalid admission source")
    expected = {"schema", "gate_id", "host", "repo", "sha", "class", "start_ns", "last_ns", "end_ns", "legacy_begin_ns", "stage_ns", "active_stage", "tainted", "began_at", "updated_at", "placed_wait_s", "boundary", "outcome", "exit", "reason", "terminal_outcome", "terminal_reason"}
    if set(row) != expected:
        raise ValueError("unknown admission fields")
    first, last, totals = row.get("start_ns"), row.get("last_ns"), row.get("stage_ns")
    integer = lambda n: type(n) is int and 0 <= n < 2**63
    if not integer(first) or not integer(last) or first > last or not isinstance(totals, dict) or set(totals) != set(ADMISSION_STAGES):
        raise ValueError("invalid admission interval")
    if not all(integer(n) for n in totals.values()) or sum(totals.values()) != last - first:
        raise ValueError("admission partition does not reconcile")
    if row.get("active_stage") not in (*ADMISSION_STAGES, None) or type(row.get("tainted")) is not bool:
        raise ValueError("invalid active admission stage")
    for key in ("end_ns", "legacy_begin_ns"):
        if row.get(key) is not None and (not integer(row[key]) or not first <= row[key] <= last):
            raise ValueError("invalid admission checkpoint")
    if row.get("end_ns") is not None and (row["end_ns"] != last or row["active_stage"] is not None):
        raise ValueError("admission ended state is inconsistent")
    if row.get("boundary") not in (None, "lock_slot_admitted", "terminal_before_admission") or (row.get("boundary") is None) != (row.get("end_ns") is None):
        raise ValueError("invalid admission boundary")
    if row.get("outcome") not in ("pending", "admitted", "canceled", "refused", "replaced", "incomplete", "terminal"):
        raise ValueError("invalid admission outcome")
    if row.get("terminal_outcome") not in (None, "admitted", "canceled", "refused", "replaced", "incomplete") or not re.fullmatch(r"[a-z_]{0,64}", row.get("terminal_reason", "")):
        raise ValueError("invalid admission terminal evidence")
    if not re.fullmatch(r"[a-z_]{0,64}", row.get("reason", "")) or not integer(row.get("placed_wait_s")):
        raise ValueError("invalid admission metadata")
    if row.get("exit") is not None and (type(row["exit"]) is not int or not 0 <= row["exit"] <= 255):
        raise ValueError("invalid admission exit")
    for key in ("began_at", "updated_at"):
        stamp = dt.datetime.fromisoformat(row[key])
        if stamp.tzinfo is None:
            raise ValueError("admission UTC context needs timezone")
    return row


def _read_observation_bytes(path, limit=16384):
    """One bounded, non-following regular-file reader for optional observations."""
    import json, os, stat
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o022 or info.st_size > limit:
            raise ValueError("unsafe observation")
        data = source.read(limit + 1)
    if len(data) > limit:
        raise ValueError("oversized observation")
    return data


def _read_observation_json(path):
    import json
    return json.loads(_read_observation_bytes(path))


def _replace_observation_json(target, row):
    """Caller holds the private directory lock and bounds the whole operation."""
    import json, os, tempfile
    data = json.dumps(row, separators=(",", ":")).encode() + b"\n"
    if len(data) > 16384:
        raise ValueError("oversized observation")
    fd, temporary = tempfile.mkstemp(prefix=".observation-", dir=target.parent)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(data)
        os.replace(temporary, target)
    finally:
        if os.path.lexists(temporary):
            os.unlink(temporary)


def _observation_directory(path):
    import os, stat
    directory = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        info = os.fstat(directory)
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError("observation directory must be private")
    except BaseException:
        os.close(directory)
        raise
    return directory


def _read_admission_state(path):
    return _admission_state(_read_observation_json(path))


def admission_observe(args):
    """Private admission owner's single monotonic state producer; no policy effects."""
    import fcntl, json, os, stat, tempfile, time
    from pathlib import Path
    path, action, value, tainted, status, outcome, reason, gate, host, repo, sha, gate_class, carried = args
    target = Path(path)
    directory = _observation_directory(target.parent)
    try:
        # Serialize interrupted writers on the existing stable job directory.
        # The caller bounds lock/IO time; read only after acquiring the lock so
        # a late transition cannot overwrite a terminal or admitted snapshot.
        fcntl.flock(directory, fcntl.LOCK_EX)
        now, utc = time.monotonic_ns(), dt.datetime.now(dt.timezone.utc).isoformat()
        if action == "begin":
            if os.path.lexists(target):
                raise ValueError("admission observation already exists")
            row = {"schema": 1, "gate_id": gate, "host": host, "repo": repo, "sha": sha, "class": gate_class,
                   "start_ns": now, "last_ns": now, "end_ns": None, "legacy_begin_ns": None,
                   "stage_ns": dict.fromkeys(ADMISSION_STAGES, 0), "active_stage": "checks",
                   "tainted": tainted == "1", "began_at": utc, "updated_at": utc,
                   "placed_wait_s": int(carried), "boundary": None, "outcome": "pending", "exit": None, "reason": "",
                   "terminal_outcome": None, "terminal_reason": ""}
        else:
            row = _read_admission_state(target)
            if (gate, host, repo, sha, gate_class) != tuple(row[k] for k in ("gate_id", "host", "repo", "sha", "class")):
                raise ValueError("admission identity changed")
            row["tainted"] |= tainted == "1"
            # Command terminal metadata never extends or reopens an admitted span.
            if action != "terminal" and row["end_ns"] is None:
                stage = "unknown" if row["tainted"] else row["active_stage"]
                row["stage_ns"][stage] += now - row["last_ns"]
                row["last_ns"] = now
                if action == "stage":
                    if value not in ADMISSION_STAGES:
                        raise ValueError("invalid admission stage")
                    row["active_stage"] = value
                elif action == "checkpoint":
                    row["legacy_begin_ns"] = now
                elif action == "admitted":
                    row.update(end_ns=now, active_stage=None, boundary="lock_slot_admitted", outcome="admitted")
                elif action == "end":
                    row.update(end_ns=now, active_stage=None, boundary="terminal_before_admission")
                else:
                    raise ValueError("invalid admission transition")
            if action in ("end", "terminal"):
                row.update(exit=int(status), terminal_outcome=outcome, terminal_reason=reason)
                if action == "end":
                    row.update(outcome=outcome, reason=reason)
            row["updated_at"] = utc
        _admission_state(row)
        _replace_observation_json(target, row)
    finally:
        os.close(directory)


def read_admission_state(path):
    try:
        return _read_admission_state(path)
    except (OSError, ValueError, KeyError, TypeError, OverflowError, UnicodeError, RecursionError):
        return None


def admission_observation(row):
    """The one sanitized optional receipt/report representation."""
    row = _admission_state(row)
    scale = lambda ns: round(ns / 1e9, 6) if ns is not None else None
    # An admitted writer can finish after its shell was interrupted. Only a
    # confirmed finalizer makes that snapshot eligible for complete coverage.
    complete = row["end_ns"] is not None and not row["tainted"] and row["exit"] is not None and row["terminal_outcome"] is not None
    return {k: row[k] for k in ("gate_id", "host", "repo", "sha", "class", "began_at", "updated_at", "outcome", "exit", "reason", "placed_wait_s", "boundary", "terminal_outcome", "terminal_reason")} | {
        "source": "native_admission_monotonic", "clock_scope": "one native placement CLOCK_MONOTONIC; UTC is selection context only",
        "coverage": "complete" if complete else "partial", "active_stage": row["active_stage"],
        "observed_s": scale(row["last_ns"] - row["start_ns"]),
        "remote_start_to_lock_slot_admitted_s": scale(row["end_ns"] - row["start_ns"]) if complete and row["boundary"] == "lock_slot_admitted" else None,
        "early_remote_s": scale(row["legacy_begin_ns"] - row["start_ns"]) if row["legacy_begin_ns"] is not None else None,
        "legacy_local_window_s": scale(row["end_ns"] - row["legacy_begin_ns"]) if complete and row["boundary"] == "lock_slot_admitted" and row["legacy_begin_ns"] is not None else None,
        "stages_s": {stage: scale(ns) for stage, ns in row["stage_ns"].items()},
        "unknown_tail": row["end_ns"] is None, "tainted": row["tainted"],
        "scope": "elapsed sequential stages include checks/probe and instrumentation overhead; not exclusive causal CPU attribution; carried launcher wait is unattributed"}


def read_admission_observation(path):
    row = read_admission_state(path)
    return admission_observation(row) if row else None


def admission_summary(rows):
    observed = [r for r in rows if isinstance(r, dict) and r.get("source") == "native_admission_monotonic"
                and r.get("coverage") in ("complete", "partial") and seconds(r.get("observed_s")) and r["observed_s"] <= 2**63 / 1e9
                and isinstance(r.get("stages_s"), dict) and set(r["stages_s"]) == set(ADMISSION_STAGES)
                and all(seconds(n) for n in r["stages_s"].values())
                and sum(r["stages_s"].values()) <= r["observed_s"] + .00001]
    complete = [r for r in observed if r.get("coverage") == "complete"]
    return {"observed_n": len(observed), "unknown_n": len(rows) - len(observed), "complete_n": len(complete), "partial_n": len(observed) - len(complete),
            "stages_sum_s": {stage: round(sum(r["stages_s"][stage] for r in observed), 6) if observed else None for stage in ADMISSION_STAGES},
            "remote_start_to_lock_slot_admitted_p90_s": percentile([r["remote_start_to_lock_slot_admitted_s"] for r in complete if seconds(r.get("remote_start_to_lock_slot_admitted_s")) and r["remote_start_to_lock_slot_admitted_s"] <= r["observed_s"]], .9),
            "scope": "retained observed placement prefixes; missing/no-ID population completeness unknown, carried wait not summed; stage percentiles are not additive"}


def admission_attempts(batches):
    """Retained placements are diagnostic, never new completed throughput rows."""
    observations, coverage, unobserved = [], [], []
    missing_n = 0
    for batch in batches:
        entries = batch.get("entries") if isinstance(batch.get("entries"), list) else []
        measured = 0
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            try:
                row = admission_observation(entry.get("observation"))
                if row["gate_id"] != entry.get("gate_id"):
                    raise ValueError("retained admission identity mismatch")
            except (ValueError, TypeError, KeyError, OverflowError):
                import re
                if re.fullmatch(r"beelink[12]-[0-9a-f]{32}", str(entry.get("gate_id", ""))):
                    unobserved.append({"gate_id": entry["gate_id"], "selection_at": entry.get("selection_at"),
                                       "selection_source": entry.get("selection_source"),
                                       "scope": "retained job has no valid admission observation; duration/cause unknown"})
                continue
            measured += 1
            observations.append(row | {"retained_job_exit": entry.get("retained_job_exit"),
                                       "actual_cancel_marker": entry.get("actual_cancel_marker") is True})
        coverage.append({"host": batch.get("from"), "window_from": batch.get("window_from"),
                         "window_to": batch.get("window_to"), "retained_jobs_seen_n": batch.get("retained_jobs_seen_n"),
                         "retained_jobs_in_window_n": len(entries), "observed_n": measured,
                         "missing_or_invalid_observation_n": len(entries) - measured,
                         "selection": batch.get("selection")})
        missing_n += len(entries) - measured
    return {"observations": observations, "unobserved": unobserved, "summary": admission_summary([*observations, *([None] * missing_n)]), "hosts": coverage,
            "limits": "retained native placements only; missing/no-ID/expired population unknown. Different placement IDs and cumulative carried wait must not be added as whole request latency."}


# BEELINK_GATE_FRONTEND_TIMING_V1
FRONTEND_PHASES = ("setup", "reserve_lookup", "reservation_setup", "placement_probe_wait", "stage", "submit", "attach", "result_read", "retry_wait", "reservation_cleanup", "unknown")


def _frontend_state(row):
    """One schema for local authority state and sanitized transported prefixes."""
    import re
    fields = {"schema", "request_id", "root_invocation_id", "writer_id", "launcher_host", "clock_scope", "source_digest", "began_at", "updated_at", "start_ns", "last_ns", "end_ns", "phase_ns", "active_phase", "sequence", "tainted", "exit", "repo", "sha", "class", "placements", "attachment_only", "authority", "delegated_to"}
    if not isinstance(row, dict) or set(row) != fields or row.get("schema") != 1:
        raise ValueError("invalid frontend schema")
    for key in ("request_id", "root_invocation_id", "writer_id", "clock_scope"):
        if not re.fullmatch(r"[0-9a-f]{32}", str(row[key])):
            raise ValueError("invalid frontend identity")
    for key in ("source_digest", "authority"):
        if row[key] is None and key == "authority":
            continue
        if not re.fullmatch(r"[0-9a-f]{64}", str(row[key])):
            raise ValueError("invalid frontend source/authority")
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", str(row["launcher_host"])):
        raise ValueError("invalid launcher host")
    integer = lambda n: type(n) is int and 0 <= n < 2**63
    first, last, totals = row["start_ns"], row["last_ns"], row["phase_ns"]
    if not integer(first) or not integer(last) or last < first or not isinstance(totals, dict) or set(totals) != set(FRONTEND_PHASES):
        raise ValueError("invalid frontend interval")
    if not all(integer(n) for n in totals.values()) or sum(totals.values()) != last - first or not integer(row["sequence"]):
        raise ValueError("invalid frontend partition")
    if row["active_phase"] not in (*FRONTEND_PHASES, None) or type(row["tainted"]) is not bool or type(row["attachment_only"]) is not bool:
        raise ValueError("invalid frontend coverage")
    if row["delegated_to"] is not None and not re.fullmatch(r"[0-9a-f]{32}", str(row["delegated_to"])):
        raise ValueError("invalid frontend delegation")
    if row["end_ns"] is not None and (row["end_ns"] != last or row["active_phase"] is not None or type(row["exit"]) is not int or not 0 <= row["exit"] <= 255):
        raise ValueError("invalid frontend finalization")
    if (row["end_ns"] is None) != (row["active_phase"] is not None):
        raise ValueError("invalid frontend phase boundary")
    if row["end_ns"] is None and row["exit"] is not None:
        raise ValueError("frontend exit without finalization")
    for key in ("began_at", "updated_at"):
        if dt.datetime.fromisoformat(row[key]).tzinfo is None:
            raise ValueError("frontend UTC context needs timezone")
    if row["repo"] is not None and not re.fullmatch(r"[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+", str(row["repo"])):
        raise ValueError("invalid frontend repository")
    if row["sha"] is not None and not re.fullmatch(r"[0-9a-fA-F]{40}|[0-9a-fA-F]{64}", str(row["sha"])):
        raise ValueError("invalid frontend revision")
    if row["class"] not in (None, "normal", "dev", "light") or not isinstance(row["placements"], list) or len(row["placements"]) > 64:
        raise ValueError("invalid frontend placements")
    seen = set()
    for ordinal, placement in enumerate(row["placements"], 1):
        if not isinstance(placement, dict) or set(placement) != {"ordinal", "gate_id", "target_host", "state", "native_exit", "attach_exit", "association"}:
            raise ValueError("invalid frontend placement")
        gate = placement["gate_id"]
        if not re.fullmatch(r"beelink[12]-[0-9a-f]{32}", str(gate)) or gate in seen or placement["ordinal"] != ordinal or placement["target_host"] != gate.split("-")[0]:
            raise ValueError("invalid frontend placement identity")
        seen.add(gate)
        if placement["state"] not in ("allocated", "staged", "submission_unknown", "submitted", "not_admitted", "returned", "unknown") or placement["association"] not in ("created", "attached_origin_unknown", "reattached"):
            raise ValueError("invalid frontend placement state")
        for key in ("native_exit", "attach_exit"):
            if placement[key] is not None and (type(placement[key]) is not int or not 0 <= placement[key] <= 255):
                raise ValueError("invalid frontend placement exit")
        if placement["native_exit"] is not None:
            raise ValueError("producer cannot assert native exit from transport status")
    return row


def read_frontend_state(path):
    try:
        return _frontend_state(_read_observation_json(path))
    except (OSError, ValueError, KeyError, TypeError, OverflowError, UnicodeError, RecursionError):
        return None


def frontend_begin(root, source, retention):
    """Portable launcher scope; unsupported local primitives leave no observation."""
    import hashlib, json, os, re, socket, tempfile, time, uuid
    from pathlib import Path
    directory = Path(root)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = _observation_directory(directory)
    os.close(fd)
    # Reuse the existing reconnect owner's retention age, never delete open rows.
    import shutil
    for index, prior in enumerate(directory.iterdir()):
        if index >= 4096:
            break
        if not prior.name.startswith("request-") or prior.is_symlink() or not prior.is_dir():
            continue
        old = read_frontend_state(prior / "frontend.json")
        if old and old["end_ns"] is not None and (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(old["updated_at"])).total_seconds() > int(retention):
            shutil.rmtree(prior)
    path = Path(tempfile.mkdtemp(prefix="request-", dir=directory)) / "frontend.json"
    token, owner = uuid.uuid4().hex, uuid.uuid4().hex
    now, utc = time.monotonic_ns(), dt.datetime.now(dt.timezone.utc).isoformat()
    row = {"schema": 1, "request_id": uuid.uuid4().hex, "root_invocation_id": owner, "writer_id": owner,
           "launcher_host": re.sub(r"[^A-Za-z0-9._-]", "", socket.gethostname())[:64] or "unknown",
           "clock_scope": uuid.uuid4().hex, "source_digest": source, "began_at": utc, "updated_at": utc,
           "start_ns": now, "last_ns": now, "end_ns": None, "phase_ns": dict.fromkeys(FRONTEND_PHASES, 0),
           "active_phase": "setup", "sequence": 0, "tainted": False, "exit": None,
           "repo": None, "sha": None, "class": None, "placements": [], "attachment_only": False, "delegated_to": None,
           "authority": hashlib.sha256(token.encode()).hexdigest()}
    _frontend_state(row)
    _replace_observation_json(path, row)
    print(str(path), token, owner, sep="\n")


def frontend_observe(*args):
    """Sequential wrapper/child delegation; only root may close the envelope."""
    import fcntl, hashlib, hmac, json, os, re, socket, time
    from pathlib import Path
    path, token, writer, source, action, value, gate, detail, tainted, status = args
    target = Path(path)
    directory = _observation_directory(target.parent)
    try:
        fcntl.flock(directory, fcntl.LOCK_EX)
        row = _frontend_state(_read_observation_json(target))
        host = re.sub(r"[^A-Za-z0-9._-]", "", socket.gethostname())[:64] or "unknown"
        if not row["authority"] or not hmac.compare_digest(row["authority"], hashlib.sha256(token.encode()).hexdigest()) or row["source_digest"] != source or row["launcher_host"] != host:
            raise ValueError("frontend authority/source/host changed")
        if not re.fullmatch(r"[0-9a-f]{32}", writer):
            raise ValueError("invalid frontend writer")
        if row["end_ns"] is not None:
            return  # Late writes can neither reopen nor overwrite final evidence.
        now = time.monotonic_ns()
        if now < row["last_ns"]:
            raise ValueError("frontend clock changed")
        root = row["root_invocation_id"]
        # Only a confirmed child release can hand its current leaf back to
        # the wrapper. A forced reclaim retains timing UNKNOWN and cannot
        # manufacture cancellation authority from a transcript or an old leaf.
        released_child = (action == "claim" and writer == root and value == gate
                          and row["writer_id"] == root and row["delegated_to"] is None)
        if action == "claim" and writer != root:
            if row["writer_id"] != root or row["delegated_to"] != writer:
                raise ValueError("child has no pending writer delegation")
        elif action == "claim" and writer == root:
            if row["delegated_to"] is not None:
                if value != row["delegated_to"]:
                    raise ValueError("parent did not confirm exact waited child")
                row["tainted"] = True  # Wait ended without a confirmed release.
            elif row["writer_id"] != root:
                raise ValueError("invalid resumed frontend authority")
        elif action == "end" and writer == root:
            row["tainted"] |= row["writer_id"] != root or row["delegated_to"] is not None
        elif writer != row["writer_id"]:
            raise ValueError("stale frontend writer")
        if action == "delegate" and (writer != root or row["delegated_to"] is not None or not re.fullmatch(r"[0-9a-f]{32}", value) or value == root):
            raise ValueError("invalid targeted writer delegation")
        if action == "release" and row["delegated_to"] != writer:
            raise ValueError("writer has no delegation to release")
        row["tainted"] |= tainted == "1"
        phase = "unknown" if row["tainted"] else row["active_phase"]
        row["phase_ns"][phase] += now - row["last_ns"]
        row.update(last_ns=now, updated_at=dt.datetime.now(dt.timezone.utc).isoformat(), writer_id=writer, sequence=row["sequence"] + 1)
        if action == "phase":
            if value not in FRONTEND_PHASES:
                raise ValueError("invalid frontend phase")
            row["active_phase"] = value
        elif action == "metadata":
            row.update(repo=value, sha=gate, **{"class": detail})
        elif action == "placement":
            placement = next((p for p in row["placements"] if p["gate_id"] == gate), None)
            if placement is None:
                placement = {"ordinal": len(row["placements"]) + 1, "gate_id": gate, "target_host": gate.split("-")[0], "state": "unknown", "native_exit": None, "attach_exit": None, "association": "created" if detail != "attach" else "attached_origin_unknown"}
                row["placements"].append(placement)
            elif detail == "attach" and placement["association"] == "created":
                placement["association"] = "reattached"
            if value == "attached":
                row["attachment_only"] |= row["repo"] is None
            else:
                placement["state"] = value
            if status:
                placement["attach_exit"] = int(status)
        elif action == "delegate":
            row["delegated_to"] = value
        elif action == "release":
            row.update(delegated_to=None, writer_id=root)
        elif action == "claim" and writer == root:
            row["delegated_to"] = None
        elif action == "end":
            if writer != root:
                raise ValueError("only root finalizes frontend request")
            row.update(end_ns=now, active_phase=None, exit=int(status))
        elif action not in ("snapshot", "claim"):
            raise ValueError("invalid frontend transition")
        _frontend_state(row)
        _replace_observation_json(target, row)
        if action == "snapshot":
            print(json.dumps(dict(row, authority=None), separators=(",", ":")))
        elif action == "delegate":
            print(value)  # Ack only after the exact delegation was persisted.
        elif released_child and row["placements"]:
            leaf = row["placements"][-1]
            if leaf["association"] in ("created", "reattached") and leaf["state"] in ("allocated", "staged", "submission_unknown", "submitted"):
                print(leaf["gate_id"])
    finally:
        os.close(directory)


def retain_frontend_prefix(directory, text, gate):
    """Optional metadata on the existing staging RPC; never a native predicate."""
    import fcntl, hashlib, json, os
    from pathlib import Path
    if len(text.encode()) > 16384:
        raise ValueError("oversized frontend prefix")
    row = _frontend_state(json.loads(text))
    if row["authority"] is not None or not any(p["gate_id"] == gate for p in row["placements"]):
        raise ValueError("frontend prefix does not bind submitted job")
    target = Path(directory) / "frontend.json"
    if hashlib.sha256(_read_observation_bytes(target.parent / "gate.sh", 2097152)).hexdigest() != row["source_digest"]:
        raise ValueError("frontend/staged source skew")
    fd = _observation_directory(target.parent)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        prior = read_frontend_state(target)
        if prior is not None and (prior["request_id"], prior["source_digest"]) != (row["request_id"], row["source_digest"]):
            raise ValueError("frontend prefix identity changed")
        if prior is None or prior["sequence"] < row["sequence"]:
            _replace_observation_json(target, row)
    finally:
        os.close(fd)


def frontend_observation(row, origin):
    row = _frontend_state(row)
    complete = origin == "local" and row["end_ns"] is not None and not row["tainted"] and row["delegated_to"] is None
    return {key: row[key] for key in ("request_id", "root_invocation_id", "launcher_host", "clock_scope", "source_digest", "began_at", "updated_at", "repo", "sha", "class", "sequence", "placements", "attachment_only", "tainted")} | {
        "source": "frontend_request_monotonic", "origin": origin, "coverage": "complete" if complete else "partial",
        "observed_s": round((row["last_ns"] - row["start_ns"]) / 1e9, 6),
        "request_s": round((row["end_ns"] - row["start_ns"]) / 1e9, 6) if complete else None,
        "phases_s": {phase: round(ns / 1e9, 6) for phase, ns in row["phase_ns"].items()},
        "synced_through_sequence": row["sequence"], "unknown_tail": not complete, "active_phase": row["active_phase"], "exit": row["exit"] if origin == "local" else None,
        "scope": "one launcher monotonic scope after source bootstrap; phase elapsed includes checks/IO; attach overlaps native wait/run and is never added to native timings; original request unknown for independent attach"}


def frontend_requests(batches, native_rows=(), since=None, until=None):
    """Join retained request/ordinal/exact-ID prefixes once; never create gate rows."""
    import hashlib, json
    requests, conflicts, coverage = {}, set(), []
    snapshots = {}
    start = dt.datetime.fromisoformat(since.replace("Z", "+00:00")) if since else None
    for batch in batches:
        seen = valid = outside = 0
        entries = batch.get("entries") if isinstance(batch, dict) else None
        if not isinstance(entries, list) or batch.get("origin") not in ("local", "remote_prefix"):
            coverage.append({"from": batch.get("from") if isinstance(batch, dict) else None,
                             "error": "malformed_optional_batch", "retained_entries_n": None, "unknown_n": None})
            continue
        for entry in entries:
            seen += 1
            try:
                row = _frontend_state(entry["observation"])
                began = dt.datetime.fromisoformat(row["began_at"])
                if (start and began < start) or (until and began > until):
                    outside += 1
                    continue
                origin = "local" if batch.get("origin") == "local" else "remote_prefix"
                gate = entry.get("gate_id")
                if origin != "local" and not any(p["gate_id"] == gate for p in row["placements"]):
                    raise ValueError("frontend join mismatch")
                candidate = frontend_observation(row, origin)
            except (KeyError, ValueError, TypeError, OverflowError):
                continue
            valid += 1
            key = row["request_id"]
            snapshot = hashlib.sha256(json.dumps(dict(row, authority=None), sort_keys=True).encode()).hexdigest()
            identity = (key, row["sequence"])
            if identity in snapshots and snapshots[identity] != snapshot:
                conflicts.add(key)
            snapshots[identity] = snapshot
            prior = requests.get(key)
            if prior and any(prior[k] != candidate[k] for k in ("source_digest", "clock_scope", "root_invocation_id", "launcher_host", "began_at")):
                conflicts.add(key)
            if prior is None or (candidate["sequence"], origin == "local") > (prior["sequence"], prior["origin"] == "local"):
                requests[key] = candidate
        coverage.append({"from": batch.get("from"), "origin": batch.get("origin", "remote_prefix"), "retained_entries_n": seen, "valid_n": valid, "unknown_n": seen - valid - outside, "outside_window_n": outside,
                         "scan_truncated": batch.get("truncated"), "local_scan_n": batch.get("scanned_n"),
                         "unknown_selection_n": batch.get("unknown_selection_n"), "error": batch.get("error")})
    rows = [r for key, r in sorted(requests.items()) if key not in conflicts]
    native = {}
    for receipt in native_rows:
        if isinstance(receipt, dict) and isinstance(receipt.get("timing"), dict):
            key = receipt.get("gate_id")
            if key not in native:
                native[key] = receipt
            elif native[key] is not None and any(native[key].get(k) != receipt.get(k) for k in ("sha", "repo", "exit")):
                native[key] = None
    for row in rows:
        row["placements"] = [dict(p) for p in row["placements"]]
        for placement in row["placements"]:
            receipt = native.get(placement["gate_id"])
            match = receipt is not None and all(row[k] is None or row[k] == receipt.get(k) for k in ("sha", "repo"))
            placement.update(native_exit=receipt.get("exit") if match else None,
                             native_join="canonical_receipt" if match else "unknown_or_source_conflict")
    complete = [r for r in rows if r["coverage"] == "complete"]
    return {"window_from": since, "window_to": until.isoformat() if until else None,
            "observations": rows, "coverage": coverage, "conflicting_request_ids": sorted(conflicts),
            "summary": {"observed_n": len(rows), "complete_n": len(complete), "partial_n": len(rows) - len(complete), "source_skew_n": len(conflicts), "global_unknown_n": None,
                        "request_p90_s": percentile([r["request_s"] for r in complete], .9),
                        "phases_sum_s": {phase: round(sum(r["phases_s"][phase] for r in rows), 6) if rows else None for phase in FRONTEND_PHASES}},
            "limits": "Reporting-launcher local finals plus retained native prefixes only; remote-only tails, expired/no-ID/global population unknown. Native gate cohorts/legacy wait unchanged; placed age, attach and native times must not be summed."}


def frontend_retained(root, hours):
    """Read only this reporting caller's retained envelopes, with an explicit cap."""
    import json
    from pathlib import Path
    start = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=int(hours))
    directory, entries, scanned, unknown_selection, truncated = Path(root), [], 0, 0, False
    for path in directory.iterdir() if directory.is_dir() else []:
        if scanned >= 4096:
            truncated = True
            break
        if not path.name.startswith("request-") or path.is_symlink() or not path.is_dir():
            continue
        scanned += 1
        row = read_frontend_state(path / "frontend.json")
        if row is None:
            unknown_selection += 1
        if row and dt.datetime.fromisoformat(row["began_at"]) >= start:
            entries.append({"observation": dict(row, authority=None)})
    print(json.dumps({"kind": "frontend_observations", "origin": "local", "entries": entries,
                      "scanned_n": scanned, "unknown_selection_n": unknown_selection, "truncated": truncated,
                      "limits": "only this reporting launcher's retained valid envelopes; invalid/expired/global no-ID requests unknown"}, separators=(",", ":")))
