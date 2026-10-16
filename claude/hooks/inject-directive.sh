#!/usr/bin/env bash
# UserPromptSubmit hook — injects the active interaction directive into every turn.
#
# Single source of truth: ~/.claude/directives/active + variants/<slug>.md
# (symlinked from ~/dotfiles/claude/directives by install.sh).
#
# Fail-open by construction: any missing dep, missing file, or parse error exits 0
# with no output, so it can never block or corrupt a prompt. The directive is
# steering, not a gate.

command -v jq >/dev/null 2>&1 || exit 0

DIR="$HOME/.claude/directives"
[ -d "$DIR/variants" ] || exit 0
[ -f "$DIR/active" ] || exit 0

INPUT=$(cat)
SESSION=$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null) || exit 0

ACTIVE=$(tr -d '[:space:]' < "$DIR/active" 2>/dev/null)
[ -n "$ACTIVE" ] || exit 0

SEEN="$HOME/.claude/.directive-seen"
marker="$SEEN/$SESSION"
# A session keeps the variant it was first logged with, even after `active` changes:
# the A/B unit is the session, and the log is what the trace-insights join reads.
# Markers written before pinning are empty; recover their variant from the log.
PINNED=""
if [ -s "$marker" ]; then
  PINNED=$(tr -d '[:space:]' < "$marker" 2>/dev/null)
elif [ -e "$marker" ] && [ -f "$HOME/.claude/directives-log.jsonl" ]; then
  PINNED=$(grep -F "\"session\":\"$SESSION\"" "$HOME/.claude/directives-log.jsonl" 2>/dev/null | head -1 | jq -r '.variant // empty' 2>/dev/null)
  [ -n "$PINNED" ] && printf '%s\n' "$PINNED" > "$marker" 2>/dev/null
fi

if [ -n "$PINNED" ] && [ -f "$DIR/variants/$PINNED.md" ]; then
  SLUG="$PINNED"
# Rotation: "rotate:a,b,c" → deterministic per-session assignment by stable hash.
elif [ "${ACTIVE#rotate:}" != "$ACTIVE" ]; then
  IFS=',' read -ra POOL <<< "${ACTIVE#rotate:}"
  n=${#POOL[@]}
  [ "$n" -gt 0 ] || exit 0
  h=$(printf '%s' "$SESSION" | cksum | cut -d' ' -f1)
  SLUG="${POOL[$(( h % n ))]}"
else
  SLUG="$ACTIVE"
fi

FILE="$DIR/variants/$SLUG.md"
[ -f "$FILE" ] || exit 0

# Log the (session → variant) assignment once per session for later A/B correlation.
mkdir -p "$SEEN" 2>/dev/null || true
if [ ! -e "$marker" ]; then
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  cwd=$(printf '%s' "$INPUT" | jq -r '.cwd // ""' 2>/dev/null)
  printf '{"ts":"%s","session":"%s","variant":"%s","cwd":"%s"}\n' \
    "$ts" "$SESSION" "$SLUG" "$cwd" >> "$HOME/.claude/directives-log.jsonl" 2>/dev/null || true
  printf '%s\n' "$SLUG" > "$marker" 2>/dev/null || true
  # The same assignment, on the session's identity record that traces reads (session-identity.sh).
  "$(dirname "${BASH_SOURCE[0]}")/session-identity.sh" "$SESSION" \
    "$(jq -nc --arg v "$SLUG" '{"agent.directive.variant": $v}')" 2>/dev/null || true
fi

jq -n --rawfile body "$FILE" --arg slug "$SLUG" '
  { hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: ("<interaction-directive variant=\"" + $slug + "\">\n" + $body + "\n</interaction-directive>")
  } }'
