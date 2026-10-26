#!/usr/bin/env bash
# PreToolUse guard: a subagent never keeps itself alive on in-session watchers.
#
# Subagents kept themselves alive for hours on in-session background
# watchers ("Waiting on the background event watcher"), re-reading 300k-900k tokens
# of context on every wake. A foreground call is one tool call with no wake-ups, so it costs none of that.
#
# Only when the caller is a subagent:
#   - Bash with run_in_background: true runs in the foreground instead (timeout 600000, the
#     cap; a longer call is moved to the background by the harness). That includes waits on the
#     subagent's own gate logs and task files: from 10-19 to 10-26 the old refusal of a background
#     wait fired 346 times, 286 of them on local logs the subagent itself had started, and the next
#     call was the same wait in the foreground. Waiting on PR CI stays ci-wait-guard's refusal.
#   - the Monitor tool is denied: each event wakes the subagent and re-reads its context. The same
#     wait as one foreground Bash call passes.
#   - the Agent tool passes: agent-cap-guard.py counts every live agent of the session, nested ones
#     included. The 123 refused spawns from 10-19 to 10-26 were reviews, sweeps and file splits.
# The main session is not affected. rtk-rewrite.sh leaves a subagent's background call to
# this hook: when two hooks return updatedInput, the last one to finish wins.
#
# Fail-open by contract: missing python3, unparsable input or an unknown payload
# shape exits 0 with no output.

set -uo pipefail
exec 2>/dev/null

payload="$(cat 2>/dev/null || true)"
[ -z "$payload" ] && exit 0
command -v python3 >/dev/null || exit 0

read -r -d '' GUARD_PY <<'PY'
import json
import sys

try:
    d = json.loads(sys.stdin.read())
except Exception:
    sys.exit(0)

# A subagent's tool calls carry its agent id, and its transcript lives under
# <session>/subagents/. Either signal marks the caller as a subagent.
transcript = d.get("transcript_path") or ""
is_subagent = bool(d.get("agent_id")) or "/subagents/" in transcript
if not is_subagent:
    sys.exit(0)

tool = d.get("tool_name") or ""
inp = d.get("tool_input") or {}

if tool == "Bash" and inp.get("run_in_background"):
    updated = {k: v for k, v in inp.items() if k != "run_in_background"}
    updated["timeout"] = 600000
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "allow",
        "permissionDecisionReason": "subagent-wait-guard: ran in the foreground",
        "updatedInput": updated,
        "additionalContext": "subagent-wait-guard ran this command in the foreground with a 10-minute "
                             "timeout: subagents never wait in-session on background work.",
    }}))
    sys.exit(0)
if tool != "Monitor":
    sys.exit(0)

msg = ("Subagents never watch in-session: each Monitor event wakes you and re-reads your context. "
       "Run the same wait as one foreground Bash call (it gets a 10-minute timeout), for example "
       "`until grep -q '^exit=' <log>; do sleep 15; done; tail -40 <log>`. For a longer wait, end your "
       "turn with your report and name the log to read.")
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": msg,
    }
}))
PY

printf '%s' "$payload" | python3 -c "$GUARD_PY"
exit 0
