---
name: slack-alerts
description: Investigate recurring infrastructure alerts, trace their producers, fix the cause, and verify the next result.
---

# Slack Alerts

Read the current alerts and trace each recurring condition to its producer.
Use available Slack read and search tools; inspect their contracts instead of assuming tool names or pagination limits.

## Establish active incidents

Locate the requested channels by name or existing workspace configuration.
For recurring infrastructure alerts, read `#infra-alerts` and `#router-alerts` across the relevant incident window.
Follow threads and resolution messages, then group messages by producer and incident key.
Record the newest occurrence and whether a later result resolves it.

When identifying an infrastructure producer, read [producer discovery](references/producers.md).
The linked source owns current filenames, schedules, hosts, and dispatch inputs.
Confirm those facts before acting on an older message.

## Correct and prove

Read the failing workflow step or host journal and connect the message to its actual condition.
Fix that cause in the producer's repository using its current deployment procedure.
Preserve incident identity when a producer is renamed so existing incidents can resolve.
Changing wording or removing a notification does not resolve the underlying failure.

Use a read-only probe to diagnose a host.
Host configuration changes follow the reviewed deployment path and existing authorization.
Automatic approval of this investigation does not authorize new outbound messages.

After a fix, verify the next real producer result and the corresponding resolution behavior.
Before manually dispatching a workflow, inspect its side effects, including automatic Slack posts, and use authorization that covers those effects.
When success is intentionally silent, inspect the successful run and observe one full repeat interval before claiming recurrence stopped.
Historical messages remain incident evidence; editing a message is a separate authorized action.

Report each active cluster's cause, fix, and proof link.
For unresolved clusters, name the evidence gap and the check performed or remaining external dependency.

## Log the run

```bash
skill-run-log /slack-alerts --target "<target>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

- `tangle-ops` when a completed alert investigation needs deeper production or deployment diagnosis.
- `deploy-proof` when a fix has shipped and the serving product still needs verification.
