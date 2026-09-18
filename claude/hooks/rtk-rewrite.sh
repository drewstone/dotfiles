#!/usr/bin/env bash
# rtk-hook-version: 7
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
# Invariant: a token-saving filter may drop output DETAIL, and must say when it
# does. It may NEVER change WHICH object or ref git reports on, invent one, or
# hide one without saying so.
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
#   git fetch              real prints 0 bytes, rtk invents "ok fetched"
#   git add                real prints 0 bytes, rtk invents a file-count summary
#                          (and counts the whole index, not what was added)
#
#   git diff --summary     on a content-only change real prints 0 bytes and rtk
#   git diff --dirstat     prints a --stat listing, which inverts
#   git diff --cumulative  `[ -n "$(git diff --summary)" ]` from "nothing was
#   git diff --dirstat-by-file  created, deleted or renamed" to "structural
#   git diff -X            changes"
#   git diff --exit-code   real prints the whole patch and exits 1; rtk prints
#                          ZERO BYTES, with no truncation notice. On a 300-file
#                          diff that is 45,552 bytes and 300 paths, gone.
#   git diff -- <path>     rtk DROPS the `--` separator, so the operand is
#                          re-read as a revision: `git diff -- main` reports on
#                          the file named `main` under real git (nothing) and on
#                          the BRANCH main under rtk (three files). Same class as
#                          the original `git log` bug, in the one place the
#                          previous allowlist explicitly trusted.
#   git diff --no-ignore-matching-lines
#                          identical text, real exits 0 and rtk exits 1
#
# ---------------------------------------------------------------------------
# THE SHAPE THIS GUARD KEEPS GETTING WRONG, and what replaced it
#
# Four earlier versions were all the same defect: an ENUMERATION that failed
# OPEN. Input the guard did not recognise was treated as safe. Each fix moved
# the enumeration one level down rather than removing it.
#
#   v3 denylisted history subcommands (log/whatchanged/shortlog). rtk rewrites
#      14 subcommands and only ONE of those 3 was among them, so the entire
#      `git branch` family stayed open.
#   v4 inverted to an allowlist but seeded it from assumption rather than
#      measurement: `status` and `add` were on it, and both are unfaithful.
#   v5 had a correct, measured allowlist and could still be defeated by ONE
#      CHARACTER. It split the command string into segments with
#      `sed -e 's/||/\n/g' -e 's/&&/\n/g' -e 's/[;|()`]/\n/g'` — an enumeration
#      of separators that did not contain a bare `&` — and then did
#      `rtk_guard_parse_git_segment "$segment" || continue`, so a segment it
#      could not parse was silently SAFE. `sleep 1 & git log --oneline -7`
#      therefore returned 4 of 7 commits, omitting three merges including HEAD;
#      `git diff & git status --porcelain` on a clean tree returned "ok".
#   v6 made the walk total, so no token could hide a git invocation — and then
#      handed the decision to a list of SUBCOMMANDS. rtk's unit of failure is
#      the INVOCATION: `diff` earned its place on nine measured cases and the
#      guard then trusted all 120 flags git advertises for it, plus every
#      operand form. Six of those flags and one separator are wrong answers,
#      listed above.
#
# v7 keeps v6's walk and replaces the subcommand list with the measured
# invocation. See RTK_GUARD_ALLOWED_SHAPES below.
#
# v6's walk, unchanged, is what makes the shape decision reachable at all. It
# never treats "cannot decide" as "fine", and it is a total walk over the tokens
# of the string rtk PRODUCED:
#
#   PREMISE. rtk's rewrite must be a PURE INSERTION of `rtk` command words:
#     deleting every `rtk` token from the rewritten string must give back the
#     original, token for token. Any other transformation is one this guard has
#     not reasoned about, so it is refused rather than trusted. This premise is
#     what makes the walk below complete — it guarantees the rewritten string
#     contains no command word the caller did not already type.
#
#   WALK. Every token that names git gets a verdict from a CLOSED set:
#     rtk    — the token in command position before it is `rtk`, with nothing
#              standing between them. Allowed only if the subcommand resolves
#              with no git global option, the whole invocation matches a
#              measured-faithful SHAPE, and no argument names a revision.
#     real   — the token before it is the start of the string, or a token that
#              puts the shell back in command position. Real git answers, which
#              is always correct, so nothing more is required.
#     unknown— anything else. REFUSED. This is the inversion: a separator
#              nobody enumerated, a wrapper word nobody listed, a glued
#              `;git` — none of them can hide a git invocation any more,
#              because not recognising the token before `git` is itself a
#              refusal.
#
#   OPAQUE. A token containing `$`, a backtick, or process substitution can
#     expand into anything, including a revision or another command. The walk
#     cannot decide it, so the whole string is refused.
#
# The cost of all three is output verbosity on commands that would otherwise
# compact. That trade is not negotiable: an agent that reads a rewritten history
# draws wrong conclusions and has no way to notice.
#
# MEASURED COST OF THE INSERTION PREMISE. Across 33 common commands, rtk rewrote
# 5 by SUBSTITUTING a different program rather than wrapping the one asked for,
# so all 5 are now refused:
#   rg X    -> rtk grep X                 different search implementation
#   cat F   -> rtk read F                 faithful (400/400 lines, byte-identical)
#   tail -n -> rtk read --tail-lines n    faithful (20/20 lines)
#   head -n -> rtk read --max-lines n     WRONG: `head -20` on a 400-line file
#                                         prints 20 lines, `rtk read --max-lines
#                                         20` prints 10 and says "390 more"
#   jest    -> rtk vitest                 a different test runner entirely
# Two of the five are faithful, so refusing `cat` and `tail` is pure token cost.
# The premise is kept anyway: it is what lets the walk claim it has seen every
# command in the string, and `head` and `jest` show the class is not theoretical.
#
# Set RTK_HOOK_DEBUG=1 to trace guard decisions on stderr.
# Three self-check surfaces, all asserted by tests/rtk-rewrite.test.mjs:
#   --guard-check '<command>'          rtk|real, the END-TO-END decision.
#   --shape-check '<command>'          allowed|refused, the shape table alone,
#                                      so an invocation refused only because it
#                                      names a revision is not confused with one
#                                      whose filter is unfaithful.
#   --shape-of '<command>'             the shape key itself, so the bash and the
#                                      JS implementations can be diffed.
#   --list-shapes                      the whole measured table.
#   --measured-rtk-version             the rtk build the table describes.
#   --safe-check '<original>' '<rewritten>'
#                                      safe|unsafe for an arbitrary pair, so the
#                                      walk is testable without rtk having to
#                                      produce the rewrite.
# ---------------------------------------------------------------------------

