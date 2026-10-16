#!/usr/bin/env bash
# SessionStart hook. Two jobs, both fail-open (a missing tool or any failure exits 0):
#
# 1. Bind this Claude process to a lineage run and export the run's TANGLE_* ids (and
#    OTEL_RESOURCE_ATTRIBUTES) through CLAUDE_ENV_FILE to every command the session runs. The
#    lineage tool (tangle-tools lineage/, installed at ~/.local/bin/lineage) owns that logic and
#    the ID contract; this wrapper only finds it.
# 2. Record who acted in this session (session-identity.sh): the harness, the model Claude Code
#    reports, the profile (the --agent name, else the dotfiles profile every interactive session
#    loads), a digest of the global instructions that profile is made of, and a digest of the
#    installed skills. inject-directive.sh adds the directive variant on the first prompt.

INPUT=$(cat)
# The real hooks dir, so the helper is found from a checkout pulled before install.sh relinks.
HOOKS=$(dirname "$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")")

LINEAGE="${LINEAGE_BIN:-$HOME/.local/bin/lineage}"
if [ -x "$LINEAGE" ]; then
  printf '%s' "$INPUT" | "$LINEAGE" hook claude-session-start || true
fi

command -v jq >/dev/null 2>&1 || exit 0
SESSION=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
[ -n "$SESSION" ] || exit 0

if command -v sha256sum >/dev/null 2>&1; then
  sha256() { sha256sum | cut -d' ' -f1; }
else
  sha256() { shasum -a 256 | cut -d' ' -f1; }
fi

# The global instructions: CLAUDE.md and every file it imports with a line-leading @path.
instructions_digest() {
  local root="$HOME/.claude/CLAUDE.md" dir
  [ -f "$root" ] || return 0
  dir=$(dirname "$(readlink -f "$root" 2>/dev/null || echo "$root")")
  {
    printf '%s\n' "== CLAUDE.md"
    cat "$root"
    sed -n 's/^@\([^[:space:]]*\).*/\1/p' "$root" | while read -r ref; do
      [ -f "$dir/$ref" ] || continue
      printf '%s\n' "== $ref"
      cat "$dir/$ref"
    done
  } 2>/dev/null | sha256
}

skills_digest() {
  # One process for every skill: tail names each file it prints, relative to the skills dir.
  (cd "$HOME/.claude/skills" 2>/dev/null && LC_ALL=C tail -n +1 -- */SKILL.md 2>/dev/null) | sha256
}

PROFILE=$(printf '%s' "$INPUT" | jq -r '.agent_type // empty' 2>/dev/null)
PROFILE=${PROFILE:-dotfiles}
INSTRUCTIONS=$(instructions_digest)
SKILLS=$(skills_digest)
# An empty input still hashes (to this); only a digest of real content is recorded.
EMPTY=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
[ "$SKILLS" = "$EMPTY" ] && SKILLS=""
[ "$INSTRUCTIONS" = "$EMPTY" ] && INSTRUCTIONS=""

ATTRS=$(printf '%s' "$INPUT" | jq -c \
  --arg profile "$PROFILE" --arg instructions "$INSTRUCTIONS" --arg skills "$SKILLS" '{
    "agent.harness": "claude-code",
    "agent.model": (.model // ""),
    "agent.profile.name": $profile,
    "agent.profile.digest": (if $instructions == "" then "" else "sha256:" + $instructions end),
    "agent.skills.digest": (if $skills == "" then "" else "sha256:" + $skills end)
  }' 2>/dev/null) || exit 0
"$HOOKS/session-identity.sh" "$SESSION" "$ATTRS" || true
exit 0
