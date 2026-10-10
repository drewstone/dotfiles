"""Normalize this host's schema-1 skill runs into skill-runs.v2.jsonl beside each original.

A schema-1 row links to the transcript whose tool output printed its `logged:` line within five
minutes of the row. The link supplies session, transcript, start, duration, tokens, pull requests
and the operator-correction judgment. Originals are read, never written; the derived file is
rewritten whole on each run, so a better mapping or labeler can be replayed.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
from contextlib import closing

from . import core as L

LINK_WINDOW = (-5, 300)  # seconds from the row's ts to its printed `logged:` result


def candidate_transcripts(since: dt.datetime | None) -> list[str]:
    """Transcripts that printed a `logged:` result: rg when installed, else a bounded walk."""
    trees = [L.claude_home() / "projects", L.codex_home() / "sessions"]
    found = []
    rg = L.which("rg")
    for tree in trees:
        if not tree.is_dir():
            continue
        if rg:
            done = subprocess.run([rg, "-l", "-F", "--no-messages", "-g", "*.jsonl", "skill-runs.jsonl]", str(tree)],
                                  capture_output=True, text=True)
            found.extend(line for line in done.stdout.splitlines() if line)
            continue
        for directory, _, names in os.walk(tree):
            for name in names:
                if not name.endswith(".jsonl"):
                    continue
                path = os.path.join(directory, name)
                try:
                    if since and os.path.getmtime(path) < since.timestamp():
                        continue
                    with open(path, encoding="utf-8", errors="replace") as handle:
                        if any("skill-runs.jsonl]" in line for line in handle):
                            found.append(path)
                except OSError:
                    continue
    return sorted(set(found))


def _db(path):
    import sqlite3

    return sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10)


def codex_db_logs() -> list:
    """`logged:` results in Codex's thread history, which outlives the rollout files it projects
    (GTR prunes rollouts; on 2026-10-10 its history held 613k command items in 8.6 GB)."""
    path = L.codex_home() / "thread_history_1.sqlite"
    if not path.exists():
        return []
    out = []
    try:
        with closing(_db(path)) as db:
            rows = db.execute("select thread_id, created_at_ms, item_json from thread_items "
                              "where item_type = 'commandExecution' and item_json like '%skill-runs.jsonl]%'").fetchall()
    except Exception:
        return []
    for thread, created, item in rows:
        try:
            output = json.loads(item).get("aggregatedOutput")
        except json.JSONDecodeError:
            continue
        for event in L._log_events(L.parse_ts(created), output):
            out.append((event, ("codex-db", thread)))
    return out


def codex_db_thread(thread: str) -> tuple[list, dict]:
    """Events and session identity of one thread in Codex's history; humans come from its root thread."""
    history = L.codex_home() / "thread_history_1.sqlite"
    state = L.codex_home() / "state_5.sqlite"
    parent = None
    try:
        with closing(_db(state)) as db:
            row = db.execute("select parent_thread_id from thread_spawn_edges where child_thread_id = ?", (thread,)).fetchone()
            parent = row[0] if row else None
            root = thread
            seen = {thread}
            while True:
                up = db.execute("select parent_thread_id from thread_spawn_edges where child_thread_id = ?", (root,)).fetchone()
                if not up or up[0] in seen:
                    break
                root = up[0]
                seen.add(root)
    except Exception:
        root = thread

    def events_of(thread_id):
        events = []
        try:
            with closing(_db(history)) as db:
                rows = db.execute("select created_at_ms, item_type, item_json from thread_items where thread_id = ? "
                                  "order by rollout_ordinal", (thread_id,)).fetchall()
        except Exception:
            return events
        for created, kind, item in rows:
            if kind not in ("commandExecution", "userMessage"):
                continue
            try:
                body = json.loads(item)
            except json.JSONDecodeError:
                continue
            at = L.parse_ts(created)
            if kind == "userMessage":
                text = L._text_of(body.get("content"))
                if L.operator_text(text):
                    events.append(L.Event(at, "human", {"interrupt": False, "uuid": body.get("id"), "text": text, "invoke": False}))
                continue
            command = str(body.get("command") or "")
            for match in L._SKILL_PATH.finditer(command):
                events.append(L.Event(at, "skill", {"name": match.group(1), "how": "shell"}))
            events.extend(L._log_events(at, body.get("aggregatedOutput")))
            match = L._PR_COMMAND.search(command)
            if match:
                events.extend(L._pr_events(at, command, body.get("aggregatedOutput"), f"pr-{match.group(1)}"))
        events.sort(key=lambda e: e.ts)
        return events

    events = events_of(thread)
    main = events if root == thread else events_of(root)
    session = {"harness": "codex", "id": thread, "agentId": thread if parent else None,
               "transcriptPath": f"{history}#thread={thread}", "mainTranscriptPath": f"{history}#thread={root}",
               "traceDir": None}
    return events, main, session


