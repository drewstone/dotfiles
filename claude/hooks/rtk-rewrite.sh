#!/usr/bin/env bash
# rtk-hook-version: 3
# RTK Claude Code hook — rewrites commands to use rtk for token savings.
# Requires: rtk >= 0.23.0, jq
#
# This is a thin delegating hook: all rewrite logic lives in `rtk rewrite`,
# which is the single source of truth (src/discover/registry.rs).
# To add or change rewrite rules, edit the Rust registry — not this file.
#
# EXCEPT for the revision guard below, which lives here because it protects
# against a defect in the Rust side that this hook cannot fix at the source.

# ---------------------------------------------------------------------------
# Revision guard
#
# Invariant: a token-saving filter may drop output DETAIL. It may NEVER change
# WHICH object git reports on.
#
# rtk 0.30.1 violates that. Its `git log` filter suppresses merge commits, so a
# named merge commit vanishes from the result set and the caller is silently
# handed a DIFFERENT commit. Measured in a repo whose 928295e is a merge:
#
#   git log --no-walk --oneline 928295e
#     real -> "928295e Merge pull request #26 from tangle-network/..."
#     rtk  -> (no output at all)
#
#   git log -1 --format='%H %s' 928295e
#     real -> 928295edde6eb51c6faf16d904d6dc6601c52713 Merge pull request #26...
#     rtk  -> 047e4d53f42c1ed3eb4f82a1f82dac3590fddae2 feat(us-tax): exam grown...
#
#   git log --oneline -8 origin/main
#     real -> 8 commits, 2 of them merges
#     rtk  -> the 2 merges omitted and 2 older commits back-filled, so the count
#             matches and the content does not
#
# rtk reproduces `git log --no-merges` exactly, and stops doing so only when
# --merges is passed explicitly. So the guard is:
#
#   1. never hand a history listing (log / whatchanged / shortlog) to rtk, with
#      or without an explicit revision — the substitution needs no revision to
#      happen; and
#   2. never hand rtk any other git command that names an explicit revision
#      (object name, ref, HEAD~n, range), so a future filter regression in
#      show / diff / branch / stash cannot corrupt a git fact either.
#
# Blocked commands are not rewritten at all: real git runs and the caller gets
# the truth. The cost is output verbosity on those commands. That trade is not
# negotiable — an agent that reads a rewritten history draws wrong conclusions
# and has no way to notice.
#
# Set RTK_HOOK_DEBUG=1 to trace guard decisions on stderr.
# Run `rtk-rewrite.sh --guard-check '<command>'` to print allow/block for one
# command string (used by tests/rtk-rewrite.test.mjs).
# ---------------------------------------------------------------------------

# git subcommands whose rtk filter is known to remove commits from the result
# set. Never rewritten, regardless of arguments.
RTK_GUARD_HISTORY_SUBCOMMANDS="log whatchanged shortlog"

# git subcommands whose positional arguments are free-form text (commit
# messages, remotes, paths, config keys) rather than revisions. Scanning these
# for revision-shaped tokens produces false blocks with no safety benefit.
RTK_GUARD_UNSCANNED_SUBCOMMANDS="add commit push pull fetch clone init config remote am apply notes submodule tag"

# git global flags that consume the following argument, so the argument after
# them is not the subcommand.
RTK_GUARD_GLOBAL_VALUE_FLAGS="-C -c --git-dir --work-tree --namespace --exec-path --super-prefix"

rtk_guard_word_in_list() {
  local needle="$1" list="$2" item
  for item in $list; do
    [ "$needle" = "$item" ] && return 0
  done
  return 1
}

