#!/usr/bin/env bash
# PreToolUse(Bash) self-gate: before a `git push`, ensure the repo's local
# pre-push gate (scripts/preflight.sh via .githooks/pre-push) will actually fire.
#
# Root cause it closes: core.hooksPath can get pinned away from .githooks (e.g. a
# stale .git/hooks/pre-push `exit 0` stub), silently disabling the gate so red
# pushes sail to CI. This re-routes git at .githooks when a preflight repo ships
# one, refuses --no-verify (the banned bypass), and on a branch missing the hook
# file runs `preflight --quick` directly. It no-ops outside preflight repos and
# fails open on any infrastructural problem, so it never breaks a legitimate push.
#
# Codex has no hook analog (see dotfiles claude/install.sh): there the same
# git-level pre-push hook + the repo's check-githooks-wired invariant provide the
# coverage, and this hook's config self-heal fixes the shared repo for Codex too.

command -v jq >/dev/null 2>&1 || exit 0 # no jq → can't parse; never block a push
INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')
[ -n "$CMD" ] || exit 0

# Detect a real `git push` subcommand: tolerate an `rtk ` wrapper and inline
# flags/args, anchored at a command boundary so `git commit -m "push"` won't match.
printf '%s' "$CMD" | grep -Eq '(^|[;&|]|&&|\|\|)[[:space:]]*(rtk[[:space:]]+)?git([[:space:]]+-[^[:space:]]+([[:space:]]+[^[:space:]]+)?)*[[:space:]]+push([[:space:]]|$)' || exit 0

deny() {
  jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# --no-verify bypasses the pre-push gate — banned.
if printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])--no-verify([[:space:]]|$)'; then
  deny "git push --no-verify bypasses the pre-push gate (banned). Run \`pnpm signoff\` (or \`pnpm preflight\`) and push without --no-verify."
fi

[ -n "$CWD" ] || CWD=$PWD
ROOT=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null) || exit 0 # not a git repo → allow

# Only act in preflight repos; fail open everywhere else.
has_preflight=0
[ -f "$ROOT/scripts/preflight.sh" ] && has_preflight=1
if [ "$has_preflight" -eq 0 ] && [ -f "$ROOT/package.json" ]; then
  jq -e '.scripts.preflight // empty' "$ROOT/package.json" >/dev/null 2>&1 && has_preflight=1
fi
[ "$has_preflight" -eq 1 ] || exit 0

# If the repo ships the pre-push hook, route git at .githooks so it fires on the
# actual push; self-heal a misrouted core.hooksPath. git's own hook then runs
# preflight on the push — no double run here.
if [ -f "$ROOT/.githooks/pre-push" ]; then
  resolved=$(git -C "$ROOT" config --get core.hooksPath 2>/dev/null)
  cur_abs=""
  case "$resolved" in
    "") ;;
    /*) cur_abs="$resolved" ;;
    *) cur_abs="$ROOT/$resolved" ;;
  esac
  if [ "$cur_abs" != "$ROOT/.githooks" ]; then
    git -C "$ROOT" config core.hooksPath .githooks 2>/dev/null
    echo "[preflight-guard] re-routed git at .githooks — the pre-push gate was disabled; it will now run before this push." >&2
  fi
  exit 0
fi

# Preflight repo but no pre-push hook file on this branch (it drifted/was dropped):
# run the quick gate directly and block on red.
LOG="${TMPDIR:-/tmp}/preflight-guard.$$"
if ! bash "$ROOT/scripts/preflight.sh" --quick >"$LOG" 2>&1; then
  tail_out=$(tail -25 "$LOG")
  rm -f "$LOG"
  deny "Local preflight (quick) is RED — fix before pushing. This branch lacks .githooks/pre-push, so I ran it directly.

$tail_out"
fi
rm -f "$LOG"
exit 0
