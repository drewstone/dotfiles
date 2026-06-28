---
name: review-to-green
description: Drive a pull request to an approving / no-blockers review by triaging each finding against the real code before acting, fixing genuine ones (and proving each fix catches its bug), answering false positives with evidence, gating locally before every push, and stopping at a named terminal state. Use after opening or updating a PR, or when asked to "address the review", "get it to green", or "fix the review comments".
---

# Review-to-green

A PR has a review (a bot's multi-shot, a human's, or both). This loop drives it to **approved / no-blockers** without trusting the verdict blindly — reviewers, especially bots, mislabel severity and flag the bug you just fixed. The win condition is observable (the review state), so it is a loop, not open-ended autonomy.

`review-to-green <PR# | URL>` — or infer the PR from the current branch.

## The cycle (repeat until a terminal state)

1. **Pull the live review directly** — not a cached summary. Read the formal reviews (the **newest** `CHANGES_REQUESTED`/`COMMENTED` is the live verdict, not an earlier `APPROVED`), the inline line-level threads, and the latest summary comment. On Tangle repos use the Drew PR identity (`gh-drew`); elsewhere `gh`.
2. **Triage every finding against ground truth before touching code.** For each: open the cited file/line, re-run the named test/command, or check the diff. Sort into **real** (reproduced) vs **false positive** (the finding is wrong, describes already-fixed code, or contradicts the actual contract). A bot's `CRITICAL`/`HIGH` is a claim, not a fact.
3. **Fix the real ones — and prove each fix.** Make the smallest correct change. For a fix guarded by a test, **mutation-verify it**: revert the fix, confirm the test goes red, restore. A green test that never failed proves nothing.
4. **Answer false positives with evidence, don't edit code to appease them.** Reply on the PR naming the file:line/test that refutes the finding.
5. **Gate locally before pushing.** Run the repo's local gate (e.g. `pnpm preflight` / the project's check command), typecheck, and the affected tests. Fix what it reds. Distinguish a real failure from an environment artifact (missing native binding, unbuilt dist) by proving it — never push on an unproven red, never dismiss one unproven.
6. **Push, then re-request review** (the bot re-runs ~1–3 min after a push; a fix can draw a new finding). Read the new verdict before claiming progress.

## Stop (name the terminal state — never report a stall as success)

- **Done:** the review is `APPROVED` / no blockers, or only findings you rejected-as-false (with posted evidence) remain.
- **No-progress:** two consecutive passes surface no new *real* findings — stop and report what's left.
- **Blocked:** a finding needs a human decision, a credential, or a contract change beyond scope — escalate with the specifics.

## Boundaries

- **Never merge** as part of this loop. Drive to green, report merge-ready, and let the human merge unless they explicitly authorize the merge in the same ask. Releases to a protected/production branch always need explicit human direction.
- Preserve unrelated work; keep changes scoped to the findings.
- Re-read current PR + branch state each pass; never act on a stale review or a base that has moved (rebase/merge + re-gate if it has).

## Anti-patterns this loop exists to kill

- Fixing a "CRITICAL" that, on inspection, describes the fix already in the diff (triage first).
- Shipping a regression test that was green before the change (mutation-prove it).
- Pushing on targeted `tsc`+`vitest` only, then letting CI catch the lint/invariant/cross-package failure (run the whole local gate first).
- Calling a stalled or environment-blocked run "done" (name the terminal state).
