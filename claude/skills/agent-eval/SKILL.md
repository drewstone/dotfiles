---
name: agent-eval
description: Maintain agent-eval contracts, scoring, comparisons, traces, and release evidence, including System One question sets (decisionPoint) over traces.
---

# Agent Eval

Change the agent-eval package itself while preserving trustworthy measurements and public contracts.

## Read the owning source

Start with the package's current `docs/concepts.md` and the public exports in its `package.json`.
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

## System One question sets

A System One model answers bounded questions over supplied evidence with a probability per option; counting, arithmetic and exact matching stay in code.
- Build the set as an agent-eval `decisionPoint` (`src/decision-point.ts`) of atomic Choice questions with an `insufficient_evidence` option; any wording change is a new `version`.
- Dry-run about 50 development windows, then gold-label them with another model family or a person, never from the System One answers.
- A question is calibrated at Cohen's kappa of `DECISION_POINT_MIN_KAPPA` or higher on held-out windows; only `threshold` answers are labels, exported as rollout episodes.

## Change and prove

Reuse the existing implementation or adapter before adding another.
Add behavior and failure tests that distinguish the changed contract, including public imports when exports change.
Update the nearest consumer document when consumers must act.
Run the package's relevant checks; shared contracts, statistics, capture, and export changes also require the full suite and package verification.

Report changed contracts, source locations, checks, and result artifacts.
Do not call an unchecked measurement valid.

## Log the run

```bash
skill-run-log /agent-eval --target "<target>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

- `eval-engineering` when the changed production path has no representative evaluation or semantic judgments disagree with labeled examples.
- `diagnose` when measured results conflict with execution evidence.
- `harden` when changed ingestion or release authority crosses a trust boundary.
