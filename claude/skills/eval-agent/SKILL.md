---
name: eval-agent
description: Build LLM-as-judge components from real references: gather examples, generate rubrics, score outputs, return findings, and wire improvement loops.
---

# Eval Agent

Use this when the user needs a judge component, rubric, scoring loop, or evaluation report for subjective outputs.
Do not use LLM judges for objectively checkable behavior; write tests instead.

## Preconditions

- The target is subjective enough that two humans could reasonably disagree.
- Real reference material exists or can be gathered first.
- The evaluator output will drive a decision, not decorate a dashboard.

## Build Flow

1. Gather positive examples, negative examples, domain docs, and known failure cases.
2. Generate rubric dimensions from those references; do not hand-write vibes.
3. Define the target schema, finding schema, score range, and pass/fail threshold.
4. Run a small calibration set and inspect disagreements before broad scoring.
5. Wire the evaluator into the smallest loop that will improve the target.
6. Persist prompts, references, scores, findings, and model snapshot.

## Rules

- Quote or cite the references that justify each rubric dimension.
- Keep judge prompts deterministic and versioned.
- Separate single-output scoring, per-turn scoring, and reviewer-driver loops.
- Report disagreement, uncertainty, and failure modes; do not hide low-confidence scores.
- Replay or re-score from saved artifacts when possible instead of spending live model calls.

Use `references/full-reference.md` for component examples, prompt patterns, and the old full guide.

## Then consider

- `agent-eval` when the task touches the eval package internals.
- `evolve` when the evaluator is ready to optimize a measurable target.