def load_ledgers():
    ledgers, earliest = [], None
    for runs in sorted(L.state_root().glob("*/" + L.RUNS)):
        rows = []
        text = runs.read_text(encoding="utf-8", errors="replace")
        for number, raw, obj in L.read_jsonl(text):
            if obj.get("schema") == L.SCHEMA or not obj.get("skill"):
                continue
            row = L.normalize(obj, raw)
            row["backfill"] = {"line": number, "linked": False}
            ts = L.parse_ts(obj.get("ts"))
            if ts and (earliest is None or ts < earliest):
                earliest = ts
            rows.append((ts, row, obj))
        if rows:
            ledgers.append((runs, rows))
    return ledgers, earliest


def link(row: dict, obj: dict, ts, logs: list, used: set, suffix: str):
    """The closest unused `logged:` result for this row's ledger, skill and verdict, if any."""
    best = None
    for index, (event, path) in enumerate(logs):
        if index in used or not event.data["ledger"].endswith(suffix):
            continue
        if event.data["skill"] != row["skill"] or event.data["verdict"] != str(obj.get("verdict")):
            continue
        delta = (event.ts - ts).total_seconds()
        if LINK_WINDOW[0] <= delta <= LINK_WINDOW[1] and (best is None or abs(delta) < best[0]):
            best = (abs(delta), index, event, path)
    return best


def enrich(row: dict, event, path, cache: dict, at: dt.datetime):
    if isinstance(path, tuple):  # ("codex-db", thread id)
        key = f"codex-db:{path[1]}"
        if key not in cache:
            cache[key] = codex_db_thread(path[1])
        events, main, session = cache[key]
        main_path = None
    else:
        session = L.transcript_session(path)
        events = L.scan(path, cache)
        main_path = session.get("mainTranscriptPath")
        main = L.scan(main_path, cache) if main_path and main_path != path else events
    measured = L.measure(events, row["skill"], event.ts, main)
    row["session"] = session
    row["transcriptPath"] = row.get("transcriptPath") or session["transcriptPath"]
    row["traceDir"] = row.get("traceDir") or session.get("traceDir")
    if row.get("durationMin") is None and measured["durationMin"] is not None:
        row.update(durationMin=measured["durationMin"], durationSource=measured["durationSource"])
    row.update(startedAt=measured["startedAt"], cost=measured["cost"])
    row["prs"] = L.merge_refs(row.get("prs"), [{**r, "how": "target"} for r in L.pr_refs(row.get("target") or "")],
                              measured["prs"])
    try:
        ended = isinstance(path, tuple) or (at.timestamp() - os.path.getmtime(main_path or path)) > 12 * 3600
    except OSError:
        ended = True
    judged = L.judge_override(row, events, [e for e in main if e.kind == "human"], ended=ended, at=at)
    if judged is not None:
        row["operatorOverride"] = judged["operatorOverride"]
        row["overrideBasis"] = judged.get("basis")
        if judged.get("evidence"):
            row["overrideEvidence"] = judged["evidence"]
    row["backfill"] = {"line": row["backfill"]["line"], "linked": True, "logTs": L.iso(event.ts, ms=True)}


def run(dry_run: bool = False) -> dict:
    at = L.now()
    ledgers, earliest = load_ledgers()
    if not ledgers:
        print("backfill: no schema-1 rows on this host")
        return {"rows": 0, "linked": 0}
    files = candidate_transcripts(earliest - dt.timedelta(days=1) if earliest else None)
    logs = [(event, path) for path in files for event in L.scan_logs(path)] + codex_db_logs()
    used: set = set()
    cache: dict = {}
    total = linked = 0
    for runs, rows in ledgers:
        suffix = f"/{runs.parent.name}/{L.RUNS}"
        for ts, row, obj in rows:
            total += 1
            if ts is None:
                continue
            best = link(row, obj, ts, logs, used, suffix)
            if best is None:
                continue
            _, index, event, path = best
            used.add(index)
            linked += 1
            enrich(row, event, path, cache, at)
        if dry_run:
            continue
        out = runs.with_name(L.BACKFILL)
        temp = out.with_name(out.name + ".tmp")
        with open(temp, "w", encoding="utf-8") as handle:
            for _, row, _ in rows:
                handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
        os.replace(temp, out)
    verb = "would write" if dry_run else "wrote"
    print(f"backfill: {verb} {total} rows in {len(ledgers)} ledgers; linked {linked} to transcripts "
          f"({len(files)} transcripts, {len(logs)} logged results)")
    return {"rows": total, "linked": linked}
