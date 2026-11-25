#!/usr/bin/env bash
# PostToolUse hook on Bash: record the commits and pull requests a session makes (change_ledger.py
# owns the row format and the ledger path). Almost every Bash call makes neither, so this wrapper
# answers those in bash alone and starts python only for a call that names a change, or the first
# call of a session or subagent, which writes the "observed" row. Fail-open: always exits 0.
IN=$(cat)
sid=${IN#*'"session_id":"'}
[ "$sid" = "$IN" ] && exit 0
sid=${sid%%\"*}
key=$sid
case "$IN" in *'"agent_id":"'*)
  aid=${IN#*'"agent_id":"'}
  key=${aid%%\"*}
  ;;
esac
harness=${CHANGE_LEDGER_HARNESS:-claude-code}
seen="${CHANGE_LEDGER_DIR:-$HOME/.local/state/change-ledger}/seen/$harness.$key"
case "$IN" in
  *commit* | *'pr create'* | *'pr merge'*) ;;
  *) [ -e "$seen" ] && exit 0 ;;
esac
printf '%s' "$IN" | python3 -S -E "${0%/*}/change_ledger.py" 2>/dev/null
exit 0
