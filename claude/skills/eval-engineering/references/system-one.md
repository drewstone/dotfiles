# System One question sets

Read this when building or changing a question set that a System One model answers over traces or other supplied evidence.

A System One model answers bounded questions over supplied evidence with a probability per option; counting, arithmetic and exact matching stay in code.
- Build the set as an agent-eval `decisionPoint` (`src/decision-point.ts`) of atomic Choice questions with an `insufficient_evidence` option; any wording change is a new `version`.
- Dry-run about 50 development windows, then gold-label them with another model family or a person, never from the System One answers.
- A question is calibrated at Cohen's kappa of `DECISION_POINT_MIN_KAPPA` or higher on held-out windows; only `threshold` answers are labels, exported as rollout episodes.

Changing agent-eval itself (its contracts, scoring, statistics, capture or exports) happens in its checkout, whose own `.claude/skills/agent-eval/SKILL.md` owns the maintainer procedure and whose `AGENTS.md` owns delivery.
