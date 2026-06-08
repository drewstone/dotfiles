---
name: agent-behavior-audit
description: >-
  Audit whether autonomous agents are actually doing the job they were assigned:
  observing real state, acting through real tools, reflecting on outcomes,
  improving over time, and staying aligned to user intent. Use for agent fleets,
  trading bots, AI copilots, workflow agents, sandbox agents, and any
  trace/log-backed autonomy claim.
---

# Agent Behavior Audit

Use this when the question is not "does the code compile?" but "is the agent genuinely behaving like the product says?"

The default stance is adversarial. Treat prose, UI labels, and architecture docs as claims until trace/log/tool evidence proves them.

## Audit Questions

Answer these directly, with evidence:

1. What was each agent instructed or configured to do?
2. What did it actually observe before acting?
3. What tools, APIs, trades, writes, or side effects did it actually execute?
4. Did it inspect the result of its own actions?
5. Did it reflect, revise, self-improve, promote, rollback, or explicitly choose no change?
6. Did it follow the user's mandate, allowed scope, assets, venues, integrations, risk limits, and safety mode?
7. Is the UI showing real evidence, or just summaries/placeholders?
8. What is the smallest correct wiring change that would close the behavior gap?

## Evidence Order

Prefer final work-product evidence over intent:

1. Production traces, spans, run records, transcripts, token counts, tool calls.
2. Durable side effects: database rows, files, decisions JSONL, metrics snapshots, events, commits, orders, messages.
3. Evaluation artifacts: scorecards, analyst outputs, pass/fail labels, judge traces.
4. Runtime configuration: prompts, harness configs, strategy configs, risk params.
5. Code paths that explain how the behavior should happen.
6. Documentation and UI copy, only as claims to verify.

If an endpoint is unauthorized or missing, record that as an evidence state. Do not collapse it into "empty."

## Procedure

1. Inventory the fleet.
   - List every agent, owner, status, mode, user prompt/mandate, active config, schedule, and runtime.
   - Mark duplicates, inactive agents, and agents with stale or inaccessible state.

2. Separate real loops from labels.
   - Distinguish deterministic jobs, LLM runs, chat sessions, background cron, eval-only loops, and manual operator actions.
   - Check token counts, transcript availability, session IDs, trace IDs, and workflow kinds.

3. Pull side effects.
   - For each agent, collect recent actions, runs, messages, tool calls, metrics, durable logs, artifacts, and outcomes.
   - For products with high-impact actions, verify process-boundary effects, not just internal claims.

4. Check observation quality.
   - Confirm whether the agent observed current state, prior actions, portfolio/work item status, external signals, user constraints, errors, and market/news or domain context when relevant.
   - Flag "signals_generated=0", missing metrics, synthetic-only state, stale state, and no-op observations.

5. Check action validity.
   - Compare actual actions against mandate, asset/integration/venue allowlists, risk limits, paper/live mode, and expected strategy.
   - Flag wrong venue, wrong asset, no action when action was required, repeated no-op, and actions with no validation.

6. Check reflection and improvement.
   - Look for explicit outcome analysis, reward/score recording, config mutation, candidate generation, backtest/holdout evidence, promotion gates, rollback gates, and visible lineage.
   - A self-improvement subsystem existing in code is not evidence that self-improvement is live.

7. Summarize as BLUF plus table.
   - Lead with yes/no answers to the audit questions.
   - Include per-agent rows: loop type, observations, actions, outcomes, reflection, alignment, confidence, flags.
   - Keep raw JSON/log artifacts linked or written to disk for replay.

8. Propose the wiring plan.
   - Prefer the smallest durable architecture that makes behavior observable and adaptive.
   - Name the records/events that must be written, the loop that consumes them, the gates that prevent bad promotion, and the UI surfaces that should expose them.

## Required Output

Produce:

- BLUF: direct verdict in 5 bullets or fewer.
- Evidence table: one row per agent or agent class.
- Findings: ordered by impact, with exact trace/log/config references.
- Wiring plan: concrete records, jobs, APIs, gates, and UI surfaces.
- Confidence: what is proven, inferred, inaccessible, or unverified.

## Red Flags

- Recent runs have zero tokens and no transcripts while the product claims LLM reasoning.
- Runs exist but no durable tool side effects exist.
- Side effects exist but have no timestamps, no IDs, or no link to the run that produced them.
- Agents do not read their own prior actions or outcomes.
- "Self-improvement" endpoints exist but revision count stays at initial state.
- Strategy config contradicts the user prompt.
- UI shows agent-like language for deterministic cron behavior.
- Unauthorized evidence endpoints hide the most important behavior from normal product operators.

## Reusable Metrics

Track these whenever possible:

- `loop_mode`: deterministic, LLM, hybrid, inactive, unknown.
- `run_count`, `token_count`, `transcript_count`, `trace_count`.
- `actions_total`, `validated_actions`, `failed_actions`, `noop_actions`.
- `side_effects_captured`: yes/no/inaccessible.
- `observed_current_state`, `observed_prior_actions`, `observed_external_signals`.
- `reflection_count`, `candidate_count`, `promotion_count`, `rollback_count`.
- `mandate_alignment`: aligned, partial, mismatch, inactive.
- `evidence_confidence`: proven, inferred, inaccessible, missing.
