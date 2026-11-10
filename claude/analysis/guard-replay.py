#!/usr/bin/env python3
"""Replay a week of real tool calls through this checkout's process_guard: the integration test of its rules.

Reads the Claude Code transcripts under ~/.claude/projects written in the last --days: every call a guard refused, with
the guard its reason names, and each distinct Bash, Monitor and MEMORY.md write call that ran. Each is judged in-process
by claude/hooks/process_guard.py from this checkout, with the private layer's guard-config and rule modules (--layer).
Denials go to a scratch log, never the live one.

Exit 1 when a recorded process-guard refusal now passes or a recorded pass is now refused, unless the call's key is in
--expect (lines `<key> <pass|deny> <why>`: the false positives a change fixes, the rules added since the call ran), or
when a denial's last sentence names no backticked command to run instead. --out writes one JSON row per changed call.
--time N instead times the installed chain: every Bash hook ~/.claude/settings.json wires, one after another, n=N.

Usage: python3 claude/analysis/guard-replay.py [--days 7] [--layer DIR] [--expect FILE] [--out FILE] | --time N
"""
import argparse
import glob
import hashlib
import json
import os
import re
import sys
import tempfile
import time
import types
from collections import Counter

ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("--days", type=float, default=7.0)
ap.add_argument("--layer", default=os.path.expanduser("~/.local/share/dotfiles-private"), help="private layer checkout")
ap.add_argument("--expect", help="expected changes, one `<key> <pass|deny> <why>` per line")
ap.add_argument("--out", help="write the changed calls here, one JSON row each")
ap.add_argument("--time", type=int, metavar="N", help="time the installed Bash hook chain on `git status --short` N times")
args = ap.parse_args()
if args.time:
    import subprocess
    with open(os.path.expanduser("~/.claude/settings.json")) as fh:
        chain = [h["command"] for g in json.load(fh)["hooks"]["PreToolUse"] if g.get("matcher") == "Bash" for h in g["hooks"]]
    data = json.dumps({"tool_name": "Bash", "tool_input": {"command": "git status --short"}, "cwd": os.getcwd(),
                       "session_id": "guard-replay-timing", "hook_event_name": "PreToolUse"}).encode()
    walls = []
    for _ in range(args.time):
        t0 = time.perf_counter()
        for command in chain:  # as Claude Code runs a hook: through the shell, $HOME expanded
            subprocess.run(command, shell=True, input=data, capture_output=True)
        walls.append((time.perf_counter() - t0) * 1000)
    walls.sort()
    print(f"{len(chain)} Bash hooks, serial wall per call, n={args.time}: p50 {walls[len(walls) // 2]:.0f} ms, "
          f"p90 {walls[min(len(walls) - 1, round(len(walls) * 0.9))]:.0f} ms, load {os.getloadavg()[0]:.1f}")
    sys.exit(0)

# The guards whose refusals process_guard now makes, by the text each one's reason started with.
GUARDS = re.compile(r"process-guard \(([\w-]+)\)|(scan-guard: recursive search)|(ci-wait-guard:)|(host-blast-guard: (?:blocked|HOST_BLAST))"
                    r"|(Subagents never watch in-session)|(This stops a serving fleet host)")
since = time.time() - args.days * 86400


def calls():
    """(recorded decision, payload) per refused call and per distinct call that ran."""
    seen = set()
    for path in glob.glob(os.path.expanduser("~/.claude/projects/*/**/*.jsonl"), recursive=True):
        if os.path.getmtime(path) < since:
            continue
        uses = {}
        with open(path, "rb") as fh:
            for raw in fh:
                if b'"tool_use"' not in raw and b'"tool_result"' not in raw:
                    continue
                try:
                    d = json.loads(raw)
                    content = d["message"]["content"]
                    when = time.mktime(time.strptime(d["timestamp"][:19], "%Y-%m-%dT%H:%M:%S")) - time.timezone
                except (ValueError, KeyError, TypeError):
                    continue
                for c in content if isinstance(content, list) and when >= since else []:
                    if c.get("type") == "tool_use":
                        uses[c.get("id")] = {"tool_name": c.get("name"), "tool_input": c.get("input") or {}, "cwd": d.get("cwd"),
                                             "session_id": d.get("sessionId"), "transcript_path": path,
                                             "agent_id": d.get("agentId") if "/subagents/" in path else None}
                    elif c.get("type") == "tool_result" and c.get("tool_use_id") in uses:
                        payload, text = uses.pop(c["tool_use_id"]), c.get("content")
                        text = " ".join(x.get("text", "") for x in text if isinstance(x, dict)) if isinstance(text, list) else str(text)
                        hit = GUARDS.search(text[:4000]) if c.get("is_error") else None
                        tool, inp = payload["tool_name"], payload["tool_input"]
                        if hit:
                            yield "deny", payload
                        elif tool in ("Bash", "Monitor") or tool in ("Write", "Edit", "MultiEdit") and MEMORY.search(str(inp.get("file_path"))):
                            k = key(payload) + str(bool(payload["agent_id"]))
                            if k not in seen:
                                seen.add(k)
                                yield "pass", payload


