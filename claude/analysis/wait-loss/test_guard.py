#!/usr/bin/env python3
"""Run the poll-guard hook against real corpus commands and score it.

Positives: capped wait loops whose body never writes to stdout, the class that
measurably loses its answer. Negatives: every other Bash command in a sample of
real transcripts, which must not be warned about.

Recall is 27 of 30, not 30 of 30: the other 3 already redirect their output to a
file, so a kill still leaves the log and the hook stays quiet by design.
"""
import json
import os
import random
import re
import subprocess
import sys

HOOK = os.path.expanduser("~/.claude/hooks/poll-guard.sh")
random.seed(20260826)

LOOP_BODY = re.compile(r"\b(?:for|while|until)\b[^\n;]*(?:;|\n)\s*do\b(.*?)\bdone\b", re.S | re.I)
EMIT = re.compile(r"\b(?:echo|printf|tee|cat)\b")
SLEEP = re.compile(r"\bsleep\s+[0-9.]+")


def fire(cmd, sid="testsession", bg=False):
    """Return (silent_note, cipoll_note) booleans for one command."""
    payload = json.dumps({
        "session_id": sid,
        "tool_name": "Bash",
        "tool_input": {"command": cmd, "run_in_background": bg},
    })
    try:
        p = subprocess.run([HOOK], input=payload, capture_output=True,
                           text=True, timeout=15)
    except Exception as e:
        return ("ERROR", str(e))
    out = p.stdout.strip()
    if p.returncode != 0:
        return ("NONZERO_EXIT", out)
    if not out:
        return (False, False)
    try:
        ctx = json.loads(out)["hookSpecificOutput"]["additionalContext"]
    except Exception:
        return ("BAD_JSON", out[:200])
    return ("silent-wait" in ctx, "ci-poll" in ctx)


ROWS = os.environ.get("WAIT_LOSS_ROWS", os.path.join(os.path.dirname(os.path.abspath(__file__)), "loss_rows.json"))
rows = json.load(open(ROWS))

print("=== 1. recall on the class that loses its answer ===")
sil_hit = sil_n = pr_hit = pr_n = 0
for r in rows:
    if r["kind"] not in ("loop", "longsleep"):
        continue
    bodies = LOOP_BODY.findall(r["cmd"])
    if not bodies:
        continue
    is_silent = any(SLEEP.search(b) and not EMIT.search(b) for b in bodies)
    s, _ = fire(r["cmd"], sid="rec%d" % random.randint(0, 10**9))
    if is_silent:
        sil_n += 1
        sil_hit += 1 if s is True else 0
    else:
        pr_n += 1
        pr_hit += 1 if s is True else 0
print(f"  silent capped wait loops : fired {sil_hit}/{sil_n}")
print(f"  printing capped wait loops: fired {pr_hit}/{pr_n}  (these keep their output)")

print("\n=== 2. false positives on ordinary Bash commands ===")
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
fp = 0
fp_ex = []
errs = 0
for cmd in sample:
    s, _ = fire(cmd, sid="fp%d" % random.randint(0, 10**9))
    if s in ("ERROR", "NONZERO_EXIT", "BAD_JSON"):
        errs += 1
        continue
    bodies = LOOP_BODY.findall(cmd)
    truly_silent = any(SLEEP.search(b) and not EMIT.search(b) for b in bodies)
    if s and not truly_silent:
        fp += 1
        if len(fp_ex) < 3:
            fp_ex.append(cmd[:160])
print(f"  sampled ordinary Bash commands: n={len(sample)} (from {len(files[:60])} transcripts)")
print(f"  hook errors / non-zero exits  : {errs}")
print(f"  false silent-wait fires       : {fp}  rate={fp/max(1,len(sample)):.4f}")
for e in fp_ex:
    print("    ex:", e.replace("\n", " ⏎ "))
true_pos_in_sample = sum(
    1 for c in sample
    if any(SLEEP.search(b) and not EMIT.search(b) for b in LOOP_BODY.findall(c))
)
print(f"  genuinely-silent waits inside that sample: {true_pos_in_sample}"
      f"  ({true_pos_in_sample/len(sample):.2%} of ordinary traffic)")

print("\n=== 3. fail-open checks ===")
for label, arg in (("empty stdin", ""),
                   ("not json", "not json at all"),
                   ("no tool_input", '{"session_id":"x"}'),
                   ("null command", '{"tool_input":{"command":null}}')):
    p = subprocess.run([HOOK], input=arg, capture_output=True, text=True, timeout=15)
    print(f"  {label:>15}: exit={p.returncode} stdout={p.stdout.strip()[:40]!r}")

print("\n=== 4. run_in_background suppresses the note ===")
demo = "for i in $(seq 1 30); do sleep 20; done; echo done"
print("  bg=False ->", fire(demo, sid="bgA")[0])
print("  bg=True  ->", fire(demo, sid="bgB", bg=True)[0])
