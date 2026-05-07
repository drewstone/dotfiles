---
name: agent-eval-adoption
description: "Adopt @tangle-network/agent-eval in a real agent product. Use for eval harnesses, product eval loops, optimization, launch gates, traces, feedback trajectories, and release confidence."
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
  -> replay trajectories for optimization and release gates
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
- Runs do not record commit, model, prompt hash, config hash, or cost.
- User feedback is not converted into replayable trajectories.
- Missing auth/data/retrieval readiness is reported as a prompt failure.
- Reports make claims without run ids or trace evidence.

## Key Docs

- `@tangle-network/agent-eval` README
- `docs/product-eval-adoption.md`
- `docs/feature-guide.md`
- `docs/control-runtime.md`
- `docs/feedback-trajectories.md`
- `docs/multi-shot-optimization.md`
- `docs/knowledge-readiness.md`
