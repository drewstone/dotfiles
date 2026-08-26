#!/usr/bin/env python3
"""Score the long-work trigger on real corpus commands.

Positives: the capped calls that were long work rather than waits, none of which
used run_in_background. Negatives: ordinary Bash traffic, which must not be
nagged. The `claude` command word is the trap here — it also appears inside
~/.claude/... paths in a large share of commands.
"""
import json
import os
import random
import re
import subprocess

HOOK = os.path.expanduser("~/.claude/hooks/poll-guard.sh")
ROWS = os.environ.get("WAIT_LOSS_ROWS", os.path.join(os.path.dirname(os.path.abspath(__file__)), "loss_rows.json"))
random.seed(20260826)


def fire(cmd, sid, bg=False):
    payload = json.dumps({
        "session_id": sid, "tool_name": "Bash",
        "tool_input": {"command": cmd, "run_in_background": bg},
    })
    p = subprocess.run([HOOK], input=payload, capture_output=True, text=True, timeout=20)
    if p.returncode != 0:
        return "NONZERO"
    if not p.stdout.strip():
        return set()
    try:
        ctx = json.loads(p.stdout)["hookSpecificOutput"]["additionalContext"]
    except Exception:
        return "BADJSON"
    return {t for t in ("silent-wait", "ci-poll", "long-work") if "HALO " + t in ctx}


rows = json.load(open(ROWS))
dead_long = [r for r in rows if r["lost"] and r["kind"] == "NOT-A-WAIT"]

print("=== 1. recall on dead long-work calls ===")
hit = 0
missed = []
for r in dead_long:
    t = fire(r["cmd"], "lw%d" % random.randint(0, 10**9))
    if isinstance(t, set) and "long-work" in t:
        hit += 1
    else:
        missed.append(r)
print(f"  fired {hit}/{len(dead_long)}  ({sum(r['mins'] for r in dead_long if r not in missed)}"
      f"/{sum(r['mins'] for r in dead_long)} min covered)")
print("  missed examples:")
for r in missed[:5]:
    print("   ", r["cmd"].replace("\n", " | ")[:110])

print("\n=== 2. nag rate on ordinary Bash traffic ===")
root = os.path.expanduser("~/.claude/projects")
files = []
for dp, _d, ns in os.walk(root):
    for n in ns:
        if n.endswith(".jsonl"):
            files.append(os.path.join(dp, n))
random.shuffle(files)
cmds = []
for f in files[:60]:
    try:
        for line in open(f, errors="replace"):
            try:
                d = json.loads(line)
            except Exception:
                continue
            m = d.get("message")
            if not isinstance(m, dict):
                continue
            c = m.get("content")
            if not isinstance(c, list):
                continue
            for b in c:
                if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == "Bash":
                    cc = (b.get("input") or {}).get("command")
                    if cc:
                        cmds.append(cc)
    except Exception:
        continue
    if len(cmds) > 4000:
        break
random.shuffle(cmds)
sample = cmds[:600]
counts = {"silent-wait": 0, "ci-poll": 0, "long-work": 0}
any_note = 0
errs = 0
lw_examples = []
for c in sample:
    t = fire(c, "nag%d" % random.randint(0, 10**9))
    if not isinstance(t, set):
        errs += 1
        continue
    if t:
        any_note += 1
    for k in t:
        counts[k] += 1
    if "long-work" in t and len(lw_examples) < 6:
        lw_examples.append(c)
print(f"  n={len(sample)} errors={errs}")
for k, v in counts.items():
    print(f"    {k:>12}: {v:>3}  = {v/len(sample):.1%}")
print(f"    {'ANY note':>12}: {any_note:>3}  = {any_note/len(sample):.1%}")
print("  long-work fires (spot-check these are genuinely slow):")
for c in lw_examples:
    print("   ", c.replace("\n", " | ")[:110])

print("\n=== 3. the ~/.claude path trap ===")
traps = [
    ("path only, must NOT fire", "cat /Users/drew/.claude/settings.json"),
    ("path only, must NOT fire", "ls ~/.claude/projects | head"),
    ("grep for the word", "grep -rn 'claude' ~/dotfiles | head"),
    ("real invocation, MUST fire", "claude -p 'do the thing'"),
    ("real invocation via path, MUST fire", "/opt/homebrew/bin/claude --version"),
    ("after &&, MUST fire", "cd ~/webb && codex exec 'fix it'"),
    ("npm ls is fast, must NOT fire", "npm ls --depth 0"),
    ("npm install, MUST fire", "npm install"),
    ("pnpm custom script, MUST fire", "pnpm signoff"),
    ("pnpm exec tsx, MUST fire", "pnpm exec tsx run.mts"),
    ("bash script.sh, MUST fire", "bash scripts/preflight.sh"),
    ("redirected to a log, must NOT fire", "pnpm signoff > /tmp/s.log 2>&1; tail -4 /tmp/s.log"),
    ("redirect to /dev/null still fires", "claude -p go >/dev/null"),
    ("pnpm why is fast, must NOT fire", "pnpm why react"),
    ("git status, must NOT fire", "git status && git log --oneline -5"),
    ("git push, MUST fire", "git push origin HEAD"),
]
for label, c in traps:
    t = fire(c, "trap%d" % random.randint(0, 10**9))
    got = "long-work" in t if isinstance(t, set) else str(t)
    print(f"  {str(got):>5}  {label:<38} {c[:46]}")

print("\n=== 4. run_in_background suppresses it ===")
print("  bg=False ->", "long-work" in fire("claude -p go", "bgX"))
print("  bg=True  ->", "long-work" in fire("claude -p go", "bgY", bg=True))
