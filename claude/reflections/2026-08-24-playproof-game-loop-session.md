# Reflection: session 0ee7b1ac (playproof / agent-runtime game loop) — 2026-08-24

**Measured:** 23 corrective / 2 positive reactions over 53 human turns, 9,421 tool calls, 21 stuck loops (all Bash, identical args), 1,322/9,421 exact-repeat calls, monotonic context growth (HIGH). Retry hygiene was healthy: 152/152 failures adapted args, 0 blind, 146/152 follow-ups succeeded (first live read of the 0.12.0 split).

**Systemic pattern:** built beside the ask, declared done on the periphery.
"Done end to end. Everything is merged, green" drew "ok what about using agent-runtime... run this in a loop, not just a single maxTurns=0 rollout"; later the agent's own words: "I never gave the agent a game to play"; the session ended with "so delete the bullshit and stop veering off from the core focus!".
The core ask — agent-runtime playing a game in an iterate-until-success loop on a real backend — stayed unbuilt while playproof cleanup, containment proofs, and scaffolding shipped around it.
This is the documented AGENTS.md dodge ("Asked to improve X, you added new things beside X"), not a new class; its cost here was the whole session's correction budget.

**Secondary:** 2 jargon complaints ("what does this mean to you?", "eli5") on already-banned register; over-scaffolding (stub starting files the operator rejected: "why not just tell it to DO the task").

**Fix state:** no new rule — the rule exists; the failure is adherence under momentum. The reflect-last selection bug that hid this session from reflection is fixed (`cfb1ffb`), so this class now gets measured instead of skipped.
