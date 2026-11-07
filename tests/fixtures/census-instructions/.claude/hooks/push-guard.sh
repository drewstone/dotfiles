#!/usr/bin/env bash
# PreToolUse(Bash) block: refuses `git push --no-verify`, which skips the pre-push gate.
case "$(cat)" in *--no-verify*) echo "push-guard: --no-verify skips the pre-push gate" >&2; exit 2 ;; esac
