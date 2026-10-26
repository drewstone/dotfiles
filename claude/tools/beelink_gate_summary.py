#!/usr/bin/env python3
"""--summary: a red gate's test counts and failing tests, printed last so a caller's tail still shows the cause.
It reads the node test runner's spec reporter ("ℹ tests 3" counts, the "✖ failing tests:" section), TAP ("#
tests 3" counts, each "not ok" line with its indented diagnostics) and vitest ("Test Files  1 failed | 2
passed (3)" counts, each "FAIL  file > test" line with its error's first line).
"""
import re, sys
code, paths = sys.argv[1], sys.argv[2:]
ansi = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
keys = "tests|suites|pass|fail|cancelled|skipped|todo|duration_ms"
count = re.compile(rf"^(?:ℹ|#) ({keys}) (\S+)$")
not_ok = re.compile(r"^(\s*)not ok\b")
vitest_count = re.compile(r"^\s*(Test Files|Tests)\s{2,}((?:\d+ [a-z]+(?: \| )?)+) \((\d+)\)$")
vitest_fail = re.compile(r"^\s*FAIL\s{1,2}\S")
groups, blocks = [], []
def close(block, kind):
    # A suite's own "not ok" only says that a subtest failed; the subtest's block has the cause.
    if kind == "tap" and any("failureType: 'subtestsFailed'" in l for l in block):
        return
    while block and not block[-1].strip():
        block.pop()
    blocks.append(block)
for path in paths:
    group, block, kind, depth = {}, None, None, 0
    try:
        lines = open(path, encoding="utf-8", errors="replace")
    except OSError:
        continue
    with lines:
        for raw in lines:
            line = ansi.sub("", raw.rstrip("\r\n"))
            if block is not None and kind == "vitest":
                # A vitest failure ends at its "⎯" rule or the next FAIL; keep the error's first line.
                if not (line.startswith("⎯") or vitest_fail.match(line)):
                    if line.strip() and len(block) < 2:
                        block.append(line)
                    continue
                close(block, kind)
                block = None
            if block is not None:
                indent = len(line) - len(line.lstrip())
                if not line.strip() or (kind == "spec" and (indent or line.startswith(("test at ", "✖ ")))) \
                        or (kind == "tap" and indent > depth):
                    block.append(line)
                    continue
                close(block, kind)
                block = None
            match = count.match(line)
            if match:
                group[match[1]] = match[2]
                continue
            if (match := vitest_count.match(line)):
                prefix = "files_" if match[1] == "Test Files" else ""
                group["files" if prefix else "tests"] = match[3]
                for n, state in re.findall(r"(\d+) ([a-z]+)", match[2]):
                    group[prefix + state] = n
                continue
            if group:
                groups.append(group)
                group = {}
            if line == "✖ failing tests:":
                block, kind = [line], "spec"
            elif vitest_fail.match(line):
                block, kind = [line.strip()], "vitest"
            elif (match := not_ok.match(line)):
                block, kind, depth = [line], "tap", len(match[1])
    if block is not None:
        close(block, kind)
    if group:
        groups.append(group)
print(f"beelink-gate: summary of the failed command (exit {code})")
shown = [l for b in blocks for l in b]
limit = 200
for l in shown[:limit]:
    print(l)
if len(shown) > limit:
    print(f"beelink-gate: summary omitted {len(shown) - limit} more failing-test lines; the full output is above")
for g in groups:
    print("beelink-gate: summary " + " ".join(f"{k}={v}" for k, v in g.items()))
if not blocks and not groups:
    print("beelink-gate: summary found no test counts or failing tests in the command output")
