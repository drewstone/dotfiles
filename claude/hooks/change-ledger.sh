#!/usr/bin/env bash
# PostToolUse hook on Bash: record the commits and pull requests a session makes (change_ledger.py
# owns the row format and the ledger path). Almost every Bash call makes neither, so this wrapper
# answers those in bash alone and starts python only for a call that names a change, or the first
# call of a session or subagent, which writes the "observed" row. When it cannot read the session
# from the payload it starts python, which decides. Fail-open: always exits 0.
# The harness is the first argument (Codex's hooks.json says `change-ledger.sh codex`), else CHANGE_LEDGER_HARNESS, else claude-code.
export CHANGE_LEDGER_HARNESS=${1:-${CHANGE_LEDGER_HARNESS:-claude-code}}
IN=$(cat)
key=
if [[ $IN =~ \"session_id\"[[:space:]]*:[[:space:]]*\"([A-Za-z0-9._-]+)\" ]]; then
  key=${BASH_REMATCH[1]}
  if [[ $IN =~ \"agent_id\"[[:space:]]*:[[:space:]]*\"([A-Za-z0-9._-]+)\" ]]; then key=${BASH_REMATCH[1]}; fi
fi
if [ -n "$key" ]; then
  harness=$CHANGE_LEDGER_HARNESS
  seen="${CHANGE_LEDGER_DIR:-$HOME/.local/state/change-ledger}/seen/$harness.$key"
  case "$IN" in
    *commit* | *'pr create'* | *'pr merge'*) ;;
    *) [ -e "$seen" ] && exit 0 ;;
  esac
fi
printf '%s' "$IN" | python3 -S -E "${0%/*}/change_ledger.py" 2>/dev/null
exit 0
