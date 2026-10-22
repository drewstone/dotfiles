"""Timing populations shared by the text and JSON gate reports."""
import collections
import datetime as dt
import math


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)] if ordered else None


def seconds(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


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
        records.append({k: row.get(k) for k in ("gate_id", "host", "repo", "sha", "class", "exit", "waited_s", "ran_s", "timing")}
                       | {"submitted_at": submitted.isoformat(), "finished_at": finish.isoformat()})
    summary = []
    for (repo, gate_class), rows in sorted(groups.items()):
        phases = {}
        for phase in ("fetch_s", "pre_command_s", "install_s", "typecheck_s", "tests_s", "command_s", "cleanup_s"):
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
                        "phase_coverage": {k: phases[k]["n"] for k in ("install_s", "typecheck_s", "tests_s")}})
    return {"groups": summary, "records": records, "excluded": dict(excluded),
            "selection": "completed admitted gates whose inferred submission (receipt finish minus wall minus cumulative wait) is in window",
            "limits": "Pending gates and launcher time before remote waiting are not in receipt percentiles; phases are nested, not additive. Historical unrecorded phases are unknown."}
