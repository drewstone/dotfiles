# 2026-10-15 Codex audits unread at merge

## Correction

Drew, 2026-10-15, verbatim:

> are we not reading or taking into account the codex audits on these prs? doesn't seem like it, agents doing anything need to remember to check pr comments we're wasting inference i pay for if we're not looking at thiose audits (if theyre not there carry on)

Behavior it forbids: merging a PR, or calling PR work done, without reading its reviews and Codex audits; leaving an audit unread because it arrived after the merge. When a PR has no audit, carry on.

## Evidence

- Scope: the 22 merged PRs captured on 2026-10-15 from cli-bridge, dotfiles, braid and discovery-lab (merged 2026-10-14 to 10-15), read through the GitHub API (reviews, inline and issue comments per PR).
- None of the 22 had its audit read before merging. Five had Codex comments.
  - Four were usage-limit notices: cli-bridge#252, dotfiles#464, braid#143 and discovery-lab#1855.
  - dotfiles#465 opened at 06:38:50Z, and its Codex review started at 06:38:58Z. The PR merged at 06:39:12Z, while the review was running.
    The review finished at 06:45:12Z with two unanswered P2 inline findings: `claude/tools/beelink-gate:1517`, which measures the wrong pnpm store, and `:1066`, a `du` timeout outside the hold budget.
- dotfiles, 2026-10-11 to 10-15: 20 of 42 completed Codex reviews finished after their PR merged. From start to finish the reviews took 232 s at the median and 603 s at the 90th percentile.
- Recurrence: the 2026-06-19 traces entry in the reflections index says an agent "claimed no review comments from a stale snapshot — async bot had posted real findings". On 2026-10-15 the written rule in `docs/processes/agent-work.md`, "After a push, read available comments, reviews, and inline threads", was in force and did not prevent it.

## Changes

- `gh-drew pr merge`, including `--auto`, reads the PR's review threads and Codex Review Summary in one GraphQL query.
  It refuses on an unanswered Codex thread and waits, within a bound, for a review running on the head.
  It carries on when there is no audit, a usage-limit notice, or a failed review.
  The tests replay the #465 and #464 GraphQL answers.
- merge-on-green's ticks run that check without waiting.
- `claude/AGENTS.md` extends its review line: read every review and audit before merging, answer each finding with a fix or evidence, and read audits that land after a merge and fix forward.
  A merge-time check cannot see that last case.
- The operator probe gains S17.

## Open

- dotfiles#465's two findings are unanswered. They belong to the `claude/tools/beelink-gate` owner, the op-company beelink-gate-caps lane.
- Audits that land after a merge rest on the written rule alone.
