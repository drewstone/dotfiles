#!/usr/bin/env bash
# rtk-hook-version: 5
# RTK Claude Code hook — rewrites commands to use rtk for token savings.
# Requires: rtk >= 0.23.0, jq
#
# This is a thin delegating hook: all rewrite logic lives in `rtk rewrite`,
# which is the single source of truth (src/discover/registry.rs).
# To add or change rewrite rules, edit the Rust registry — not this file.
#
# EXCEPT for the correctness guard below, which lives here because it protects
# against defects in the Rust side that this hook cannot fix at the source.

# ---------------------------------------------------------------------------
# Correctness guard
#
# Invariant: a token-saving filter may drop output DETAIL. It may NEVER change
# WHICH object or ref git reports on, invent one, or hide one.
#
# rtk 0.30.1 violates that in most of the git subcommands it filters. Every row
# below is measured, real git vs `rtk git`, by tests/rtk-fidelity.mjs — which is
# the same code the test suite runs, so this table cannot drift from the check:
#
#   git log ...            merge commits are dropped from the walk, so a named
#                          merge vanishes and a DIFFERENT commit is returned
#   git branch -v/-vv      every sha dropped, a fabricated "git branch" header
#                          added; output is indistinguishable from plain
#                          `git branch`, so the caller cannot tell it asked for
#                          shas and got none
#   git branch -r          real prints 0 bytes, rtk prints "* " — a branch that
#                          does not exist
#   git branch --no-merged the same phantom "* " prepended to the real answer,
#                          so "everything is merged" reads as "one unmerged"
#   git branch -a          13 of 13 origin/* refs absent, so a pushed branch is
#                          displayed exactly like an unpushed one
#   git status             untracked list truncated at 10 ("... +2 more"), so
#                          paths git named are hidden
#   git status --short     on a CLEAN tree real prints 0 bytes and rtk prints
#   git status --porcelain "ok", which inverts the standard
#                          `[ -z "$(git status --porcelain)" ]` clean check
#   git stash list         real prints 0 bytes, rtk prints "No stashes"
#   git show --name-only   hides the commit sha and the refs it reports on
#   git worktree list      absolute paths rewritten to a literal "~/..."
#   git commit             the created commit's sha is replaced by "ok"
#   git push               "a1b2c3d..e4f5g6h main -> main" becomes "ok main"
#   git pull               which ref advanced is replaced by "ok (up-to-date)"
#   git fetch              real prints 0 bytes, rtk prints "ok fetched"
#   git add                real prints 0 bytes, rtk invents a file-count summary
#                          (and counts the whole index, not what was added)
#
# Faithful in every measured form, and the only subcommands rtk may answer:
#   git diff (incl. --stat/--cached/--name-only/--name-status, renames,
#             deletes, binaries, clean tree), git show-ref, git diff-tree.
#
# Two earlier shapes of this guard were wrong, both in the same direction:
#   v3 denylisted history subcommands (log/whatchanged/shortlog). rtk rewrites
#      14 subcommands and only ONE of those 3 was among them, so the entire
#      `git branch` family stayed open.
#   v4 inverted to an allowlist but seeded it from assumption rather than
#      measurement: `status` and `add` were on it, and both are unfaithful.
# The allowlist below is derived from the measured matrix, not from judgement.
#
# Two layers:
#
#   1. Revision guard (pre). Never hand rtk a git command that names an explicit
#      revision — object name, ref, HEAD~n, range. Cheap, and it holds for
#      subcommands nobody has audited yet.
#
#   2. Subcommand allowlist (post). Run `rtk rewrite`, then inspect what it
#      ACTUALLY produced. If the rewritten string routes any git subcommand
#      outside RTK_GUARD_ALLOWED_SUBCOMMANDS to rtk, throw the whole rewrite
#      away. Checking rtk's real output rather than predicting it means a future
#      rtk that starts filtering `git rev-parse` is refused by default, and a
#      subcommand rtk chooses not to touch is not needlessly blocked.
#
# Blocked commands are not rewritten at all: real git runs and the caller gets
# the truth. The cost is output verbosity. That trade is not negotiable — an
# agent that reads a rewritten history draws wrong conclusions and has no way to
# notice.
#
# Set RTK_HOOK_DEBUG=1 to trace guard decisions on stderr.
# Run `rtk-rewrite.sh --guard-check '<command>'` to print rtk/real for one
# command string: "rtk" means rtk's output reaches the caller, "real" means it
# does not. This is the END-TO-END decision, both layers included.
# Run `rtk-rewrite.sh --allowlist-check '<subcommand>'` to print allowed/refused
# for layer 2 alone. Both are what tests/rtk-rewrite.test.mjs asserts against.
# ---------------------------------------------------------------------------

# git subcommands whose rtk filter preserves every object, ref and path real git
# reports, in every form in the measured matrix. Nothing else is handed to rtk.
#
#   diff       reflowed to diffstat + hunks; every changed path and changed line
#              preserved, including renames, deletes and binaries (the
#              `index <blob>..<blob>` header is dropped, which names blobs, not
#              the commits, refs or paths under discussion)
#   show-ref   byte-identical in every form measured
#   diff-tree  faithful; in practice it also always names a tree-ish, so layer 1
#              refuses it independently of this list
#
# Everything else rtk rewrites is refused: branch, log, show, status, stash,
# worktree, add, commit, push, pull, fetch. Each has at least one measured case
# where it hides, invents or substitutes an object, ref or path — see the table
# above. tests/rtk-rewrite.test.mjs asserts this list matches the measurement in
# BOTH directions, so a subcommand cannot be blocked without evidence, and
# cannot be allowed once evidence exists against it.
RTK_GUARD_ALLOWED_SUBCOMMANDS="diff show-ref diff-tree"

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

