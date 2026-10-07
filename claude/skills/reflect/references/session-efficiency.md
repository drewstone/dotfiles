# Session efficiency

Use when progress stalls, work repeats, or the user requests a waste audit.
Start with one turn and stop when the next useful correction is clear; self-review must not become another monitoring loop.

Resolve the maintained [Tangle Traces CLI](https://github.com/tangle-network/traces#session-facts) and check its help.
On this Mac, it is `~/.local/bin/traces`; bare `traces` currently resolves an unrelated Homebrew tool.
Read deterministic facts before considering model-backed analysis.
This example uses Codex; other agents must select their own `--harness` and explicit `--session` from CLI help.
`--current` uses CODEX_THREAD_ID; an unrelated latest session is not a substitute.

```sh
~/.local/bin/traces facts --harness codex --current --latest-turn |
  jq '{sessions: [.sessions[] | {sessionId, spanCount, toolCalls: .toolCalls.value, tools: .toolCallsByName.value, unread: .unreadRecords, cumulativeTokens: .tokenTotal.value}]}'
```

What changed for the user?
Which calls advanced implementation, verification, or delivery?
Which repeated reads, retries, checks, or waits could disappear?
Inspect only the evidence needed to answer; tool names alone do not establish waste.
Separate productive execution, necessary waits, user gaps, and avoidable repetition without double-counting overlapping work.

`tokenTotal` is a cumulative harness counter, not the selected turn's consumption or billable cost.
Session metadata may span older turns; elapsed time is not wasted time, and unknown cost remains unknown.
Keep raw facts and traces private; share only reviewed metrics and authorized excerpts.
For recurring causes, continue [reflect](../SKILL.md) with the evidence and one correction.
When repeated release checks are the cause, use [work duration](../../tangle-ops/references/work-duration.md) to replace polling with a measured completion check.
