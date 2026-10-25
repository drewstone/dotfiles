#!/usr/bin/env bash
# PreToolUse guard: a subagent never waits inside the session and never spawns agents.
#
# Subagents kept themselves alive for hours on in-session background
# watchers ("Waiting on the background event watcher"), re-reading 300k-900k tokens
# of context on every wake, and spawned their own "land PR" agents. Waiting belongs
# in a nohup script on gtr or a Beelink that acts and writes one result line; the
# subagent ends its turn once its code is pushed and the script is armed.
#
# Only when the caller is a subagent:
#   - Bash with run_in_background: true runs in the foreground instead (timeout 600000, the
#     cap; a longer call is moved to the background by the harness), unless the command
#     waits (sleep, a while/until loop, wait, watch, tail -f), which is denied. From 10-17 to
#     10-24 this refusal fired 188 times on the Mac, mostly on beelink-gate runs, tests and
#     builds, and the subagent's next call was usually the same command in the foreground.
#   - the Monitor tool is denied
#   - the Agent tool is denied (no sub-agents spawned by subagents)
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
import re
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
    command = str(inp.get("command") or "")
    if not re.search(r"\b(?:sleep|wait|watch|until|while)\b|--watch\b|\btail\s+-[a-zA-Z]*[fF]", command):
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
    reason = "Subagents never wait in-session."
elif tool == "Monitor":
    reason = "Subagents never watch or wait in-session."
elif tool == "Agent":
    reason = "Subagents never spawn their own agents."
if reason is None:
    sys.exit(0)

# A detached receipt script on drew-gtr-pro ran under a non-login shell,
# found neither gh-drew nor beelink-gate, exited 127 at once, and the PR waited
# unmerged behind a result file nobody had checked.
msg = (reason + " To land an agent-container PR, push it and stop: merge-on-green merges it "
       "once Fast Checks, Build and Type Check are green; never wait for it or write your own "
       "merge script. "
       "For other waiting, arm a nohup script on drew-gtr-pro or a Beelink that does the "
       "waiting, acts on the result and writes one line to a results file, started with "
       "`setsid nohup bash -lc '<script>'` so PATH has gh-drew and beelink-gate; read its "
       "log once before you end your turn: exit 127 means a command is not on PATH. "
       "Then end your turn with your final report. Do the work yourself instead of "
       "delegating it.")
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