# THE UNIT OF TRUST IS THE MEASURED INVOCATION, not the subcommand.
#
# A shape is `<subcommand> [sorted flags] [--] [<path>]`: flags sorted so
# argument order does not matter, operands abstracted to `<path>` because their
# VALUE is a pathspec and any operand that names a revision is refused by a
# separate rule. Every line below is a shape that tests/rtk-fidelity.mjs
# measured, and allowance requires ALL of:
#
#   1. measured in EVERY regime — clean tree, a repo with merges/branches/
#      remotes/worktree/staged+untracked files, and a 300-file diff. A shape
#      measured only on a dirty tree says nothing about a clean one, which is
#      how `git status -b --porcelain` looked faithful while printing "ok" on a
#      clean tree.
#   2. if it takes an operand, measured in every regime with an operand that is
#      ALSO a valid revision. That is the input where a filter can silently
#      answer about a different object, and it is how the `--` drop was caught.
#   3. git itself accepted it in every regime. An invocation git rejects
#      (exit 128/129) exercises git's parser, not rtk's filter, so it measured
#      nothing. This is what keeps every value-taking flag — `--output`, `-S`,
#      `--stat-width`, `--diff-algorithm`, ... — off the list without anyone
#      having to enumerate them: spelled without a value, git rejects them.
#   4. rtk exited exactly as git did, and the fidelity predicate passed, in
#      every regime.
#
# ANY OTHER SHAPE IS REFUSED, including one nobody thought to measure. An
# unknown FLAG is now a refusal in exactly the way an unknown TOKEN already was.
#
# The flags to measure come from git's own enumerations — `git <sub> -h` inside
# and outside a repo, plus `git <sub> --git-completion-helper` — so that list
# decides what gets MEASURED and never what gets TRUSTED. A flag no enumeration
# mentions is simply never measured, and therefore refused: an incomplete
# enumeration costs token savings and cannot cost correctness.
#
# tests/rtk-rewrite.test.mjs re-derives this table from the measurement on every
# run and asserts it matches BOTH ways, printing the correct table on failure.
# Regenerate with: node tests/rtk-fidelity.mjs --shapes
#
# What survives, in one line: 84 `git diff` invocations, 22 `git show-ref`
# invocations, and `git diff-tree --stdin`. `git diff` and `git diff --stat`
# keep the 8.2x compaction that is the whole point of the hook.
#
# A correction to what v5/v6 claimed about `diff-tree`: they said it "in
# practice always names a tree-ish, so the revision rule refuses it
# independently of this list". That is false — `git diff-tree --stdin` names no
# tree-ish, reaches rtk, and is measured clean. It is on the table because it
# was measured, not because it is unreachable.
#
# Beyond the table, three whole classes are refused for want of measurement
# rather than for a known defect, because there is no case for them in the
# matrix at all:
#   - any git GLOBAL option (`-C`, `--git-dir`, `--work-tree`, `-c`,
#     `--literal-pathspecs`, ...). The first three point git at a DIFFERENT
#     REPOSITORY. Checked by hand at rtk 0.30.1: rtk does honour them today.
#   - anything standing around the `rtk` that runs git — a wrapper word, or an
#     environment assignment, which the spawned git inherits (`GIT_DIR=...`).
#   - any operand spelled as a git object rather than a path: `HEAD:file`,
#     `:/text`, `:0:file`, `main^{tree}`, `a..b`, a raw object name.
RTK_GUARD_ALLOWED_SHAPES="diff
diff --abbrev
diff --binary
diff --break-rewrites
diff --cached
diff --check
diff --color-moved
diff --compact-summary
diff --default-prefix
diff --ext-diff
diff --find-copies
diff --find-copies-harder
diff --find-renames
diff --full-index
diff --function-context
diff --histogram
diff --ignore-all-space
diff --ignore-blank-lines
diff --ignore-cr-at-eol
diff --ignore-space-at-eol
diff --ignore-space-change
diff --ignore-submodules
diff --indent-heuristic
diff --irreversible-delete
diff --ita-invisible-in-index
diff --ita-visible-in-index
diff --minimal
diff --name-only
diff --name-status
diff --no-abbrev
diff --no-color
diff --no-color-moved
diff --no-color-moved-ws
diff --no-compact-summary
diff --no-exit-code
diff --no-ext-diff
diff --no-find-copies-harder
diff --no-follow
diff --no-full-index
diff --no-function-context
diff --no-indent-heuristic
diff --no-patch
diff --no-prefix
diff --no-quiet
diff --no-relative
diff --no-rename-empty
diff --no-renames
diff --no-text
diff --no-textconv
diff --numstat
diff --patch
diff --patch-with-raw
diff --patch-with-stat
diff --patience
diff --pickaxe-all
diff --pickaxe-regex
diff --quiet
diff --raw
diff --relative
diff --rename-empty
diff --shortstat
diff --stat
diff --stat -- <path>
diff --stat <path>
diff --submodule
diff --text
diff --textconv
diff --unified
diff --word-diff
diff -B
diff -C
diff -D
diff -M
diff -R
diff -U
diff -W
diff -a
diff -b
diff -p
diff -s
diff -u
diff -w
diff -z
diff <path>
diff-tree --stdin
show-ref
show-ref --abbrev
show-ref --dereference
show-ref --exclude-existing
show-ref --hash
show-ref --head
show-ref --heads
show-ref --no-abbrev
show-ref --no-dereference
show-ref --no-exists
show-ref --no-hash
show-ref --no-head
show-ref --no-heads
show-ref --no-quiet
show-ref --no-tags
show-ref --no-verify
show-ref --quiet
show-ref --tags
show-ref -d
show-ref -q
show-ref -s
show-ref <path>"

