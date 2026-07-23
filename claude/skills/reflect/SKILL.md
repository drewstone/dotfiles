---
name: reflect
description: Find repeated misses, product signals, process improvements, automation, and skill gaps.
---

# Reflect

Use this to learn from work already done.
The output is decisions and reusable lessons, not a diary.

## Modes

- Session: inspect the current conversation and artifacts.
- Project: inspect one repo's state, history, `.evolve/`, PRs, and outcomes.
- Portfolio: inspect multiple recent projects and find repeated patterns.

## Flow

1. Collect source material: trace/session IDs, transcript, git history, PRs, test results, release state, user corrections, and outcome records.
2. Separate observed facts, unlinked repository history, and interpretation.
3. Link a skill to a session and an outcome before calling it effective; a catalog, document read, or `.evolve/skill-runs.jsonl` row alone is not enough.
4. Identify repeated outcome-defined failures and the smallest process change that could address them.
5. Propose a new skill only when the same failure appears in at least 5 independent sessions, no existing skill covers it, and a fresh comparison can measure the result.
6. Write only durable lessons that future agents can act on, then dispatch the next skill or stop.

## Output

Return top findings, evidence, measurement status, what to change, what to keep doing, and where to store any durable note.
Use `references/full-reference.md` for portfolio workflow and reflection templates.

## Then consider

- `governor` when reflection should choose the next action.
- `evolve` when a measurable process improvement is ready.
