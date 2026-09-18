# Resolve behavior evidence

Use this guide for conflicting records, action attribution, or a fleet audit.

## Establish what happened

Read the executed instruction and user mandate, then follow the decision through tool invocation, tool result, and final state.
Use timestamps and run, session, and assignment IDs to link the records.
A requested call can fail before reaching the service.
A successful service response can still leave the user-visible operation incomplete.
Check the durable effect when the claim depends on one.

Prefer the record that directly observes the disputed fact.
A provider trace can establish a model call; it cannot establish an external write without the corresponding tool or service evidence.
Keep unavailable records distinct from inspected records that contain no event.
Report capture gaps before concluding that an action did not occur.

## Separate execution from claims

| Observed behavior | Question to settle |
|---|---|
| A deterministic procedure performs the task | Does the product promise adaptive decisions, or is this sufficient? |
| A model chooses actions around deterministic execution | Which decisions depend on observed state, and do they change when state changes? |
| The agent narrates an action | Is there a matching invocation, result, and required effect? |
| The agent retries after failure | Did the retry use the failure evidence, or repeat a known invalid action? |
| A memory or reflection artifact exists | Did a later decision use it, and did that matter? |
| The agent reports completion | Did the user-defined outcome occur within the granted authority? |

For causal claims about adaptation, compare decisions under changed evidence or a matched control when available.
A single successful run demonstrates an instance; it does not establish reliability or an improvement caused by learning.

## Audit several agents

Inventory every agent in scope with its role, execution mode, mandate, dependencies, and available records.
Preserve failed, cancelled, inactive, and unobserved agents in the inventory.
Trace representative decisions for each distinct behavior claim and investigate exceptions.
Report the inspected coverage so sampled evidence is not presented as a complete fleet audit.