# Parse one command segment. When it invokes git — directly, behind a prefix
# such as `command`/`env`, or behind `rtk` — set RTK_GUARD_SUBCOMMAND to the git
# subcommand and RTK_GUARD_ARGS to everything after it, then return 0.
# Return 1 for any segment that does not invoke git.
rtk_guard_parse_git_segment() {
  local -a words
  read -r -a words <<<"$1"
  local count=${#words[@]} i=0

  RTK_GUARD_SUBCOMMAND=""
  RTK_GUARD_ARGS=()

  # Skip leading environment assignments and command prefixes.
  while [ "$i" -lt "$count" ]; do
    case "${words[$i]}" in
      *=*) i=$((i + 1)) ;;
      command | builtin | env | sudo | nice | time | exec | rtk | \\command | \\git) i=$((i + 1)) ;;
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
  local word
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
        RTK_GUARD_SUBCOMMAND="$word"
        i=$((i + 1))
        break
        ;;
    esac
  done
  [ -n "$RTK_GUARD_SUBCOMMAND" ] || return 1

  while [ "$i" -lt "$count" ]; do
    RTK_GUARD_ARGS+=("${words[$i]}")
    i=$((i + 1))
  done
  return 0
}

# Split a command string into segments on shell separators. rtk rewrites the
# string as a unit, so every segment has to be judged.
rtk_guard_segments() {
  printf '%s\n' "$1" | sed -e 's/||/\n/g' -e 's/&&/\n/g' -e 's/[;|()`]/\n/g'
}

# Layer 1 — true when any git segment names an explicit revision.
rtk_guard_names_revision() {
  local segment arg
  RTK_GUARD_IN_REPO=0
  git rev-parse --git-dir >/dev/null 2>&1 && RTK_GUARD_IN_REPO=1

  while IFS= read -r segment; do
    rtk_guard_parse_git_segment "$segment" || continue
    rtk_guard_word_in_list "$RTK_GUARD_SUBCOMMAND" "$RTK_GUARD_UNSCANNED_SUBCOMMANDS" && continue

    for arg in "${RTK_GUARD_ARGS[@]}"; do
      [ "$arg" = "--" ] && break # everything after -- is a pathspec
      if rtk_guard_token_is_revision "$arg"; then
        [ -n "$RTK_HOOK_DEBUG" ] &&
          echo "[rtk-guard] refuse: 'git $RTK_GUARD_SUBCOMMAND' names revision '$arg'" >&2
        return 0
      fi
    done
  done < <(rtk_guard_segments "$1")

  return 1
}

# Layer 2 — true when the string rtk PRODUCED routes some git subcommand outside
# the allowlist to rtk. Judging rtk's actual output rather than guessing at it
# is what makes this hold for subcommands rtk has not filtered yet.
rtk_guard_rewrite_is_unsafe() {
  local segment
  while IFS= read -r segment; do
    case "$segment" in
      *rtk*) ;;
      *) continue ;; # segment does not invoke rtk, so rtk cannot answer for it
    esac
    rtk_guard_parse_git_segment "$segment" || continue
    if ! rtk_guard_word_in_list "$RTK_GUARD_SUBCOMMAND" "$RTK_GUARD_ALLOWED_SUBCOMMANDS"; then
      [ -n "$RTK_HOOK_DEBUG" ] &&
        echo "[rtk-guard] refuse: rtk would answer 'git $RTK_GUARD_SUBCOMMAND', which is not on the allowlist" >&2
      return 0
    fi
  done < <(rtk_guard_segments "$1")

  return 1
}

# The whole decision. Prints the rewritten command on stdout and returns 0 when
# rtk may answer; returns 1 when the caller must be given real git.
rtk_guard_rewrite() {
  local command="$1" rewritten

  if rtk_guard_names_revision "$command"; then
    return 1
  fi

  rewritten=$(rtk rewrite "$command" 2>/dev/null) || return 1
  [ "$command" = "$rewritten" ] && return 1

  if rtk_guard_rewrite_is_unsafe "$rewritten"; then
    return 1
  fi

  printf '%s' "$rewritten"
  return 0
}

if [ "$1" = "--guard-check" ]; then
  if ! command -v rtk &>/dev/null; then
    echo real
    exit 0
  fi
  if rtk_guard_rewrite "$2" >/dev/null; then echo rtk; else echo real; fi
  exit 0
fi

# Layer 2 in isolation: may rtk answer for this git subcommand at all? Distinct
# from --guard-check, which also reflects the revision guard. The test needs
# both, so that a subcommand refused only because it happens to name a revision
# is not mistaken for one refused because its filter is unfaithful.
if [ "$1" = "--allowlist-check" ]; then
  if rtk_guard_word_in_list "$2" "$RTK_GUARD_ALLOWED_SUBCOMMANDS"; then
    echo allowed
  else
    echo refused
  fi
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

# Correctness beats compaction: never let rtk answer a question whose answer is
# which object or ref git is reporting on. See the guard notes at the top.
REWRITTEN=$(rtk_guard_rewrite "$CMD") || exit 0

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
