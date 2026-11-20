---
name: be-ambitious
description: Set the bar before any build, research or improvement task: the best known result anywhere with its source, our number, a target that beats it, the mechanism that could reach it and the outside check; use at the start of such work, for /be-ambitious, "raise the bar" or "what would an expert do".
---

# Be ambitious

Excellent work starts from the best result anyone has published or shipped and aims past it; ordinary work starts from the request and stops when its checks pass.
Every skill that produces work opens by setting the bar here. The task is the text after the invocation, else the latest request.

## Set the bar

Name the field (SRE incident response, retrieval evaluation, compiler optimization), then write five lines before the first change, each concrete or a named unknown with the step that resolves it:

1. **Best known result.** The strongest result anywhere for this class of task, with its source: a paper, public benchmark, leaderboard, rival product, reference implementation, or the best row in our [climb ledger](../../../docs/processes/climb.md#the-ledger). Search for it; "none found in <where you searched>" is an answer, an invented one is not.
2. **Our number.** Today's measured value with unit, denominator and source; when it is unmeasured, measuring it is the first step.
3. **Target.** A number that beats the best known result, or the measured reason it cannot be beaten here (a physical or information limit, a requirement) and the best target that remains.
4. **Mechanism.** The change of kind that could reach the target, as an expert in the field would choose it: a different algorithm, architecture, data source, formulation or tool. More effort on the current mechanism is a fallback, never the plan.
5. **Outside check.** What, other than the author, shows the result (a benchmark, held-out set, reproduction, known answer, measurement or real-user behavior), with its pass and fail lines.

Start from the rawest material: the dataset, not the chart; the logs and code, not the bug report; the served endpoint, not the docs.
The [prompt library](../../../docs/processes/prompt-library.md) holds graded expert moves with their triggers; use a matching entry before inventing one.

## Go further

When the target needs more than the request named (a new module, a rewrite, a second mechanism, a fix in another repository we own), build it in the same task at whatever size it takes ([AGENTS.md](../../AGENTS.md) rule 2).
Spending, production changes, another owner's work and the approvals the owner reserves stay where they are: ambition changes what you build, never who approves it.
Drop ideas that serve a different goal.

## Finish against the bar

The work finishes when the outside check shows the target met, or when the miss is explained with evidence: what was tried, the measured gap, and the cause that limits it.
Passing checks are necessary, not sufficient.
A met target gets its next one, the [ratchet](../../../docs/processes/climb.md#the-engine-what-makes-the-climb-run-without-us): the best result now known, or twice the old target.

## Rewrite a prompt

When asked for the rewrite itself, write it in one fenced block in the user's voice: it asks for the five lines, starts from the raw material, uses the named methods, and ends on the outside check and its pass line, keeping the user's acceptance criteria and named levers.
Stop after the rewrite when only that was asked for; when the task is authorized work, carry out the rewritten version.

## Log the run

```bash
skill-run-log /be-ambitious --target "<task>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --prediction "<target>" --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The target is a measured quantity to climb | `/evolve` | the five lines |
| The best known result needs research from primary sources | `/report` | the field and where you searched |
| The outside check does not exist yet and must be built | `/eval-engineering` | the pass and fail lines |
