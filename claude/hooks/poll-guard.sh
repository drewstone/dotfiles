#!/usr/bin/env bash
# PreToolUse(Bash) nudge: the corpus shows hundreds of hand CI-polls per session
# (`gh run view <id>` ×326 in one). After a few repeat polls in a session, inject
# a one-time reminder to use a blocking watcher / background monitor instead.
#
# Strictly non-blocking and fail-open: only the narrow poll pattern triggers any
# work; everything else and every error path exits 0 immediately with no output,
# so this can never add friction to normal Bash use.

set -uo pipefail
exec 2>/dev/null  # never let stderr noise surface as a tool warning

payload="$(cat 2>/dev/null || true)"
[ -z "$payload" ] && exit 0

# Extract command + session id without a JSON dep (pure bash/grep, fast).
cmd="$(printf '%s' "$payload" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)/\1/p' | head -c 4000)"
sid="$(printf '%s' "$payload" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[ -z "$cmd" ] && exit 0

# Only the CI-poll pattern is in scope.
echo "$cmd" | grep -Eq 'gh[a-z-]* (run (view|list)|pr (checks|view))|run view ' || exit 0

ctr="/tmp/halo-pollguard-${sid:-nosess}.cnt"
n=0
[ -f "$ctr" ] && n="$(cat "$ctr" 2>/dev/null || echo 0)"
n=$((n + 1))
echo "$n" > "$ctr" 2>/dev/null || true

# Nudge once, on the 3rd poll — past that the agent has either heeded it or has
# a reason; don't nag every call.
if [ "$n" -eq 3 ]; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"HALO: you've hand-polled CI 3× this session. Hand-polling is the #1 measured loop-waste. Prefer a single blocking wait — `gh run watch <id> --exit-status` — or a background Monitor/run_in_background watcher that emits one event on terminal state, instead of repeated `gh run view`."}}
JSON
fi
exit 0
