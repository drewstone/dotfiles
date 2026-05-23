#!/usr/bin/env bash
# PreToolUse hook — flag subagent briefs whose premise may be stale.
#
# Fires on `Agent` tool calls (subagent dispatch). The hook is a precise
# conjunction: warn ONLY when ALL three conditions hold:
#   1. The brief contains audit-language patterns ("per the audit",
#      "master is red", "pre-existing breakage", "is missing from", …).
#   2. The brief cites file paths (repo-prefixed `repo-name/path/file.ts`
#      or absolute `/Users/drew/webb/repo-name/path/file.ts`).
#   3. AT LEAST ONE of those cited files has commits in the last 30 minutes
#      in its git repo — i.e., the agent's OWN MERGES may have invalidated
#      the brief's premise within the active session.
#
# When the conjunction holds, the hook prints a warning to stderr and logs
# to `~/.claude/logs/audit-freshness.log`, then exits 0 (non-blocking).
# The dispatching agent sees the warning and can choose to re-verify the
# brief before the subagent runs.
#
# Why a conjunction: any one signal alone is too noisy. Audit-language
# without recently-changed files is normal historical reference; cited
# files without audit-language is just precision. Both together is the
# specific failure mode where an audit's claims about file state have
# been invalidated by intra-session merges — repeatedly observed in
# 2026-05-23 with legal#93 (stale /rl premise), creative#143 (stale
# "pre-existing breakage" claim), legal#96 / gtm#143 (stale lockfile
# claims). Three correctly-refused subagent dispatches that the hook
# would have caught in a one-line co-occurrence check.
#
# Bypass:
#   CC_SKIP_AUDIT_FRESHNESS=1     session-wide override
#
# Log: every flag is appended to `$HOME/.claude/logs/audit-freshness.log`.

set -u

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

[ "${CC_SKIP_AUDIT_FRESHNESS:-}" = "1" ] && exit 0

LOG_DIR="${HOME}/.claude/logs"
LOG_FILE="${LOG_DIR}/audit-freshness.log"
mkdir -p "$LOG_DIR"

INPUT=$(cat)
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')

# Only inspect subagent dispatches.
[ "$TOOL" = "Agent" ] || exit 0

PROMPT=$(printf '%s' "$INPUT" | jq -r '.tool_input.prompt // empty')
[ -z "$PROMPT" ] && exit 0

# Signal A: audit-language patterns. High-precision phrases that indicate
# the brief is leaning on an audit document rather than a current grep.
AUDIT_RE='(per the audit|the audit (found|said|noted|flagged|reported)|audit (said|noted)|master (is red|CI is red)|pre-existing (breakage|CI failure)|is missing from|the audit (report|finding)s?|stale per|per #[0-9]+ audit)'

if ! printf '%s' "$PROMPT" | grep -qiE "$AUDIT_RE"; then
  exit 0
fi

# Signal B + C: extract cited files and check whether any was touched recently.
# Two path forms recognised:
#   - repo-prefixed:  "creative-agent/eval/canonical-runner.ts" (optionally `:123`)
#   - absolute:       "/Users/drew/webb/creative-agent/eval/canonical-runner.ts"
REPO_PATH_RE='[a-z][a-z0-9_-]*-(agent|runtime|eval|builder|tools|container|client)/[A-Za-z0-9_./-]+\.(ts|tsx|js|jsx|md|yaml|yml|toml|json|sql)'
ABS_PATH_RE='/Users/[a-z]+/(webb|company|dotfiles)/[A-Za-z0-9_./-]+\.(ts|tsx|js|jsx|md|yaml|yml|toml|json|sql)'

CITED_REPO=$(printf '%s' "$PROMPT" | grep -oE "$REPO_PATH_RE" | sort -u)
CITED_ABS=$(printf '%s' "$PROMPT" | grep -oE "$ABS_PATH_RE" | sort -u)

[ -z "$CITED_REPO" ] && [ -z "$CITED_ABS" ] && exit 0

RECENT=""

# Check repo-prefixed paths against ~/webb/<repo> and ~/company/<repo>.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  repo_name=$(printf '%s' "$f" | cut -d/ -f1)
  rel_path=$(printf '%s' "$f" | cut -d/ -f2-)
  rel_path="${rel_path%:*}"
  for root in "$HOME/webb/$repo_name" "$HOME/company/$repo_name" "$HOME/code/$repo_name"; do
    if [ -d "$root/.git" ] && [ -f "$root/$rel_path" ]; then
      hits=$(git -C "$root" log --since='30 minutes ago' --pretty='%h %s' -- "$rel_path" 2>/dev/null | head -3)
      if [ -n "$hits" ]; then
        RECENT+="
  $repo_name/$rel_path:
$(printf '%s\n' "$hits" | sed 's/^/    /')"
      fi
      break
    fi
  done
done <<< "$CITED_REPO"

# Check absolute paths against their containing git repo.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  abs_path="${f%:*}"
  [ ! -f "$abs_path" ] && continue
  repo=$(git -C "$(dirname "$abs_path")" rev-parse --show-toplevel 2>/dev/null)
  [ -z "$repo" ] && continue
  rel=$(printf '%s' "$abs_path" | sed "s|^$repo/||")
  hits=$(git -C "$repo" log --since='30 minutes ago' --pretty='%h %s' -- "$rel" 2>/dev/null | head -3)
  if [ -n "$hits" ]; then
    RECENT+="
  $abs_path:
$(printf '%s\n' "$hits" | sed 's/^/    /')"
  fi
done <<< "$CITED_ABS"

if [ -z "$RECENT" ]; then
  exit 0
fi

# Conjunction holds: audit-language AND cited files modified in last 30 min.
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
{
  printf '%s FLAG audit-language + recently-modified files\n' "$TS"
  printf '  signals=%s\n' "$(printf '%s' "$PROMPT" | grep -oiE "$AUDIT_RE" | sort -u | tr '\n' ',' | sed 's/,$//')"
  printf '  files_recently_modified:%s\n' "$RECENT"
} >> "$LOG_FILE"

cat >&2 <<EOF

⚠️  audit-freshness-check: this brief cites audit-language patterns AND references files modified in the last 30 minutes.

Recently-modified cited files:$RECENT

The audit's premise about these files may have been invalidated by intra-session merges. Re-verify against current code (\`git log -1\` on the file; grep for the claimed symbol) before dispatching, or expect the subagent to correctly refuse on false premise.

Bypass: CC_SKIP_AUDIT_FRESHNESS=1
EOF

exit 0
