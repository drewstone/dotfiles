---
name: eval-agent
description: Build and calibrate model judges for semantic quality using independent examples and auditable evidence.
---

# Eval agent

Use a model judge when code cannot decide a required semantic property, such as usefulness or faithfulness.
Keep objective facts in deterministic checks; a semantic score cannot override their failures.

## Define the decision

State what artifact is judged, what decision the result controls, which evidence is allowed, and the consequences of false passes and false failures.
Choose the judgment that answers that decision:

| Need | Judgment |
|---|---|
| Requirements met | Classification by named criteria |
| Preference between outputs | Pairwise comparison with randomized order |
| Source support | Claim-level support classification |
| Explanation of a multi-turn failure | Turn or outcome classification from recorded evidence |

Use separate dimensions only when they affect a decision.
Avoid an unanchored quality score.

## Build from evidence

Collect real acceptable, unacceptable, and borderline examples from feedback, incidents, domain references, and prior runs.
Label them independently of the judge being built.
Use qualified human labels and retain disagreements for consequential judgments.

Provide the evidence needed for each criterion.
Do not infer file changes, tool effects, citation support, or execution success from the target's assertions.
Require a structured decision, criterion results, evidence references, a short reason, and an explicit cannot-judge outcome.

When building or changing the judge, read [the calibration procedure](references/calibration.md) and run it through the actual scoring path.
Reuse applicable calibration when the decision, judge, and evidence conditions have not changed.

## Protect execution and evidence

- Delimit untrusted target content as data and test attempts to influence the judge.
- Limit input and reference sizes without silently dropping required evidence.
- Keep scoring instructions, hidden labels, and judge credentials unavailable to the target.
- Remove secrets before model calls and persistence.
- Validate structured output; malformed or missing results cannot pass.
- Record the actual model/provider identity, prompt, input digest, evidence, raw and parsed results, errors, latency, tokens, and cost.
- Reuse cached judgments only when the input, evidence, and judging configuration match.

Report the calibration evidence, all measured error rates, known blind spots, exact command, and supported decision scope.
Readiness depends on the decision's recorded error tolerance and required integrity checks, not a universal agreement percentage.

## Log the run

```bash
skill-run-log /eval-agent --target "<judgment and decision>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The judge needs an executable agent case | `/eval-engineering` | The calibrated judge and production entrypoint |
| Results changed without an explained target change | `/eval-harness-diagnose` | The run records and judging configuration |
| Shared judge types or package execution must change | `/agent-eval` | The affected API and consumers |
| The calibrated decision supports an active improvement experiment | `/evolve` | The judge, baseline, and proposed change |
