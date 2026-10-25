#!/usr/bin/env bash
# PreToolUse(Bash) block for waiting on PR CI or polling a background task.
#
# Policy (AGENTS.md): the local gate on a beelink is the merge gate. After it
# passes, merge or enable auto-merge and move on; CI failures are fixed forward.
#
# Over 7.8 days of Claude and Codex traces, 4,140 CI polling
# episodes in 488 sessions cost 180 agent-hours (8.7% of all agent time), 37%
# of it on agent-dev-container. Sleep loops over a background task's
# tasks/*.output file cost another 51.8 h; the harness already notifies on
# completion. A warning was tried and ignored, so this denies.
#
# Scope: `gh pr checks --watch`; any sleep loop around `gh pr checks` or
# `gh pr view ... statusCheckRollup`; any sleep loop reading tasks/*.output.
# Runs are delivery, not PR checks: `gh run watch` and sleep loops over
# `gh run view/list` (deploys, releases, package publishes) stay allowed.
#
# Heredoc bodies are ignored: they are usually file contents or test data, and
# matching them blocked writing this hook's own tests.
#
# Fail-open: any parse failure exits 0 so normal Bash use is never blocked.

set -uo pipefail
exec 2>/dev/null

payload="$(cat 2>/dev/null || true)"
[ -z "$payload" ] && exit 0
printf '%s' "$payload" | grep -qE 'gh(-drew)? pr|tasks/[^ ]*[.]output' || exit 0
command -v python3 >/dev/null || exit 0

read -r -d '' GUARD_PY <<'PY'
import json, re, sys
try:
    d = json.loads(sys.stdin.read())
except Exception:
    sys.exit(0)
cmd = (d.get("tool_input") or {}).get("command") or ""

# Drop heredoc bodies: <<EOF, <<'EOF', <<"EOF", <<-EOF through the terminator line.
def strip_heredocs(text):
    out, lines, i = [], text.split("\n"), 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        m = re.search(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?", line)
        i += 1
        if m:
            term = m.group(1)
            while i < len(lines) and lines[i].strip() != term:
                i += 1
            i += 1
    return "\n".join(out)

cmd = strip_heredocs(cmd)
GH = r"\bgh(?:-drew)?\s+"
loop = re.search(r"\b(?:for|while|until)\b", cmd) and re.search(r"\bsleep\s+[0-9]", cmd)

def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}))
    sys.exit(0)

task = re.search(r"[^\s'\"=]*tasks/[^\s'\"]*[.]output", cmd)
if loop and task:
    deny("ci-wait-guard: do not poll a background task's output file. The harness "
         "notifies you when the task finishes, so do other work or end the turn. To see "
         f"its progress now, read it once without a loop: `tail -n 40 {task.group(0)}`.")

watch = re.search(GH + r"pr\s+checks\b[^\n|;&]*--watch", cmd)
poll_target = re.search(GH + r"(?:pr\s+checks|pr\s+view[^\n]*statusCheckRollup)", cmd)
if watch or (poll_target and loop):
    deny("ci-wait-guard: do not wait on PR CI. The local gate on beelink1-wsl/beelink2-wsl "
         "(merge base, frozen install, typecheck, affected tests) is the merge gate. "
         "Merge, or `gh-drew pr merge --auto`, then continue other work; fix CI failures "
         "forward. A deploy, release or publish run is delivery: `gh run watch <id> --exit-status`.")
sys.exit(0)
PY

printf '%s' "$payload" | python3 -c "$GUARD_PY" 2>/dev/null || exit 0
exit 0
