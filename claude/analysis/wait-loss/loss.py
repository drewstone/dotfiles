#!/usr/bin/env python3
"""For every capped Bash call, did the call lose its output? Split by version.

Distinguishes two harness outcomes:
  kill  -> "Exit code 143 / Command timed out after Nm" with an empty payload
  bgmove-> "did not complete within its timeout and was moved to the background"
The second keeps the work alive and delivers output later; the first does not.
"""
import json
import os
import re
from collections import Counter, defaultdict

ROOT = os.path.expanduser("~/.claude/projects")
CAP_RE = re.compile(r"Command timed out after (\d+)m")
BG_RE = re.compile(r"moved to the background")
LOOP_RE = re.compile(r"\b(for|while|until)\b", re.I)
SEQ_RE = re.compile(r"\bseq\b")
SLEEP_RE = re.compile(r"\bsleep\s+([0-9.]+)")
HDR = 60  # payload at or below this is header-only: no information returned


def classify(cmd):
    if not cmd or "sleep" not in cmd:
        return None
    if LOOP_RE.search(cmd) or SEQ_RE.search(cmd):
        return "loop"
    secs = [float(m) for m in SLEEP_RE.findall(cmd)]
    if secs and max(secs) >= 30:
        return "longsleep"
    return None


files = []
for dp, _d, ns in os.walk(ROOT):
    for n in ns:
        if n.endswith(".jsonl"):
            files.append(os.path.join(dp, n))

rows = []
bg_by_ver = Counter()
for f in files:
    uses = {}
    ver = None
    for line in open(f, errors="replace"):
        try:
            d = json.loads(line)
        except Exception:
            continue
        ver = d.get("version") or ver
        m = d.get("message")
        if not isinstance(m, dict):
            continue
        c = m.get("content")
        if not isinstance(c, list):
            continue
        for b in c:
            if not isinstance(b, dict):
                continue
            if b.get("type") == "tool_use" and b.get("name") == "Bash":
                inp = b.get("input") or {}
                uses[b.get("id")] = inp
            elif b.get("type") == "tool_result":
                txt = b.get("content")
                txt = txt if isinstance(txt, str) else json.dumps(txt)
                txt = txt or ""
                tid = b.get("tool_use_id")
                if BG_RE.search(txt):
                    bg_by_ver[ver] += 1
                mm = CAP_RE.search(txt)
                if mm and tid in uses:
                    inp = uses[tid]
                    cmd = inp.get("command", "")
                    rows.append({
                        "ver": ver,
                        "mins": int(mm.group(1)),
                        "kind": classify(cmd) or "NOT-A-WAIT",
                        "explicit_timeout": inp.get("timeout"),
                        "bg_flag": bool(inp.get("run_in_background")),
                        "payload": len(txt),
                        "lost": len(txt) <= HDR,
                        "cmd": cmd,
                    })

print(f"capped Bash calls corpus-wide: {len(rows)}")
lost = sum(1 for r in rows if r["lost"])
print(f"returned ZERO information: {lost} of {len(rows)} = {lost/len(rows):.3f}")

print("\n=== information loss by version ===")
byv = defaultdict(lambda: [0, 0])
for r in rows:
    byv[r["ver"]][0] += 1
    byv[r["ver"]][1] += 1 if r["lost"] else 0
print(f"{'ver':>10} {'caps':>5} {'lost':>5} {'lostrate':>9} {'autoBGmoves':>12}")
for v in sorted(byv, key=lambda s: [int(x) for x in s.split('.')] if s and s.replace('.', '').isdigit() else [0]):
    t, l = byv[v]
    print(f"{v:>10} {t:>5} {l:>5} {l/t:>9.3f} {bg_by_ver.get(v,0):>12}")

print("\n=== explicit timeout param on capped calls ===")
print(Counter(str(r["explicit_timeout"]) for r in rows).most_common(10))

print("\n=== loss rate: explicit timeout set vs not ===")
for label, sel in (("explicit set", lambda r: r["explicit_timeout"] is not None),
                   ("no timeout param", lambda r: r["explicit_timeout"] is None)):
    s = [r for r in rows if sel(r)]
    if s:
        l = sum(1 for r in s if r["lost"])
        print(f"  {label:>18}: n={len(s):>3} lost={l:>3} rate={l/len(s):.3f}")

print("\n=== wait-loop caps only, by version ===")
w = [r for r in rows if r["kind"] in ("loop", "longsleep")]
byv2 = defaultdict(lambda: [0, 0])
for r in w:
    byv2[r["ver"]][0] += 1
    byv2[r["ver"]][1] += 1 if r["lost"] else 0
for v in sorted(byv2, key=lambda s: [int(x) for x in s.split('.')] if s and s.replace('.', '').isdigit() else [0]):
    t, l = byv2[v]
    print(f"  {v:>10} waitcaps={t:>3} lost={l:>3} rate={l/t:.3f}")

print("\n=== current-generation (2.1.241+) capped wait commands ===")
for r in rows:
    if r["ver"] in ("2.1.241", "2.1.243") and r["kind"] in ("loop", "longsleep"):
        print(f"  [{r['ver']}] {r['mins']}m timeout={r['explicit_timeout']} "
              f"payload={r['payload']} lost={r['lost']}")
        print(f"      {r['cmd'][:150]}".replace("\n", " "))

json.dump(rows, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "loss_rows.json"), "w"), indent=1)
print("\nwrote loss_rows.json")