def key(payload):
    inp = payload["tool_input"]
    what = inp.get("command") if payload["tool_name"] == "Bash" else inp
    return hashlib.sha256(json.dumps([payload["tool_name"], what], sort_keys=True).encode()).hexdigest()[:16]


config = {}
if os.path.isfile(os.path.join(args.layer, "claude/guard-config.json")):
    with open(os.path.join(args.layer, "claude/guard-config.json")) as fh:
        config = json.load(fh)
pg_config = config.setdefault("process_guard", {})  # the layer's rule modules, read from the layer checkout itself
pg_config["rule_modules"] = [m.replace("~/.claude/hooks/", os.path.join(args.layer, "claude/hooks/")) for m in pg_config.get("rule_modules", [])]
for name in [k for k in os.environ if k.startswith("CC_ALLOW_")]:
    del os.environ[name]  # a session override in the replaying shell would pass what it refuses
os.environ["CC_GUARD_NO_REMOTE_FETCH"] = "1"
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "hooks"))
import secret_scan  # noqa: E402

secret_scan.guard_config = lambda k, default=None: config.get(k, default)
sys.modules["merge_check"] = types.SimpleNamespace(warnings=lambda cmds, payload: [])  # it asks GitHub
import process_guard  # noqa: E402
from process_guard_calls import MEMORY  # noqa: E402

process_guard.LOG = tempfile.mkstemp(prefix="guard-replay-", suffix=".log")[1]
expect = {}
for line in open(args.expect) if args.expect else []:
    if line.strip() and not line.startswith("#"):
        k, want, *_ = line.split()
        expect[k] = want
counts, rules, changed, unnamed = Counter(), Counter(), [], []
for recorded, payload in calls():
    try:
        denied = [f for f in process_guard.evaluate_full(payload)[0] if not f[4]]
    except Exception as exc:
        denied = [("unreadable", "", type(exc).__name__)]
    now = "deny" if denied else "pass"
    counts[(recorded, now)] += 1
    for rule, _, reason, *_ in denied:
        rules[rule] += 1
        last = re.split(r"(?<=[.!?:])\s+|\n", reason.strip())[-1]
        if rule != "unreadable" and "`" not in last:
            unnamed.append((rule, last[-120:]))
    if now != recorded:
        changed.append({"key": key(payload), "recorded": recorded, "now": now, "rule": denied[0][0] if denied else None,
                        "expected": expect.get(key(payload)) == now, "tool": payload["tool_name"],
                        "payload": payload})
surprises = [c for c in changed if not c["expected"]]
if args.out:
    with open(args.out, "w") as fh:
        fh.writelines(json.dumps(c) + "\n" for c in changed)
print(f"calls: {sum(counts.values())} over {args.days:g} days; recorded refusals {counts[('deny', 'deny')]} still refused, "
      f"{counts[('deny', 'pass')]} now pass; recorded passes {counts[('pass', 'pass')]} still pass, {counts[('pass', 'deny')]} now refused")
print(f"changes: {len(changed) - len(surprises)} expected, {len(surprises)} unexpected; denials naming no command: {len(unnamed)}")
print("denials by rule:", ", ".join(f"{r} {n}" for r, n in rules.most_common()))
for c in surprises[:40]:
    print(f"  UNEXPECTED {c['key']} {c['recorded']}->{c['now']} {c['rule'] or ''} {c['tool']}: {json.dumps(c['payload']['tool_input'])[:160]}")
for rule, last in sorted(set(unnamed))[:20]:
    print(f"  NO COMMAND {rule}: ...{last}")
sys.exit(1 if surprises or unnamed else 0)
