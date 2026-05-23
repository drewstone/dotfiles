---
name: agent-eval-adoption
description: "Adopt @tangle-network/agent-eval in a real agent product. Use for eval harnesses, product eval loops, optimization, GEPA/autoresearch campaigns, launch gates, traces, feedback trajectories, and release confidence."
---

# Agent Eval Adoption

Use this skill when adding or reviewing `@tangle-network/agent-eval` in a
product repo.

## Principle

Wrap the real product workflow. Do not build a separate toy eval path.

```txt
product task
  -> observe typed product state
  -> validate with deterministic checks first
  -> judge only subjective quality
  -> act through the real product adapter
  -> store trace + feedback trajectory
  -> replay trajectories for optimization
  -> mutate prompt/code candidates in isolated worktrees
  -> rerun train/dev/holdout gates
  -> promote only through measured release confidence
```

## Adoption Checklist

1. Identify the real workflow being evaluated.
2. Define the product state shape.
3. Implement `observe`, `validate`, `decide`, and `act` around the real product
   runtime or replay fixture.
4. Add deterministic validators before LLM judges.
5. Emit traces with run id, scenario id, commit, model, prompt/config hashes,
   costs, tool calls, retrieval spans, and artifacts.
6. Convert completed runs into `FeedbackTrajectory` records.
7. Split replay scenarios into train/dev/test/holdout.
8. Use `runMultiShotOptimization()` only against the same adapter shape.
9. Promote only through held-out gates and `evaluateReleaseConfidence()`.

## Autoresearch / GEPA Campaign Contract

When the user asks for autoresearch, GEPA, recursive improvement, or a system
that improves an agent over time, do not stop at "GEPA-shaped data." Build or
verify the whole campaign loop:

1. Ingest live and eval runs into one typed corpus with run ids, commit, model,
   prompt/config hashes, tool calls, artifacts, costs, and user feedback.
2. Convert every usable run into optimizer examples and feedback trajectories;
   failed infrastructure/auth/tool setup is a typed failed run, not a score.
3. Define mutable surfaces explicitly: prompt components, tool docs, workflow
   policy, retrieval corpus, generated code, and product adapters.
4. Run a candidate search over those surfaces using GEPA-style reflection or
   `runMultiShotOptimization()`; every candidate gets a stable id and rationale.
5. Apply each candidate in an isolated git worktree or branch, never in-place
   against unrelated user work.
6. Rerun train/dev/holdout scenarios through the same product adapter. The
   holdout gate decides promotion; LLM judges cannot override deterministic
   failures, build failures, runtime failures, or missing credentials.
7. Promote by opening a reviewable PR or writing a clearly named local candidate
   only when the gate passes. Persist the report, traces, candidate diff, and
   release-confidence summary.
8. Schedule recurring runs only after the one-shot campaign works locally and
   produces auditable artifacts.

Minimum commands/artifacts for a product repo:

- `pnpm eval` or equivalent: produces run artifacts and traces.
- `pnpm eval:improve` or equivalent: turns artifacts into findings and candidate
  prompt/code/knowledge changes.
- `pnpm eval:optimize` or equivalent: runs the search campaign and holdout gate.
- `.evolve/` or an equivalent run directory: stores findings, reports, candidate
  ids, traces, and promotion decisions.

## Success Claim Discipline

This is not a guarantee of product success. It is a measured improvement
system. Call it successful only when:

- the loop exercises the real product adapter or a faithful replay fixture;
- a baseline and candidate both run on the same scenarios;
- holdout performance improves without increasing critical failures;
- costs, latency, and failure classes stay within declared budgets;
- the resulting change is reviewable and reversible.

Anything weaker is scaffolding. Useful scaffolding is fine, but label it as
readiness, not as autonomous optimization.

## What Belongs In agent-eval

- trace, run, feedback, dataset, and score contracts
- control-loop mechanics
- verifier and judge orchestration
- failure taxonomy
- paired statistics
- optimization inputs
- release confidence outputs

## What Stays In The Product

- product state and domain models
- browser/sandbox/CLI/voice/integration drivers
- credentials and approval policy
- UI and persistence
- deployment and model gateway
- real user outcome telemetry

## Review Red Flags

- The eval path does not exercise the production adapter.
- LLM judges override failed build/test/runtime gates.
- No holdout split exists.
- "GEPA ready" is claimed from examples alone, without a runner that mutates
  candidates and reruns gates.
- Runs do not record commit, model, prompt hash, config hash, or cost.
- User feedback is not converted into replayable trajectories.
- Missing auth/data/retrieval readiness is reported as a prompt failure.
- Reports make claims without run ids or trace evidence.
- Candidate changes land directly on a dirty user branch instead of an isolated
  worktree or reviewable PR.

## Key Docs

- `@tangle-network/agent-eval` README
- `docs/product-eval-adoption.md`
- `docs/feature-guide.md`
- `docs/control-runtime.md`
- `docs/feedback-trajectories.md`
- `docs/multi-shot-optimization.md`
- `docs/knowledge-readiness.md`
