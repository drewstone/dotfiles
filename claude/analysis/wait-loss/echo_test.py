#!/usr/bin/env python3
"""Does echoing inside the loop body preserve output when a wait call is capped?

A capped Bash call either keeps its partial stdout or returns a bare header.
Hypothesis: a loop that writes to stdout on every iteration keeps its progress;
a loop that only writes after the loop exits returns nothing.
Tested on every capped wait-loop in the transcript corpus.
"""
import json
import math
import re
from collections import Counter

rows = json.load(open("loss_rows.json"))

# stdout inside the loop body: an echo/printf/tee that sits between the loop
# opener and its `done`, i.e. before the final sleep-bearing iteration ends.
LOOPBODY_RE = re.compile(
    r"(?:for|while|until)\b[^\n;]*(?:;|\n)\s*do\b(.*?)\bdone\b",
    re.S | re.I,
)
EMIT_RE = re.compile(r"\b(echo|printf|tee|cat)\b")


def emits_in_loop(cmd):
    bodies = LOOPBODY_RE.findall(cmd or "")
    if not bodies:
        return None  # not a parseable loop
    return any(EMIT_RE.search(b) for b in bodies)


waits = [r for r in rows if r["kind"] in ("loop", "longsleep")]
print(f"capped wait calls: {len(waits)}")

tbl = Counter()
unparsed = 0
for r in waits:
    e = emits_in_loop(r["cmd"])
    if e is None:
        unparsed += 1
        continue
    tbl[(e, r["lost"])] += 1

a = tbl[(True, False)]   # emits, kept output
b = tbl[(True, True)]    # emits, lost
c = tbl[(False, False)]  # silent, kept
d = tbl[(False, True)]   # silent, lost
print(f"unparsed loops (truncated cmd): {unparsed}")
print()
print("                     kept output   lost output   n    loss rate")
print(f"  emits in loop  :  {a:>10}   {b:>11}   {a+b:>3}   {b/(a+b) if a+b else 0:.3f}")
print(f"  silent in loop :  {c:>10}   {d:>11}   {c+d:>3}   {d/(c+d) if c+d else 0:.3f}")


def fisher(a, b, c, d):
    """Two-sided Fisher exact p for the 2x2 [[a,b],[c,d]]."""
    def C(n, k):
        return math.comb(n, k)
    n = a + b + c + d
    r1, r2 = a + b, c + d
    c1 = a + c

    def p(x):
        y = r1 - x
        z = c1 - x
        w = r2 - z
        if min(x, y, z, w) < 0:
            return 0.0
        return C(r1, x) * C(r2, z) / C(n, c1)
    p0 = p(a)
    tot = 0.0
    for x in range(0, min(r1, c1) + 1):
        px = p(x)
        if px <= p0 + 1e-12:
            tot += px
    return min(1.0, tot)


if (a + b) and (c + d):
    pval = fisher(a, b, c, d)
    lr_e = b / (a + b)
    lr_s = d / (c + d)
    # risk ratio of losing output, silent vs emitting
    rr = (lr_s / lr_e) if lr_e else float("inf")
    print()
    print(f"  Δ loss rate (silent − emitting) = {lr_s - lr_e:+.3f}")
    print(f"  risk ratio (silent / emitting)  = {rr:.2f}x")
    print(f"  Fisher exact two-sided p        = {pval:.5f}")

# Same test across ALL capped Bash calls that contain any loop, not just waits
print("\n=== all capped calls containing a loop (waits + long work) ===")
tbl2 = Counter()
for r in rows:
    e = emits_in_loop(r["cmd"])
    if e is None:
        continue
    tbl2[(e, r["lost"])] += 1
a2, b2 = tbl2[(True, False)], tbl2[(True, True)]
c2, d2 = tbl2[(False, False)], tbl2[(False, True)]
print(f"  emits : kept={a2} lost={b2} rate={b2/(a2+b2) if a2+b2 else 0:.3f}")
print(f"  silent: kept={c2} lost={d2} rate={d2/(c2+d2) if c2+d2 else 0:.3f}")
if (a2 + b2) and (c2 + d2):
    print(f"  Fisher p = {fisher(a2,b2,c2,d2):.5f}")
