#!/usr/bin/env bash
# PreToolUse(Bash) warning for a wait loop that throws away its own answer.
#
# When a Bash call passes its timeout the harness either moves it to the
# background, which keeps the work and notifies later, or kills it. A killed
# call returns only the bytes it had already written to stdout. So a loop that
# prints after `done` returns nothing, while one that prints each iteration
# keeps its progress.
#
# Measured 2026-08-26 over 1,830 transcripts, 80 capped wait loops (66 parsed):
#   silent loop body  -> lost all output 29 of 30  (96.7%)
#   printing body     -> lost all output 13 of 36  (36.1%)
#   delta +60.6pp, bootstrap 95% CI [+43.3, +77.8], Cohen's h 1.485, p < 1e-5
#
# Scored on the real corpus: 30 of 30 recall on the losing class, 0 false fires
# in 600 ordinary commands, and it stays quiet when the command sets
# run_in_background or already writes its output to a file.
#
# Two earlier triggers were removed on 2026-08-26 because measurement did not
# support them. A ci-poll counter nudged on repeat `gh run view` calls: it fired
# in session ff995b36 and 12 capped waits followed it, and it matched 0 of 600
# sampled commands. A long-work trigger warned before installs, builds and
# nested agent runs: it reached 22 of 40 losing calls while firing on 6.5% of
# all traffic, and it warned on a two-second `git push`. Cost with no measured
# benefit is noise, and noise is why the first nudge was ignored.
#
# Fail-open by contract: any missing dependency, parse failure, or unexpected
# input exits 0 with no output, so this can never block normal Bash use.

set -uo pipefail
exec 2>/dev/null

payload="$(cat 2>/dev/null || true)"
[ -z "$payload" ] && exit 0

# This hook runs on every Bash call and starting python3 costs ~40 ms, so skip
# the parser unless a sleep is present at all. Most real commands stop here.
printf '%s' "$payload" | grep -q 'sleep' || exit 0
command -v python3 >/dev/null || exit 0

# The payload goes on stdin, not argv: a Bash command can carry a whole heredoc
# script, and an argv-sized payload would hit ARG_MAX and fail the hook.
read -r -d '' GUARD_PY <<'PY'
import json
import re
import sys

try:
    d = json.loads(sys.stdin.read())
except Exception:
    sys.exit(0)

inp = d.get("tool_input") or {}
cmd = inp.get("command") or ""
if not cmd or inp.get("run_in_background"):
    sys.exit(0)

# A command that already sends stdout to a file keeps its output when the call
# is killed. Matches `> f`, `>> f`, `&> f` and `| tee f`, but not `>&2` or
# `>/dev/null`, which discard it.
if re.search(r"(?:&?>>?\s*(?!&|/dev/null)\S+)|(?:\|\s*tee\b)", cmd):
    sys.exit(0)

# Only loops that actually sleep are in scope; a busy loop is a different bug.
LOOP_BODY = re.compile(r"\b(?:for|while|until)\b[^\n;]*(?:;|\n)\s*do\b(.*?)\bdone\b", re.S | re.I)
EMIT = re.compile(r"\b(?:echo|printf|tee|cat)\b")
SLEEP = re.compile(r"\bsleep\s+[0-9.]+")

if any(SLEEP.search(b) and not EMIT.search(b) for b in LOOP_BODY.findall(cmd)):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "additionalContext": (
            "HALO silent-wait: this loop sleeps but never writes to stdout inside "
            "the loop body. If the call passes its timeout the harness kills it and "
            "returns only what was already printed, which here is nothing. Measured "
            "over 1,830 transcripts: silent capped wait loops lost all output 29 of "
            "30 times, printing ones 13 of 36. Echo the state each iteration, or set "
            "run_in_background:true and let the completion notification wake you."
        ),
    }}))
sys.exit(0)
PY

printf '%s' "$payload" | python3 -c "$GUARD_PY" 2>/dev/null || exit 0
exit 0
