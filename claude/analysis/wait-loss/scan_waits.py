#!/usr/bin/env python3
"""Measure how agent sessions wait: shell sleep-loops vs Monitor vs background Bash.

Emits one JSON record per session to stdout plus a corpus summary to stderr.
A "wait" is a Bash call that blocks on elapsed time (sleep in a loop, or a long
bare sleep). A "cap hit" is a wait whose tool_result carries the harness timeout
marker, meaning the call returned no information.
"""
import json
import glob
import os
import re
import sys
from collections import defaultdict

TIMEOUT_RE = re.compile(r"Command timed out after|timed out after \d+", re.I)
LOOP_RE = re.compile(r"\b(for|while|until)\b", re.I)
SLEEP_RE = re.compile(r"\bsleep\s+([0-9.]+)")
SEQ_RE = re.compile(r"\bseq\b")


def classify(cmd):
    """Return 'loop' | 'longsleep' | None for a Bash command string."""
    if not cmd or "sleep" not in cmd:
        return None
    has_loop = bool(LOOP_RE.search(cmd)) or bool(SEQ_RE.search(cmd))
    if has_loop:
        return "loop"
    # bare sleep with no loop: only counts as a wait when it blocks a while
    secs = [float(m) for m in SLEEP_RE.findall(cmd)]
    if secs and max(secs) >= 30:
        return "longsleep"
    return None


def result_text(entry):
    """Flatten a tool_result block's content to text."""
    m = entry.get("message")
    if not isinstance(m, dict):
        return ""
    c = m.get("content")
    out = []
    if isinstance(c, list):
        for b in c:
            if isinstance(b, dict) and b.get("type") == "tool_result":
                cc = b.get("content")
                if isinstance(cc, str):
                    out.append((b.get("tool_use_id"), cc))
                elif isinstance(cc, list):
                    txt = "".join(
                        x.get("text", "") for x in cc if isinstance(x, dict)
                    )
                    out.append((b.get("tool_use_id"), txt))
    return out


def scan(path):
    uses = {}            # tool_use_id -> dict
    order = []
    monitor = 0
    background = 0
    total_bash = 0
    ts_first = ts_last = None
    version = None
    for line in open(path, errors="replace"):
        try:
            d = json.loads(line)
        except Exception:
            continue
        t = d.get("timestamp")
        if t:
            ts_first = ts_first or t
            ts_last = t
        version = d.get("version") or version
        m = d.get("message")
        if not isinstance(m, dict):
            continue
        c = m.get("content")
        if not isinstance(c, list):
            continue
        for b in c:
            if not isinstance(b, dict):
                continue
            if b.get("type") == "tool_use":
                name = b.get("name")
                inp = b.get("input") or {}
                if name == "Monitor":
                    monitor += 1
                elif name == "Bash":
                    total_bash += 1
                    if inp.get("run_in_background"):
                        background += 1
                    kind = classify(inp.get("command", ""))
                    if kind:
                        uses[b.get("id")] = {
                            "kind": kind,
                            "cmd": inp.get("command", ""),
                            "timeout": inp.get("timeout"),
                            "bg": bool(inp.get("run_in_background")),
                            "capped": False,
                        }
                        order.append(b.get("id"))
            elif b.get("type") == "tool_result":
                pass
        for tid, txt in result_text(d) or []:
            if tid in uses and TIMEOUT_RE.search(txt or ""):
                uses[tid]["capped"] = True
    waits = [uses[i] for i in order]
    return {
        "path": path,
        "session": os.path.basename(path).replace(".jsonl", ""),
        "project": os.path.basename(os.path.dirname(path)),
        "version": version,
        "first": ts_first,
        "last": ts_last,
        "bash_calls": total_bash,
        "waits": len(waits),
        "capped": sum(1 for w in waits if w["capped"]),
        "waits_bg": sum(1 for w in waits if w["bg"]),
        "monitor_calls": monitor,
        "bg_calls": background,
        "samples": [
            {"cmd": w["cmd"][:400], "capped": w["capped"], "timeout": w["timeout"]}
            for w in waits
        ],
    }


def main():
    root = os.path.expanduser("~/.claude/projects")
    files = []
    for dirpath, _dirs, names in os.walk(root):
        for n in names:
            if n.endswith(".jsonl"):
                files.append(os.path.join(dirpath, n))
    files.sort()
    recs = []
    for f in files:
        try:
            r = scan(f)
        except Exception as e:
            print(f"ERR {f}: {e}", file=sys.stderr)
            continue
        if r["waits"] or r["monitor_calls"]:
            recs.append(r)
    for r in recs:
        print(json.dumps(r))
    tot_w = sum(r["waits"] for r in recs)
    tot_c = sum(r["capped"] for r in recs)
    print(
        f"sessions_scanned={len(files)} sessions_with_waits={len(recs)} "
        f"waits={tot_w} capped={tot_c} rate={tot_c/tot_w if tot_w else 0:.3f} "
        f"monitor={sum(r['monitor_calls'] for r in recs)} "
        f"bg={sum(r['bg_calls'] for r in recs)}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
