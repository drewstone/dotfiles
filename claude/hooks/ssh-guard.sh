#!/usr/bin/env bash
# PreToolUse guard — block writes to SSH key material unless explicitly
# allowed by the session environment.
#
# Paths guarded (matched anywhere in the Bash command or the
# Write/Edit file_path):
#   ~/.ssh/id_*            private + public keys for any algorithm
#   .ssh/authorized_keys   any authorized_keys under $HOME or /root or /home/*/
#
# Mutating operators matched on Bash:
#   >, >>, tee, rm, mv, cp <dst>, chmod, sed -i, ssh-keygen -f <path>
#
# Read-only Bash usage (cat, grep, ssh-add -l, ssh-keygen -l -f, ssh-keygen -y -f)
# passes through unchanged.
#
# Bypass:
#   CC_ALLOW_SSH_MUTATE=1        session-wide override (set by user)
#   CC_ALLOW_SSH_MUTATE_REASON=  optional context for the audit log
#
# Motivation: earlier sessions appended public keys to
# `/root/.ssh/authorized_keys` over SSH and mutated local private keys
# during setup flows. Each of those is high-blast-radius. The guard
# turns "I meant to do that" into a deliberate opt-in rather than a
# default affordance.
#
# Log: every block (and every bypass) is appended to
#   $HOME/.claude/logs/ssh-guard.log
# so there's an auditable trail.

set -u

if ! command -v jq >/dev/null 2>&1; then
  # No jq → we can't parse the hook input. Fail open — Claude still
  # sees the command, and the user sees no hook regression from jq
  # being missing. Non-blocking; logged once.
  exit 0
fi

LOG_DIR="${HOME}/.claude/logs"
LOG_FILE="${LOG_DIR}/ssh-guard.log"
mkdir -p "$LOG_DIR"

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG_FILE"
}

INPUT=$(cat)
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')

# Regex: any path segment `.ssh/id_*` or `.ssh/authorized_keys`. Allow
# the path to be absolute, tilde-expanded, or a bare `.ssh/…` reference.
SSH_PATH_RE='(^|[[:space:]/"'\''=])(\$HOME/|~/|/root/|/home/[^/[:space:]]+/)?\.ssh/(id_[A-Za-z0-9_.+-]+|authorized_keys)'

# Bash-command verbs that imply a write/mutation.
#
# `ssh-keygen -t <algo>` generates a new keypair (write). `ssh-keygen`
# without `-t` is mostly read-only (-l fingerprint, -y extract pubkey,
# -F lookup in known_hosts) and intentionally NOT matched, even with
# `-f <path>` — `-f` is overloaded for both input and output files.
BASH_WRITE_RE='(>>?|\btee\b|\brm\b|\bmv\b|\bcp\b|\bchmod\b|\bchown\b|\bsed[[:space:]]+-i\b|\bssh-keygen\b[^|;&]*[[:space:]]-t[[:space:]])'

emit_deny() {
  local reason="$1"
  log "DENY tool=$TOOL reason=\"$reason\""
  jq -n --arg reason "$reason" '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": $reason
    }
  }'
  exit 0
}

# Explicit bypass. Log it so the audit trail still records "this was
# allowed because CC_ALLOW_SSH_MUTATE was set".
if [ "${CC_ALLOW_SSH_MUTATE:-0}" = "1" ]; then
  case "$TOOL" in
    Bash|Write|Edit|NotebookEdit)
      TARGET=""
      if [ "$TOOL" = "Bash" ]; then
        TARGET=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' | head -c 200)
      else
        TARGET=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
      fi
      if printf '%s' "$TARGET" | grep -qE "$SSH_PATH_RE"; then
        log "BYPASS tool=$TOOL reason=\"${CC_ALLOW_SSH_MUTATE_REASON:-unspecified}\" target=\"$TARGET\""
      fi
      ;;
  esac
  exit 0
fi

case "$TOOL" in
  Bash)
    CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
    [ -z "$CMD" ] && exit 0

    # Only deny when BOTH a mutating verb and an SSH path appear. This
    # lets `cat ~/.ssh/id_rsa.pub`, `ssh-keygen -l -f …`, `ssh-add -l`,
    # and `grep authorized_keys …` through without drama.
    if printf '%s' "$CMD" | grep -qE "$SSH_PATH_RE" \
       && printf '%s' "$CMD" | grep -qE "$BASH_WRITE_RE"; then
      emit_deny "Blocked Bash mutation of SSH key material. Set CC_ALLOW_SSH_MUTATE=1 (optionally with CC_ALLOW_SSH_MUTATE_REASON=...) to override. Match: SSH path + write verb in one command."
    fi
    ;;

  Write|Edit|NotebookEdit)
    TARGET=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
    [ -z "$TARGET" ] && exit 0

    if printf '%s' "$TARGET" | grep -qE "$SSH_PATH_RE"; then
      emit_deny "Blocked $TOOL on SSH key material: $TARGET. Set CC_ALLOW_SSH_MUTATE=1 to override."
    fi
    ;;
esac

exit 0
