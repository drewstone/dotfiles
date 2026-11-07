#!/usr/bin/env bash
# Merge who-acted attributes into one Claude Code session's identity record.
#
#   session-identity.sh <session_id> '<JSON object of agent.* attributes>'
#
# Record: ~/.local/state/session-identity/claude-code/<session_id>.json
#   {"session_id": "...", "updated_at": "...", "attributes": {"agent.harness": "claude-code", ...}}
# Attribute keys are agent-trace-contract's ATTR keys, so a trace reader copies them as they are.
# A non-string or empty value is dropped, never written as a placeholder; a later write for the
# same key wins. Called by the SessionStart hook (harness, model, profile, skills) and by
# inject-directive.sh (directive variant). Fail-open: every failure exits 0.

command -v jq >/dev/null 2>&1 || exit 0
SID=$1
ATTRS=$2
# The session id becomes a file name: refuse anything that is not one plain path segment.
case "$SID" in '' | *[!A-Za-z0-9._-]* | .*) exit 0 ;; esac

DIR="$HOME/.local/state/session-identity/claude-code"
mkdir -p "$DIR" 2>/dev/null || exit 0
FILE="$DIR/$SID.json"
PRIOR='{}'
if [ -s "$FILE" ] && jq -e 'type == "object"' "$FILE" >/dev/null 2>&1; then
  PRIOR=$(cat "$FILE")
fi
TMP="$FILE.$$.tmp"
if jq -n --argjson prior "$PRIOR" --argjson attrs "$ATTRS" --arg sid "$SID" \
  --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
  $prior + {
    session_id: $sid,
    updated_at: $now,
    attributes: (($prior.attributes // {})
      + ($attrs | with_entries(select((.value | type) == "string" and (.value | length) > 0))))
  }' >"$TMP" 2>/dev/null; then
  mv -f "$TMP" "$FILE" 2>/dev/null || rm -f "$TMP"
else
  rm -f "$TMP"
fi
exit 0
