#!/usr/bin/env bash
# RED recipe, round 4: the guard's allowance unit is the measured INVOCATION.
#
# Drives the LIVE hook through the real PreToolUse JSON contract. Reads no env
# var the hook overwrites. Point it at a different hook file with RTK_HOOK —
# that is how the RED is re-created:
#
#   bash tests/rtk-guard-red.sh                           # this fix:      GREEN
#
#   git show be064a0:claude/hooks/rtk-rewrite.sh > /tmp/v6.sh && chmod +x /tmp/v6.sh
#   RTK_HOOK=/tmp/v6.sh bash tests/rtk-guard-red.sh        # fix reverted:  RED
#
#   node tests/rtk-guard-mutants.mjs allow-unmeasured-flag /tmp/m.sh
#   RTK_HOOK=/tmp/m.sh bash tests/rtk-guard-red.sh         # one mutation:  RED
#
# A case FAILS only on a changed ANSWER: emptiness, the set of paths named, the
# exit status, or whether anything went to stderr. Reformatting (rtk strips a
# leading space, reflows hunks) is not a failure — this recipe is not a
# byte-diff, and it deliberately does not count the cases the fix refuses for
# want of measurement rather than for a demonstrated wrong answer.

H=$(readlink -f "${RTK_HOOK:-$HOME/.claude/hooks/rtk-rewrite.sh}")
echo "hook: $H  ($(command grep -m1 rtk-hook-version "$H"))"

T=$(mktemp -d "${TMPDIR:-/tmp}/rtk-guard-red-XXXXXX"); R=$T/repo; mkdir -p "$R"; cd "$R" || exit 2
command git init --quiet --initial-branch=main . >/dev/null
command git config core.hooksPath /dev/null
command git config user.email t@e.invalid; command git config user.name T
for n in 1 2 3; do printf 'alpha\nbefore-%s\nomega\n' "$n" > "f$n.txt"; done
command git add -A; command git -c commit.gpgsign=false commit --quiet -m base
command git branch other
for n in 1 2 3; do printf 'alpha\nafter-%s\nomega\n' "$n" > "f$n.txt"; done

deliver() {
  printf '%s' "{\"tool_input\":{\"command\":$(printf '%s' "$1" | jq -Rs .)}}" \
    | "$H" | jq -r '.hookSpecificOutput.updatedInput.command // empty'
}
paths() { command grep -oE '\bf[0-9]+\.txt\b' | sort -u | tr '\n' ' '; }
empty() { [ -z "$(printf '%s' "$1" | tr -d '[:space:]')" ] && echo yes || echo no; }

FAIL=0
check() {  # $1=command  $2=what changes
  local cmd="$1" d rout rerr rcode gout gerr gcode why=""
  d=$(deliver "$cmd"); [ -z "$d" ] && d="$cmd"
  rout=$(command git --no-pager ${cmd#git } 2>"$T/re"); rcode=$?; rerr=$(cat "$T/re")
  gout=$(bash -c "$d" 2>"$T/ge");                       gcode=$?; gerr=$(cat "$T/ge")
  local rp gp; rp=$(printf '%s' "$rout" | paths); gp=$(printf '%s' "$gout" | paths)
  [ "$(empty "$rout")" = "$(empty "$gout")" ] || why="$why emptiness(real=$(empty "$rout") agent=$(empty "$gout"))"
  [ "$rp" = "$gp" ]                          || why="$why paths(real='$rp' agent='$gp')"
  [ "$rcode" = "$gcode" ]                    || why="$why exit(real=$rcode agent=$gcode)"
  [ "$(empty "$rerr")" = "$(empty "$gerr")" ] || why="$why stderr(real=$(empty "$rerr") agent=$(empty "$gerr"))"
  echo "=============================================================="
  echo "typed:     $cmd"
  echo "delivered: $d"
  if [ -z "$why" ]; then
    echo "VERDICT:   ok   (${#rout} vs ${#gout} bytes, exit $rcode)"
  else
    echo "VERDICT:   WRONG ANSWER  ($2)"
    echo "           changed:$why"
    echo "--- real git ---";                printf '%s\n' "$rout" | head -5
    echo "--- what the agent receives ---"; printf '%s\n' "$gout" | head -5
    FAIL=1
  fi
}

# the flag is what is wrong; the subcommand `diff` is faithful and stays allowed
check "git diff --exit-code"                "whole patch replaced by zero bytes, no truncation notice"
check "git diff --summary"                  "real prints nothing; rtk invents a --stat listing"
check "git diff --dirstat"                  "real prints nothing; rtk invents a --stat listing"
check "git diff --dirstat-by-file"          "real prints nothing; rtk invents a --stat listing"
check "git diff --cumulative"               "real prints nothing; rtk invents a --stat listing"
check "git diff -X"                         "real prints nothing; rtk invents a --stat listing"
check "git diff --no-ignore-matching-lines" "same text, real exits 0 and rtk exits 1"
# the separator is what is wrong: rtk drops `--`, so a pathspec becomes a revision
check "git diff -- other"                   "reports on the BRANCH other, not the file named other"

echo "=============================================================="
echo "the shell tests these invert, run through the hook:"
for probe in "--summary" "--dirstat"; do
  d=$(deliver "git diff $probe"); [ -z "$d" ] && d="git diff $probe"
  re=$(empty "$(command git --no-pager diff $probe)"); he=$(empty "$(bash -c "$d")")
  printf '  [ -n "$(git diff %-10s)" ]  real=%-18s via-hook=%-18s %s\n' "$probe" \
    "$([ "$re" = yes ] && echo 'nothing structural' || echo 'structural changes')" \
    "$([ "$he" = yes ] && echo 'nothing structural' || echo 'structural changes')" \
    "$([ "$re" = "$he" ] && echo ok || { FAIL=1; echo '<<< INVERTED'; })"
done

echo "=============================================================="
echo "and the savings that must survive:"
for keep in "git diff" "git diff --stat" "git diff --cached" "git diff --name-only" "git show-ref"; do
  d=$(deliver "$keep")
  printf '  %-22s -> %-28s %s\n' "$keep" "${d:-<no rewrite>}" \
    "$([ "$d" = "rtk $keep" ] && echo ok || { FAIL=1; echo '<<< COMPACTION LOST'; })"
done
printf '  git diff bytes: real=%s  agent=%s\n' \
  "$(command git --no-pager diff | wc -c)" "$(bash -c "$(deliver 'git diff')" | wc -c)"

cd /; rm -rf "$T"
echo
[ "$FAIL" = 1 ] && { echo "RED: the guard hands rtk invocations it never measured."; exit 1; }
echo "GREEN"; exit 0
