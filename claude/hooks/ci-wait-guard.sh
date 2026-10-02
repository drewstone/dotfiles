#!/usr/bin/env bash
# PreToolUse(Bash) block for waiting on PR CI.
#
# Policy (AGENTS.md): the local gate on a beelink is the merge gate. After it
# passes, merge or enable auto-merge and move on; CI failures are fixed forward.
#
# Measured 2026-10-02 over 7.8 days of Claude and Codex traces: 4,140 CI polling
# episodes in 488 sessions cost 180 agent-hours (8.7% of all agent time), 37%
# of it on agent-dev-container. A warning was tried on 2026-08-26 and ignored,
# so this denies.
#
# Scope: `gh pr checks --watch`, and any loop that sleeps around `gh pr checks`,
# `gh pr view ... statusCheckRollup`, or `gh run view/list`. `gh run watch` stays
# allowed because deploy and release runs are delivery, not PR checks.
#
# Fail-open: any parse failure exits 0 so normal Bash use is never blocked.

set -uo pipefail
exec 2>/dev/null

payload="$(cat 2>/dev/null || true)"
[ -z "$payload" ] && exit 0
printf '%s' "$payload" | grep -qE 'gh(-drew)? (pr|run)' || exit 0
command -v python3 >/dev/null || exit 0

read -r -d '' GUARD_PY <<'PY'
import json, re, sys
try:
    d = json.loads(sys.stdin.read())
except Exception:
    sys.exit(0)
cmd = (d.get("tool_input") or {}).get("command") or ""
GH = r"\bgh(?:-drew)?\s+"
watch = re.search(GH + r"pr\s+checks\b[^\n|;&]*--watch", cmd)
poll_target = re.search(GH + r"(?:pr\s+checks|pr\s+view[^\n]*statusCheckRollup|run\s+(?:view|list))", cmd)
loop = re.search(r"\b(?:for|while|until)\b", cmd) and re.search(r"\bsleep\s+[0-9]", cmd)
if watch or (poll_target and loop):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": (
            "ci-wait-guard: do not wait on PR CI. The local gate on beelink1-wsl/beelink2-wsl "
            "(merge base, frozen install, typecheck, affected tests) is the merge gate. "
            "Merge, or `gh-drew pr merge --auto`, then continue other work; fix CI failures "
            "forward. Deploy runs may use `gh run watch`."
        ),
    }}))
sys.exit(0)
PY
printf '%s' "$payload" | python3 -c "$GUARD_PY" 2>/dev/null || exit 0
exit 0
