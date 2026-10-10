---
name: agent-ask
description: Delegate work to a production Tangle agent app (gtm, tax, legal, insurance, creative, hospitality, builder, physim, super) through its standard operator API with agent-ask, follow the turn, and gate the result before showing Drew.
---

# Agent ask

Tangle's agent apps do their own domain work; this session is their operator and builder, never their stand-in.
Doing the work yourself hides whether the product works.
Your job is the ask, the verdict, and the capability the agent was missing.

`agent-ask --help` owns the commands, options, and exit codes.
The operator API it speaks is in agent-app's [operator API design](https://github.com/tangle-network/agent-app/blob/main/docs/operator-api.md).
For GTM work, the `gtm-ask` skill holds GTM's quality bar; use `agent-ask --app gtm` with that bar.

## 1. Write the outcome-level ask

State the outcome, its audience or channel, the bar it must clear, and any decision only Drew can make.
Tell the agent to find its own facts from live sources.
Done when the ask names the outcome and the bar, and holds nothing the agent could look up itself.

## 2. Send it and follow it

```bash
agent-ask --app <app> --workspace <id> "<outcome-level ask>"
agent-ask --app <app> --thread <id> "<verdict or answer>"   # continue the conversation
agent-ask --app <app> status <thread> --wait 9m             # resume following after exit 3
```

Turns run for minutes; follow them in slices that fit the tool timeout with `--wait 9m`, then `status --wait 9m` while it exits 3.
Use an isolated test workspace for product proofs; a customer or Drew workspace holds production state.
An app that answers `does not serve the operator API yet` has not mounted `/api/operator/v1`; operate it through its own interface. GTM never needs another app to mount it: GTM markets products from their public inputs only.
Done when the turn exits 0, 1, or 4.

- Exit 1 is a product or platform defect: diagnose it as the builder and fix the capability.
- Exit 4 lists who decides each waiting item (`operator`, `editor`, or `owner`) and where. Answer the agent's questions as Drew's operator from live sources, citing them in a `--thread` reply. Held sends, posts, spending, and credential changes are the owner's; escalate only those to Drew.

## 3. Gate the result

Read every deliverable with `agent-ask file <path>` and `--download <dir>`, then grade each against the app's bar with evidence.
`agent-ask scorecard` and `agent-ask approvals` show the workspace's recorded work, outcomes, and open decisions; an unrecorded metric is unknown, not zero.
Done when every item is PASS or FAIL with its evidence; an unchecked item counts as FAIL.

## 4. Act on the verdict

Send failures back in the same thread with the item, the evidence, and the bar, so the agent revises.
When the agent cannot meet the bar, build the missing capability, then ask again unassisted.
Show Drew only work that passed, with the conversation link and the gate evidence.

## Keys

Each app accepts its own key, `<APP>_OPERATOR_API_KEY`, from its API access page with `operator:read` and `operator:run`.
One Tangle agent key, `TANGLE_AGENT_KEY`, works in every app its owner approved on id.tangle.tools; `agent-ask` uses it when the app has no key of its own.
Either can live in the environment or in `~/company/devops/secrets/agent-state.env`.
Never paste a key into a prompt, message, file, or command line.

## Log the run

```bash
skill-run-log /agent-ask --target "<app, thread id and outcome>" --verdict <PASS|FAIL|WAITING> --next /<next-skill-or-stop>
```
