#!/usr/bin/env bash
# PreToolUse guard: refuse Bash commands that signal processes by pattern or by broadcast.
#
# Denied:
#   pkill, killall                      (any form; they select processes by name or pattern)
#   pgrep ... | xargs kill              (the same selection, one step removed)
#   kill -1 / kill -- -1 / kill 0       (every process the user can signal, or the whole group)
#   kill -<sig> -<n>                    (a negative pid signals a process group)
# Allowed:
#   kill <pid>...                       explicit pids, including $(lsof -ti...) and $(cat pidfile)
#
# Why: on 2026-09-14 a session ran `pkill -f 'cli-bridge-8921.*' -P 1` to restart one bridge. BSD
# pkill stops option parsing at the first pattern, so `-P` and `1` became patterns and every user
# process whose command line contained the digit 1 received SIGTERM: other Claude sessions, Slack,
# postgres, every local cli-bridge, and two research runs an hour into their work.
#
# Resolve the exact pid (lsof -tiTCP:<port> -sTCP:LISTEN, a pidfile, a launch receipt), print its
# command, then `kill <pid>`.
#
# Bypass: CC_ALLOW_BROADCAST_KILL=1 (session-wide, set by the user). Every deny and bypass is logged to
# $HOME/.claude/logs/kill-guard.log.

set -u

command -v jq >/dev/null 2>&1 || exit 0

LOG_DIR="${HOME}/.claude/logs"
mkdir -p "$LOG_DIR"
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG_DIR/kill-guard.log"; }

INPUT=$(cat)
[ "$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')" = "Bash" ] || exit 0
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

# Command position: start of the command, or after a separator, subshell opener, or a prefix
# word (sudo, env, nohup, timeout N, time, exec, command) that still runs the next word.
POS='(^|[;&|({`]|\$\(|\bthen|\bdo|\belse)[[:space:]]*((sudo|env|nohup|time|exec|command|timeout[[:space:]]+[0-9.]+[smhd]?)[[:space:]]+)*'
PATTERN_KILL="${POS}(/usr/bin/|/bin/)?(pkill|killall)([[:space:]]|$)"
PGREP_XARGS='pgrep[^|;&]*\|[[:space:]]*xargs([[:space:]]+-[^[:space:]]+)*[[:space:]]+(sudo[[:space:]]+)?kill\b'

# kill's first dash-argument is the signal (-9, -TERM, -0, -s SIG, -n N); `--` ends options. Any
# target after that which is 0 or starts with a dash is a process group or every process.
broadcast_kill() {
  local segment words i w seen_signal targets
  while IFS= read -r segment; do
    read -r -a words <<< "$segment" || true
    i=0
    while [ $i -lt ${#words[@]} ]; do
      case "${words[$i]}" in sudo|env|nohup|time|exec|command) i=$((i+1)) ;; timeout) i=$((i+2)) ;; *) break ;; esac
    done
    [ $i -lt ${#words[@]} ] || continue
    case "${words[$i]}" in kill|/bin/kill) ;; *) continue ;; esac
    i=$((i+1)); seen_signal=0; targets=0
    while [ $i -lt ${#words[@]} ]; do
      w="${words[$i]}"
      if [ $targets -eq 0 ]; then
        case "$w" in
          --) targets=1 ;;
          -s|-n) i=$((i+1)); seen_signal=1 ;;
          -l|-L) break ;;
          -*) if [ $seen_signal -eq 0 ]; then seen_signal=1; else return 0; fi ;;
          0) return 0 ;;
          *) targets=1 ;;
        esac
      else
        case "$w" in 0|-[0-9]*) return 0 ;; esac
      fi
      i=$((i+1))
    done
  done < <(printf '%s\n' "$CMD" | sed -E 's/(\$\(|`|&&|\|\||[;&|(){}])/\n/g')
  return 1
}

deny() {
  log "DENY reason=\"$1\" command=\"$(printf '%s' "$CMD" | tr '\n' ' ' | head -c 300)\""
  jq -n --arg reason "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  exit 0
}

match=""
if printf '%s' "$CMD" | grep -qE "$PATTERN_KILL"; then match="pattern kill (pkill/killall)"
elif printf '%s' "$CMD" | grep -qE "$PGREP_XARGS"; then match="pattern kill (pgrep | xargs kill)"
elif broadcast_kill "$CMD"; then match="broadcast kill (pid -1, 0, or a negative process group)"
fi
[ -z "$match" ] && exit 0

if [ "${CC_ALLOW_BROADCAST_KILL:-0}" = "1" ]; then
  log "BYPASS match=\"$match\" command=\"$(printf '%s' "$CMD" | tr '\n' ' ' | head -c 300)\""
  exit 0
fi

deny "Blocked $match. These select processes by name, pattern, or group, and one misplaced argument widens them to the whole user session (2026-09-14: a pkill SIGTERMed other Claude sessions, Slack, postgres, and every bridge). Resolve the exact pid (lsof -tiTCP:<port> -sTCP:LISTEN, a pidfile, a launch receipt), print its command, then kill <pid>. User override: CC_ALLOW_BROADCAST_KILL=1."