# True when the token explicitly names a git revision.
# Deliberately generous: a false positive costs output verbosity, a false
# negative costs a corrupted git fact.
rtk_guard_token_is_revision() {
  local token="$1"

  case "$token" in
    '') return 1 ;;
    -*) return 1 ;;                       # a flag, not a revision
    ./*|../*|/*|'~/'*) return 1 ;;        # a filesystem path
  esac

  # Named pseudo-refs and anything qualified under refs/.
  case "$token" in
    HEAD|HEAD[~^]*|@|@[~^]*|'@{'*) return 0 ;;
    ORIG_HEAD*|FETCH_HEAD*|MERGE_HEAD*|CHERRY_PICK_HEAD*|REVERT_HEAD*|BISECT_HEAD*) return 0 ;;
    refs/*) return 0 ;;
  esac

  # Reflog and ancestry selectors: main@{2}, v1.0~3, topic^2, HEAD^{tree}.
  case "$token" in
    *'@{'*|*'~'*|*'^'*) return 0 ;;
  esac

  # Revision ranges: A..B and A...B. Paths were already excluded above.
  case "$token" in
    *'/..'*) return 1 ;;
    *'..'*) return 0 ;;
  esac

  # Raw object names.
  if printf '%s' "$token" | grep -qE '^[0-9a-fA-F]{7,40}$'; then
    return 0
  fi

  # Bare ref names (main, origin/main, v1.2.3). Ask git rather than guess, so
  # ordinary pathspecs stay rewritable. Only meaningful inside a repository.
  if [ "$RTK_GUARD_IN_REPO" = "1" ] &&
    git rev-parse --verify --quiet "$token^{commit}" >/dev/null 2>&1; then
    return 0
  fi

  return 1
}

# True when this single command segment must not be rewritten.
rtk_guard_segment_blocks() {
  local -a words
  read -r -a words <<<"$1"
  local count=${#words[@]} i=0

  # Skip leading environment assignments and command prefixes.
  while [ "$i" -lt "$count" ]; do
    case "${words[$i]}" in
      *=*) i=$((i + 1)) ;;
      command | builtin | env | sudo | nice | time | exec | \\command | \\git) i=$((i + 1)) ;;
      *) break ;;
    esac
  done
  [ "$i" -lt "$count" ] || return 1

  case "${words[$i]}" in
    git | */git) ;;
    *) return 1 ;;
  esac
  i=$((i + 1))

  # Skip git global options to reach the subcommand.
  local subcommand="" word
  while [ "$i" -lt "$count" ]; do
    word="${words[$i]}"
    case "$word" in
      -*)
        if rtk_guard_word_in_list "$word" "$RTK_GUARD_GLOBAL_VALUE_FLAGS"; then
          i=$((i + 2))
        else
          i=$((i + 1))
        fi
        ;;
      *)
        subcommand="$word"
        i=$((i + 1))
        break
        ;;
    esac
  done
  [ -n "$subcommand" ] || return 1

  if rtk_guard_word_in_list "$subcommand" "$RTK_GUARD_HISTORY_SUBCOMMANDS"; then
    [ -n "$RTK_HOOK_DEBUG" ] && echo "[rtk-guard] block: history listing 'git $subcommand'" >&2
    return 0
  fi

  if rtk_guard_word_in_list "$subcommand" "$RTK_GUARD_UNSCANNED_SUBCOMMANDS"; then
    return 1
  fi

  local arg
  while [ "$i" -lt "$count" ]; do
    arg="${words[$i]}"
    i=$((i + 1))
    [ "$arg" = "--" ] && break # everything after -- is a pathspec
    if rtk_guard_token_is_revision "$arg"; then
      [ -n "$RTK_HOOK_DEBUG" ] && echo "[rtk-guard] block: 'git $subcommand' names revision '$arg'" >&2
      return 0
    fi
  done

  return 1
}

# True when any git segment anywhere in the command string must not be
# rewritten. Blocking the whole string is intentional: rtk rewrites the string
# as a unit, so a single unsafe segment disqualifies all of it.
rtk_guard_blocks_rewrite() {
  local segment
  RTK_GUARD_IN_REPO=0
  git rev-parse --git-dir >/dev/null 2>&1 && RTK_GUARD_IN_REPO=1

  while IFS= read -r segment; do
    if rtk_guard_segment_blocks "$segment"; then
      return 0
    fi
  done < <(printf '%s\n' "$1" | sed -e 's/||/\n/g' -e 's/&&/\n/g' -e 's/[;|()`]/\n/g')

  return 1
}

if [ "$1" = "--guard-check" ]; then
  if rtk_guard_blocks_rewrite "$2"; then echo block; else echo allow; fi
  exit 0
fi

if ! command -v jq &>/dev/null; then
  echo "[rtk] WARNING: jq is not installed. Hook cannot rewrite commands. Install jq: https://jqlang.github.io/jq/download/" >&2
  exit 0
fi

if ! command -v rtk &>/dev/null; then
  echo "[rtk] WARNING: rtk is not installed or not in PATH. Hook cannot rewrite commands. Install: https://github.com/rtk-ai/rtk#installation" >&2
  exit 0
fi

# Version guard: rtk rewrite was added in 0.23.0.
# Older binaries: warn once and exit cleanly (no silent failure).
RTK_VERSION=$(rtk --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
if [ -n "$RTK_VERSION" ]; then
  MAJOR=$(echo "$RTK_VERSION" | cut -d. -f1)
  MINOR=$(echo "$RTK_VERSION" | cut -d. -f2)
  # Require >= 0.23.0
  if [ "$MAJOR" -eq 0 ] && [ "$MINOR" -lt 23 ]; then
    echo "[rtk] WARNING: rtk $RTK_VERSION is too old (need >= 0.23.0). Upgrade: cargo install rtk" >&2
    exit 0
  fi
fi

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$CMD" ]; then
  exit 0
fi

# Correctness beats compaction: never let rtk answer a question about a
# specific git object. See the revision guard notes at the top of this file.
if rtk_guard_blocks_rewrite "$CMD"; then
  exit 0
fi

# Delegate all rewrite logic to the Rust binary.
# rtk rewrite exits 1 when there's no rewrite — hook passes through silently.
REWRITTEN=$(rtk rewrite "$CMD" 2>/dev/null) || exit 0

# No change — nothing to do.
if [ "$CMD" = "$REWRITTEN" ]; then
  exit 0
fi

ORIGINAL_INPUT=$(echo "$INPUT" | jq -c '.tool_input')
UPDATED_INPUT=$(echo "$ORIGINAL_INPUT" | jq --arg cmd "$REWRITTEN" '.command = $cmd')

jq -n \
  --argjson updated "$UPDATED_INPUT" \
  '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "allow",
      "permissionDecisionReason": "RTK auto-rewrite",
      "updatedInput": $updated
    }
  }'
