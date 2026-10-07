#!/usr/bin/env bash
# PreToolUse guard: a subagent never waits inside the session and never spawns agents.
#
# On 2026-10-06 subagents kept themselves alive for hours on in-session background
# watchers ("Waiting on the background event watcher"), re-reading 300k-900k tokens
# of context on every wake, and spawned their own "land PR" agents. Waiting belongs
# in a nohup script on gtr or a Beelink that acts and writes one result line; the
# subagent ends its turn once its code is pushed and the script is armed.
#
# Denies, only when the caller is a subagent:
#   - Bash with run_in_background: true
#   - the Monitor tool
#   - the Agent tool (no sub-agents spawned by subagents)
# The main session is not affected.
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

reason = None
if tool == "Bash" and inp.get("run_in_background"):
    reason = "Subagents never wait in-session."
elif tool == "Monitor":
    reason = "Subagents never watch or wait in-session."
elif tool == "Agent":
    reason = "Subagents never spawn their own agents."
if reason is None:
    sys.exit(0)

msg = (reason + " Arm a nohup script on drew-gtr-pro or a Beelink that does the waiting, "
       "acts on the result and writes one line to a results file, then end your turn "
       "with your final report. Do the work yourself instead of delegating it.")
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
