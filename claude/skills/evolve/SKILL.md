---
name: evolve
description: Goal-pursuit loop: measure, diagnose, experiment, verify, compare, and iterate against a measurable target. Triggers: evolve, optimize, make this better, push to target.
---

# Evolve

Use this when there is a measurable target and repeated changes can move it.
Do not use it for vague quality polish, red CI, or one-off analysis.

## Start

1. Read existing `.evolve/` state if present.
2. Define the target metric, baseline, acceptable variance, and user value connection.
3. Run the smallest real baseline before changing anything.
4. If no metric exists, build or choose one first.

## Loop

1. Diagnose the largest measured gap.
2. Pick the top bet. If the next lever is obvious, propose one hypothesis with a mechanism and a falsifiable result. If more than one plausible lever exists — or you haven't surveyed how the world beats this ceiling — run `/hypothesize` first and pull the top-ranked bet from its portfolio.
3. Make the smallest change that tests the hypothesis.
4. Re-run the exact baseline check plus any needed regression checks.
5. Compare against baseline with enough samples for the claim.
6. Keep, revert, or iterate based on the measured result.
7. Persist experiment rows, progress, and next dispatch in `.evolve/`.

## Rules

- No metric gaming; user-visible quality wins over score movement.
- No broad rewrites until smaller hypotheses fail.
- Treat surprising lifts, nulls, and too-clean results as suspect until raw data explains them.
- Stop after five rounds or when the next step needs a different skill.

Use `references/full-reference.md` for statistical details, structured-hypothesis mode, and state schemas.

## Then consider

- `hypothesize` when "what to try next" is no longer obvious — build a researched, ranked portfolio instead of guessing one lever.
- `meta-harness` or `pursue` after repeated measured plateaus.
- `autopsy` for surprising or null results.
- `polish` when the metric is fine but quality still needs fixed-rubric cleanup.
