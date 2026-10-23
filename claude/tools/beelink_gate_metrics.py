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
                        "phase_coverage": {k: phases[k]["n"] for k in ("install_s", *(name + "_s" for name in CALLER_PHASE_LABELS))}})
    return {"window_from": start.isoformat(), "window_to": until.isoformat(),
            "groups": summary, "records": records, "excluded": dict(excluded),
            "phase_labels": {name + "_s": label for name, label in CALLER_PHASE_LABELS.items()},
            "selection": "completed admitted gates whose inferred submission (receipt finish minus wall minus cumulative wait) is in window",
            "limits": "Pending gates and launcher time before remote waiting are not in receipt percentiles; phases are nested, not additive. Historical unrecorded phases and claim spans are unknown. Retained history completeness is unknown; missing_timing/invalid records are counted before window filtering."}
