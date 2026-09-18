---
name: agent-eval
description: Maintain agent-eval contracts, scoring, comparisons, traces, and release evidence.
---

# Agent Eval

Change `@tangle-network/agent-eval` itself while preserving trustworthy measurements and public contracts.

## Read the owning source

Start with the current [package concepts](https://github.com/tangle-network/agent-eval/blob/main/docs/concepts.md) and [public exports](https://github.com/tangle-network/agent-eval/blob/main/package.json).
Read the implementation and existing tests for the affected export before adding a primitive.
Use the current maintained checkout; confirm the target package's actual imports when changing an existing consumer.

Eval owns cases, scores, run records, comparisons, statistics, and trace analysis.
Execution and worker control belong to Runtime; product storage transactions and release authority belong to the consumer.

## Preserve measurement integrity

- Keep agent failure, measurement failure, and unavailable evidence distinct.
- Capture the requested and observed execution identity, errors, usage, cost, and latency; mark missing values explicitly.
- Preserve unknown provider fields and redact secrets at ingestion.
- Use code for objective facts and calibrated model judges for semantic facts.
  A model score cannot override a deterministic failure.
- Pair comparisons on equivalent cases and conditions; keep candidate development separate from final decision cases.
- When evaluating authored instructions, compare against a length-matched neutral control and confirm the delivery method reaches the agent.
- Search returns candidates without changing live product state.

## Change and prove

Reuse the existing implementation or adapter before adding another.
Add behavior and failure tests that distinguish the changed contract, including public imports when exports change.
Update the nearest consumer document when consumers must act.
Run the package's relevant checks; shared contracts, statistics, capture, and export changes also require the full suite and package verification.

Report changed contracts, source locations, checks, and result artifacts.
Do not call an unchecked measurement valid.

## Log the run

```bash
skill-run-log /agent-eval --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `eval-engineering` when the changed production path has no representative evaluation.
- `eval-agent` when semantic judgments disagree with labeled examples.
- `eval-harness-diagnose` when measured results conflict with execution evidence.
- `harden` when changed ingestion or release authority crosses a trust boundary.