# The measurement above was taken against exactly this rtk build. A different
# build has not been measured, and unmeasured is a refusal — so an rtk upgrade
# turns compaction off until the matrix is re-run, rather than silently trusting
# a table that describes a binary that is no longer installed.
RTK_GUARD_MEASURED_RTK_VERSION="rtk 0.30.1"

# git's own global options, from git(1). A closed set: an option outside it is
# undecidable, and undecidable is a refusal, so an unknown flag cannot hide the
# subcommand behind it.
RTK_GUARD_GIT_FLAGS_VALUE="-C -c --exec-path --git-dir --work-tree --namespace --super-prefix --config-env --attr-source --list-cmds"
RTK_GUARD_GIT_FLAGS_BARE="-p --paginate -P --no-pager --no-replace-objects --no-lazy-fetch --no-optional-locks --no-advice --bare --literal-pathspecs --glob-pathspecs --noglob-pathspecs --icase-pathspecs --version --help --html-path --man-path --info-path"

# Words that may stand between command position and the command word without
# being the command. Listing MORE of them can only cause more refusals: the walk
# skips them looking for an `rtk` behind, and finding one is what refuses.
RTK_GUARD_PREFIX_WORDS="command builtin exec env sudo doas nice ionice nohup stdbuf setsid time timeout"

