---
name: problem-sourcing
description: Find open research problems, assess their value and executable checks, and prepare justified research charters.
---

# Problem Sourcing

Turn a researcher's or lab's current record into problems worth solving and experiments that can reject a wrong answer.

## Read the current research system

Locate the active project through its remote and current instructions.
For the discovery workspace, the maintained [problem-sourcing rubric](https://github.com/tangle-network/discovery/blob/master/meta/problem-sourcing/README.md) owns selection and promotion criteria.
Find its configured store before updating the source registry or candidate list.

When operating discovery-lab, read its [instructions](https://github.com/tangle-network/discovery-lab/blob/master/CLAUDE.md) and [sourcing entrypoint](https://github.com/tangle-network/discovery-lab/blob/master/tools/sourcing/run-sourcing.mjs).
Use the project's sourcing program and existing executor policy; inspect current arguments before dispatch.
Do not substitute manual research for a project whose purpose is to run the research system.

For an independent research request, read [source coverage and evidence](references/source-evidence.md) before collecting papers and proposing experiments.

## Assess and promote

Distinguish problems stated by the source from gaps you infer.
For every candidate, establish both the decision its solution would change and the executable check that could reject it.
Machine convenience alone is not a reason to promote a problem.

Check external prior art as well as existing project lines and knowledge records.
Update an existing line when it already covers the candidate.
Before creating a charter, apply the current owning rubric and approval rules, and state the first experiment and its failure criterion.
Do not copy scoring thresholds or dispatch schemas into this skill.

Report source coverage, checked quotations, unresolved evidence, rejected candidates, and promoted artifacts.
A charter is a starting question and test; it is not a verified research result.

## Log the run

```bash
skill-run-log /problem-sourcing --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `verify` when a source makes an executable reproducibility claim relevant to the selected problem.
- `operate` when an authorized charter is registered and the project needs a research run started or observed.
