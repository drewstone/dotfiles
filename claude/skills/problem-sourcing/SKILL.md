---
name: problem-sourcing
description: Find open research problems and their sources, assess their value and evidence, and hand the sourced material to the research system.
---

# Problem Sourcing

Turn a researcher's or lab's current record into sourced problems and the evidence that can reject a wrong answer.

## Read the current research system

Locate the active project through its remote and current instructions.
For the discovery workspace, the maintained [problem-sourcing rubric](https://github.com/tangle-network/discovery/blob/master/meta/problem-sourcing/README.md) owns selection and promotion criteria.
Find its configured store before updating the source registry or candidate list.

When operating discovery-lab, read its [instructions](https://github.com/tangle-network/discovery-lab/blob/master/AGENTS.md) and [executable methods](https://github.com/tangle-network/discovery-lab/blob/master/README.md#executable-methods).
For literature sourcing, follow the maintained [method guide](https://github.com/tangle-network/discovery-lab/blob/master/experiments/literature-sourcing/README.md).
Hand the sourced material to the system as sources, recorded as an observer contribution, and let the system source its own problems from it.
Do not hand it the problem, the decomposition, or the research method it should run.
Capture the handed material as an immutable snapshot before the run reads it.
Preserve executable sourcing when requested; prompt-only guidance does not replace that method.
Do not substitute manual research for a project whose purpose is to run the research system.

For an independent research request, read [source coverage and evidence](references/source-evidence.md) before collecting papers and proposing experiments.

## Assess and promote

Distinguish problems stated by the source from gaps you infer.
For every candidate, record the decision its solution would change and whether the source shows a check that could reject it.
Report that check as evidence about the candidate, not as the measurement the system must use.
Finding what is measurable is the system's job.
Machine convenience alone is not a reason to promote a problem.

Check external prior art as well as existing project lines and knowledge records.
Update an existing line when it already covers the candidate.
Before promoting a candidate, apply the current owning rubric and approval rules.
Do not copy scoring thresholds or dispatch schemas into this skill.

Report source coverage, checked quotations, unresolved evidence, rejected candidates, and promoted material.
A sourced candidate is a starting question with its evidence; it is not a verified research result.

## Log the run

```bash
skill-run-log /problem-sourcing --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `verify` when a source makes an executable reproducibility claim relevant to the selected problem.
- `operate` when the sourced material is handed over and the project needs a research run started or watched.