# Tokens that put the shell back in command position, so a git word after one of
# them is run by the shell rather than by an rtk that precedes it. Missing an
# entry here costs a refusal, never an allowance — the opposite of v5, where
# missing `&` cost the whole allowlist.
RTK_GUARD_COMMAND_POSITION="&& || | |& ; ;; ;& ;;& & ( ) (( )) { } ! then else elif do done fi esac in if while until for case select function"

rtk_guard_debug() {
  [ -n "$RTK_HOOK_DEBUG" ] && echo "[rtk-guard] $*" >&2
  return 0
}

rtk_guard_word_in_list() {
  local needle="$1" list="$2" item
  for item in $list; do
    [ "$needle" = "$item" ] && return 0
  done
  return 1
}

# Whitespace split with globbing disabled. Total: every string yields a token
# list, newlines included. There is no separator enumeration here — splitting on
# separators is exactly what v5 got wrong.
rtk_guard_tokenize() {
  local saved_ifs="$IFS" restore_glob=0
  case $- in
    *f*) ;;
    *) restore_glob=1 ;;
  esac
  set -f
  IFS=$' \t\n'
  # shellcheck disable=SC2206  # deliberate word splitting; globbing is off
  RTK_GUARD_TOK=($1)
  IFS="$saved_ifs"
  [ "$restore_glob" = 1 ] && set +f
  return 0
}

# Shell quoting is not command structure: `g"i"t branch` runs git. Comparing the
# unquoted spelling means quoting cannot hide a command word from the walk.
rtk_guard_unquote() {
  RTK_GUARD_UNQUOTED="${1//\'/}"
  RTK_GUARD_UNQUOTED="${RTK_GUARD_UNQUOTED//\"/}"
  RTK_GUARD_UNQUOTED="${RTK_GUARD_UNQUOTED//\\/}"
}

rtk_guard_is_rtk_word() {
  rtk_guard_unquote "$1"
  case "$RTK_GUARD_UNQUOTED" in
    rtk | */rtk) return 0 ;;
  esac
  return 1
}

rtk_guard_is_git_word() {
  rtk_guard_unquote "$1"
  case "$RTK_GUARD_UNQUOTED" in
    git | */git) return 0 ;;
  esac
  return 1
}

# A token whose value this guard cannot know until the shell expands it.
rtk_guard_token_is_opaque() {
  case "$1" in
    *'$'* | *'`'* | *'<('* | *'>('*) return 0 ;;
  esac
  return 1
}

