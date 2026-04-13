#!/usr/bin/env bash
# pursue diff-audit: prepare context for a scoped critical-audit of the branch diff.
#
# Phase 3.5: Before declaring a generation done, audit the diff for
# pattern deviations, missing tests, architectural smells. Fix every
# CRITICAL and HIGH before Phase 4.
#
# This script prints the diff context for /critical-audit to consume.
# It does NOT invoke critical-audit directly (that's a skill dispatch);
# the pursue skill runs this, then dispatches /critical-audit with the
# output as context, scoped to changed files only.

set -euo pipefail

BASE_BRANCH="${BASE_BRANCH:-$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo main)}"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "=== Branch: $CURRENT_BRANCH vs $BASE_BRANCH ==="
echo

echo "=== Changed files ==="
git diff --name-only "$BASE_BRANCH...HEAD" || true
echo

echo "=== Diffstat ==="
git diff --stat "$BASE_BRANCH...HEAD" | tail -20 || true
echo

echo "=== Commits on this branch ==="
git log --oneline "$BASE_BRANCH...HEAD" | head -20 || true
echo

echo "=== Audit targets ==="
echo "Dispatch /critical-audit with these scopes:"
echo "  1. Correctness & Security — focus on the diff files only"
echo "  2. Pattern adherence — do new callsites match existing conventions?"
echo "  3. Test coverage — every new branch covered?"
echo
echo "Fix every CRITICAL and HIGH before declaring the generation done."
