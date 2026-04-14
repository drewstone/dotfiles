#!/usr/bin/env bash
# pursue preflight: surface existing patterns before writing new code.
#
# Phase 1 Rule 2: "Match the codebase." Before writing code that calls an
# existing API or does an existing operation, find 3 existing callsites and
# match their pattern exactly. Pattern-deviation is the #1 source of
# post-merge critical bugs.
#
# Usage: preflight.sh <pattern1> [<pattern2> ...]
# Example: preflight.sh secureFetch withSidecarUpstreamAuth

set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "not in a git repo — skipping preflight" >&2
  exit 0
fi

echo "=== Working tree ==="
git status --short | head -20 || true
echo

echo "=== Recent commits (last 10) ==="
git log --oneline -10 || true
echo

if [ $# -eq 0 ]; then
  echo "no patterns provided — pass API names or operations you're about to use"
  echo "usage: preflight.sh <pattern1> [<pattern2> ...]"
  exit 0
fi

for pattern in "$@"; do
  echo "=== Callsites for: $pattern ==="
  # Show up to 5 callsites across common source extensions
  matches=$(git grep -n -E "$pattern" -- \
    '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.rs' '*.go' '*.sol' \
    2>/dev/null | grep -v 'test\.\|tests/\|__tests__/' | head -5 || true)
  if [ -z "$matches" ]; then
    echo "  (no non-test matches — this is a new pattern, document its intended convention)"
  else
    echo "$matches"
  fi
  echo

  echo "=== Related commits ==="
  git log --oneline --all -30 --grep="$pattern" 2>/dev/null | head -3 || true
  echo
done

echo "=== Next ==="
echo "1. Read each callsite above to understand the canonical pattern."
echo "2. Match imports, auth wrappers, error handling, logging, file layout."
echo "3. If your new code diverges, document why in the pursuit spec."