# True when the token explicitly names a git revision.
# Deliberately generous: a false positive costs output verbosity, a false
# negative costs a corrupted git fact.
rtk_guard_token_is_revision() {
  local token="$1"

  case "$token" in
    '') return 1 ;;
    -*) return 1 ;;                # a flag, not a revision
    ./* | ../* | /* | '~/'*) return 1 ;; # a filesystem path
  esac

  # Named pseudo-refs and anything qualified under refs/.
  case "$token" in
    HEAD | HEAD[~^]* | @ | @[~^]* | '@{'*) return 0 ;;
    ORIG_HEAD* | FETCH_HEAD* | MERGE_HEAD* | CHERRY_PICK_HEAD* | REVERT_HEAD* | BISECT_HEAD*) return 0 ;;
    refs/*) return 0 ;;
  esac

  # Reflog and ancestry selectors: main@{2}, v1.0~3, topic^2, HEAD^{tree}.
  case "$token" in
    *'@{'* | *'~'* | *'^'*) return 0 ;;
  esac

  # Anything with a colon is a git object spelling, not a plain pathspec:
  # HEAD:file (a blob at a revision), :/text (search commit messages), :0:file
  # (an index stage). None of these resolve under `rev-parse ^{commit}`, so the
  # lookup below cannot see them and they reached rtk as if they were paths.
  case "$token" in
    *:*) return 0 ;;
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

# Who runs the git word at index $1: `rtk`, `real`, or `unknown`.
# Total over the token that precedes it — every token lands in exactly one of
# the three, and `unknown` is a refusal.
rtk_guard_route_of_git_word() {
  local i=$(($1 - 1))

  RTK_GUARD_ROUTE_SKIPPED=0
  while [ "$i" -ge 0 ]; do
    rtk_guard_unquote "${RTK_GUARD_TOK[$i]}"
    case "$RTK_GUARD_UNQUOTED" in
      *=*)
        RTK_GUARD_ROUTE_SKIPPED=$((RTK_GUARD_ROUTE_SKIPPED + 1))
        i=$((i - 1))
        continue
        ;;
    esac
    rtk_guard_word_in_list "$RTK_GUARD_UNQUOTED" "$RTK_GUARD_PREFIX_WORDS" || break
    RTK_GUARD_ROUTE_SKIPPED=$((RTK_GUARD_ROUTE_SKIPPED + 1))
    i=$((i - 1))
  done

  if [ "$i" -lt 0 ]; then
    RTK_GUARD_ROUTE=real
    return 0
  fi
  if rtk_guard_is_rtk_word "${RTK_GUARD_TOK[$i]}"; then
    RTK_GUARD_ROUTE=rtk
    # ...and nothing may stand in front of that `rtk` either. An environment
    # assignment there is inherited by the git rtk spawns — `GIT_DIR=/elsewhere
    # git diff` reports on another repository — and a wrapper word in front of
    # rtk is a shape no case measured. Only the start of the string or a token
    # that opens a fresh command counts as clean.
    if [ "$i" -gt 0 ]; then
      rtk_guard_unquote "${RTK_GUARD_TOK[$((i - 1))]}"
      rtk_guard_word_in_list "$RTK_GUARD_UNQUOTED" "$RTK_GUARD_COMMAND_POSITION" ||
        RTK_GUARD_ROUTE_SKIPPED=$((RTK_GUARD_ROUTE_SKIPPED + 1))
    fi
    return 0
  fi
  rtk_guard_unquote "${RTK_GUARD_TOK[$i]}"
  if rtk_guard_word_in_list "$RTK_GUARD_UNQUOTED" "$RTK_GUARD_COMMAND_POSITION"; then
    RTK_GUARD_ROUTE=real
    return 0
  fi
  RTK_GUARD_ROUTE=unknown
  return 0
}

# Resolve the subcommand of the git word at index $1 into RTK_GUARD_SUBCOMMAND,
# with RTK_GUARD_ARG_START pointing at its first argument. Returns 1 for any
# shape this walk cannot resolve — an unknown global option, or running off the
# end without a subcommand — which the caller treats as a refusal.
rtk_guard_resolve_subcommand() {
  local i=$(($1 + 1)) tok name count=${#RTK_GUARD_TOK[@]}

  RTK_GUARD_SUBCOMMAND=""
  RTK_GUARD_ARG_START=0
  RTK_GUARD_GLOBALS=0

  while [ "$i" -lt "$count" ]; do
    rtk_guard_unquote "${RTK_GUARD_TOK[$i]}"
    tok="$RTK_GUARD_UNQUOTED"
    case "$tok" in
      --*=*)
        name="${tok%%=*}"
        if rtk_guard_word_in_list "$name" "$RTK_GUARD_GIT_FLAGS_VALUE" ||
          rtk_guard_word_in_list "$name" "$RTK_GUARD_GIT_FLAGS_BARE"; then
          RTK_GUARD_GLOBALS=1
          i=$((i + 1))
          continue
        fi
        return 1
        ;;
      -*)
        if rtk_guard_word_in_list "$tok" "$RTK_GUARD_GIT_FLAGS_VALUE"; then
          RTK_GUARD_GLOBALS=1
          i=$((i + 2))
          continue
        fi
        if rtk_guard_word_in_list "$tok" "$RTK_GUARD_GIT_FLAGS_BARE"; then
          RTK_GUARD_GLOBALS=1
          i=$((i + 1))
          continue
        fi
        return 1
        ;;
      *)
        RTK_GUARD_SUBCOMMAND="$tok"
        RTK_GUARD_ARG_START=$((i + 1))
        return 0
        ;;
    esac
  done
  return 1
}

# The SHAPE of the invocation whose arguments start at $1, into RTK_GUARD_SHAPE:
#
#   <subcommand> [flags, sorted] [--] [<path>]
#
# Flags are sorted so argument order does not matter. Operands are abstracted to
# a single `<path>`, because what an operand NAMES is decided separately — any
# operand naming a revision is refused by rtk_guard_args_name_revision before
# the shape is consulted. A `--` anywhere is recorded, because rtk drops it and
# that changes which object git reports on.
#
# The scan stops only at a token it POSITIVELY recognises as ending the
# invocation: a command-position token. An unrecognised token does not stop it,
# so it can only pull MORE tokens into the shape and cause a refusal, never
# fewer and hide one. This is the same fail-closed direction as the revision
# scan, and the opposite of v5's separator list.
rtk_guard_shape_of_invocation() {
  local i="$1" tok count=${#RTK_GUARD_TOK[@]} saw_dashdash=0 saw_operand=0
  local -a flags
  flags=()

  while [ "$i" -lt "$count" ]; do
    rtk_guard_unquote "${RTK_GUARD_TOK[$i]}"
    tok="$RTK_GUARD_UNQUOTED"
    if rtk_guard_word_in_list "$tok" "$RTK_GUARD_COMMAND_POSITION"; then
      break
    fi
    if [ "$saw_dashdash" = 1 ]; then
      saw_operand=1
    elif [ "$tok" = "--" ]; then
      saw_dashdash=1
    else
      case "$tok" in
        -*)
          # Git advertises either spelling of this show-ref alias.
          case "$RTK_GUARD_SUBCOMMAND:$tok" in
            show-ref:--branches|show-ref:--no-branches) tok="${tok%branches}heads" ;;
          esac
          flags+=("$tok")
          ;;
        *) saw_operand=1 ;;
      esac
    fi
    i=$((i + 1))
  done

  # Sorted in-process, in byte order. Not `| sort`: a subshell that failed for
  # any reason would substitute an EMPTY flag list, turning `diff --summary`
  # into the shape `diff`, which is on the table. And not the default collation
  # either — `[[ a < b ]]` follows LC_COLLATE, which orders punctuation
  # differently from the byte order the measured table was sorted in.
  local LC_ALL=C
  local j k tmp
  for ((j = 1; j < ${#flags[@]}; j++)); do
    tmp="${flags[$j]}"
    k=$((j - 1))
    while [ "$k" -ge 0 ] && [[ ${flags[$k]} > $tmp ]]; do
      flags[$((k + 1))]="${flags[$k]}"
      k=$((k - 1))
    done
    flags[$((k + 1))]="$tmp"
  done

  RTK_GUARD_SHAPE="$RTK_GUARD_SUBCOMMAND"
  for j in "${flags[@]}"; do
    RTK_GUARD_SHAPE="$RTK_GUARD_SHAPE $j"
  done
  [ "$saw_dashdash" = 1 ] && RTK_GUARD_SHAPE="$RTK_GUARD_SHAPE --"
  [ "$saw_operand" = 1 ] && RTK_GUARD_SHAPE="$RTK_GUARD_SHAPE <path>"
  return 0
}

# Exact line match against the measured table. Nothing is inferred from it: a
# shape that is not literally listed is refused.
rtk_guard_shape_is_allowed() {
  local line
  while IFS= read -r line; do
    [ "$line" = "$1" ] && return 0
  done <<<"$RTK_GUARD_ALLOWED_SHAPES"
  return 1
}

# True when some argument of the invocation starting at $1 names a revision.
# Stops only at the ONE token it POSITIVELY recognises as ending the invocation:
# a command-position token, after which any git word gets its own verdict from
# the walk. A token it does not recognise does not stop the scan, so an
# unrecognised separator can only widen the scan and cause a refusal, never
# narrow it and hide a revision.
#
# It does NOT stop at `--`, even though under real git everything after `--` is
# a pathspec. rtk DROPS the `--`, so a pathspec written after it is re-read as a
# revision: `git diff --stat -- main` asks about the FILE main and rtk answers
# about the BRANCH main. Trusting `--` here would hand rtk the one argument
# position where it is known to change which object it reports on.
#
# It also deliberately does NOT stop at the next `git` or `rtk` word. Stopping
# there would let `git diff git HEAD~1` hand a revision to rtk, because the scan
# would end on the literal argument `git` and never reach `HEAD~1`.
rtk_guard_args_name_revision() {
  local i="$1" tok count=${#RTK_GUARD_TOK[@]}

  while [ "$i" -lt "$count" ]; do
    rtk_guard_unquote "${RTK_GUARD_TOK[$i]}"
    tok="$RTK_GUARD_UNQUOTED"
    [ "$tok" = "--" ] && {
      i=$((i + 1))
      continue
    }
    rtk_guard_word_in_list "$tok" "$RTK_GUARD_COMMAND_POSITION" && return 1
    if rtk_guard_token_is_revision "$tok"; then
      RTK_GUARD_REVISION="$tok"
      return 0
    fi
    i=$((i + 1))
  done
  return 1
}

# THE PREMISE. Deleting every `rtk` token from the rewritten string must give
# back the original, token for token. This is what makes the walk complete: it
# guarantees rtk introduced no command word the caller did not type, so the git
# words the walk finds are all of them.
rtk_guard_is_pure_insertion() {
  local -a stripped
  local t i

  stripped=()
  for t in "${RTK_GUARD_TOK[@]}"; do
    rtk_guard_is_rtk_word "$t" && continue
    stripped+=("$t")
  done

  if [ "${#stripped[@]}" -ne "${#RTK_GUARD_ORIG_TOK[@]}" ]; then
    rtk_guard_debug "refuse: rtk changed the command beyond inserting 'rtk' (${#stripped[@]} tokens vs ${#RTK_GUARD_ORIG_TOK[@]})"
    return 1
  fi
  for ((i = 0; i < ${#RTK_GUARD_ORIG_TOK[@]}; i++)); do
    if [ "${stripped[$i]}" != "${RTK_GUARD_ORIG_TOK[$i]}" ]; then
      rtk_guard_debug "refuse: rtk changed the command beyond inserting 'rtk' ('${RTK_GUARD_ORIG_TOK[$i]}' became '${stripped[$i]}')"
      return 1
    fi
  done
  return 0
}

# The whole safety decision, over the pair (what the caller typed, what rtk
# produced). Returns 0 only when the rewrite is PROVEN safe.
rtk_guard_rewrite_is_provably_safe() {
  local original="$1" rewritten="$2"
  local t i

  rtk_guard_tokenize "$original"
  RTK_GUARD_ORIG_TOK=("${RTK_GUARD_TOK[@]}")
  rtk_guard_tokenize "$rewritten" # RTK_GUARD_TOK is the rewritten string from here on

  for t in "${RTK_GUARD_TOK[@]}"; do
    if rtk_guard_token_is_opaque "$t"; then
      rtk_guard_debug "refuse: token '$t' expands at run time, so its content cannot be decided here"
      return 1
    fi
  done

  # The hook must not launder an rtk the caller wrote itself, and the insertion
  # premise below does not hold if the original already invoked rtk.
  for t in "${RTK_GUARD_ORIG_TOK[@]}"; do
    if rtk_guard_is_rtk_word "$t"; then
      rtk_guard_debug "refuse: the command already invokes rtk itself"
      return 1
    fi
  done

  rtk_guard_is_pure_insertion || return 1

  RTK_GUARD_IN_REPO=0
  git rev-parse --git-dir >/dev/null 2>&1 && RTK_GUARD_IN_REPO=1

  for ((i = 0; i < ${#RTK_GUARD_TOK[@]}; i++)); do
    rtk_guard_is_git_word "${RTK_GUARD_TOK[$i]}" || continue

    rtk_guard_route_of_git_word "$i"
    case "$RTK_GUARD_ROUTE" in
      real) continue ;;
      unknown)
        rtk_guard_debug "refuse: cannot tell who runs the git at token $i (preceded by '${RTK_GUARD_TOK[$((i - 1))]}')"
        return 1
        ;;
    esac

    # Nothing may stand between `rtk` and the `git` it runs. A wrapper word or
    # an environment assignment there changes the invocation in a way no case
    # measured — `env GIT_DIR=/elsewhere git diff` reports on another
    # repository — and the shape below cannot see it.
    if [ "$RTK_GUARD_ROUTE_SKIPPED" -gt 0 ]; then
      rtk_guard_debug "refuse: $RTK_GUARD_ROUTE_SKIPPED token(s) stand around the rtk that runs this git, which no measurement covers"
      return 1
    fi

    if ! rtk_guard_resolve_subcommand "$i"; then
      rtk_guard_debug "refuse: rtk would run a git whose subcommand this guard cannot resolve"
      return 1
    fi

    # git's own global options are unmeasured, so they are refused. `-C`,
    # `--git-dir` and `--work-tree` point git at a DIFFERENT REPOSITORY; `-c`
    # overrides any config; `--literal-pathspecs` and friends change how the
    # operands are read. Measured today (rtk 0.30.1) rtk does honour -C and
    # --git-dir — but "we checked once by hand" is not what this guard runs on,
    # and no case in the matrix carries a global, so the shape table says
    # nothing about them.
    if [ "$RTK_GUARD_GLOBALS" = "1" ]; then
      rtk_guard_debug "refuse: 'git $RTK_GUARD_SUBCOMMAND' carries a git global option, which no measurement covers"
      return 1
    fi
    rtk_guard_shape_of_invocation "$RTK_GUARD_ARG_START"
    if ! rtk_guard_shape_is_allowed "$RTK_GUARD_SHAPE"; then
      rtk_guard_debug "refuse: 'git $RTK_GUARD_SHAPE' is not a measured-faithful invocation"
      return 1
    fi
    if rtk_guard_args_name_revision "$RTK_GUARD_ARG_START"; then
      rtk_guard_debug "refuse: 'git $RTK_GUARD_SUBCOMMAND' names revision '$RTK_GUARD_REVISION'"
      return 1
    fi
  done

  return 0
}

# Prints the rewritten command on stdout and returns 0 when rtk may answer;
# returns 1 when the caller must be given the command they typed.
rtk_guard_rewrite() {
  local command="$1" rewritten running

  rewritten=$(rtk rewrite "$command" 2>/dev/null) || return 1
  [ "$command" = "$rewritten" ] && return 1

  rtk_guard_rewrite_is_provably_safe "$command" "$rewritten" || return 1

  # The shape table describes ONE rtk build; another build is unmeasured, and
  # unmeasured is a refusal. Checked last only because it costs a process spawn
  # and everything reaching this point is about to hand work to rtk. It gates
  # every success, which is the whole requirement.
  running=$(rtk --version 2>/dev/null | head -1)
  if [ "$running" != "$RTK_GUARD_MEASURED_RTK_VERSION" ]; then
    rtk_guard_debug "refuse: ${running:-unknown} is not the measured build $RTK_GUARD_MEASURED_RTK_VERSION; re-run tests/rtk-fidelity.mjs --shapes"
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

# The shape rule alone, over a command the caller typed. Distinct from
# --guard-check, which also reflects the revision rule, so that an invocation
# refused only because it happens to name a revision is not mistaken for one
# refused because its filter is unfaithful.
if [ "$1" = "--shape-check" ] || [ "$1" = "--shape-of" ]; then
  rtk_guard_tokenize "$2"
  RTK_GUARD_SHAPE=""
  for ((i = 0; i < ${#RTK_GUARD_TOK[@]}; i++)); do
    rtk_guard_is_git_word "${RTK_GUARD_TOK[$i]}" || continue
    rtk_guard_resolve_subcommand "$i" && rtk_guard_shape_of_invocation "$RTK_GUARD_ARG_START"
    break
  done
  if [ "$1" = "--shape-of" ]; then
    printf '%s\n' "$RTK_GUARD_SHAPE"
  elif [ -n "$RTK_GUARD_SHAPE" ] && rtk_guard_shape_is_allowed "$RTK_GUARD_SHAPE"; then
    echo allowed
  else
    echo refused
  fi
  exit 0
fi

# The measured table itself, so the test can assert it equals what the matrix
# derives — in both directions — instead of sampling it one shape at a time.
if [ "$1" = "--list-shapes" ]; then
  printf '%s\n' "$RTK_GUARD_ALLOWED_SHAPES"
  exit 0
fi

# The rtk build the shape table was measured against.
if [ "$1" = "--measured-rtk-version" ]; then
  printf '%s\n' "$RTK_GUARD_MEASURED_RTK_VERSION"
  exit 0
fi

# The walk itself, over an arbitrary (original, rewritten) pair. rtk is not
# consulted, so the test can present rewrites rtk would never produce — which is
# the only way to check that the guard refuses them.
if [ "$1" = "--safe-check" ]; then
  if rtk_guard_rewrite_is_provably_safe "$2" "$3"; then echo safe; else echo unsafe; fi
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
