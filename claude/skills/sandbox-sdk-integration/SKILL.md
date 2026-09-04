---
name: sandbox-sdk-integration
description: Adopt Tangle Sandbox for durable agent streams, replay, browser reconnects, and retry-safe turns without rebuilding platform state.
---

# Sandbox SDK integration

Use the public Sandbox SDK instead of copying its session, stream, replay, or browser state.

## Choose the failure boundary

1. Use `streamPrompt` for one attached process that may reconnect during the call.
2. Use `dispatchPrompt` plus `box.session(id)` when execution must outlive the caller.
3. Use `executionId` with `lastEventId` to replay one existing execution.
4. Use a stable `turnId` with `sessionId` when the same logical turn may be retried after completion or eviction.
5. Use `SessionGatewayClient` for browser or mobile reconnect and replay.

`sessionId` prevents a concurrent duplicate while that session is in flight.
It is not a durable retry key after the turn finishes.

## Integrate

1. Check the latest published package and the current SDK source.
2. Read the example that matches the caller: attached stream, Worker, durable batch, cross-process reconnect, or browser.
3. Persist identifiers before dispatch when the caller itself may die.
4. Read the dispatch result to learn whether work started.
5. Accept completion only from a terminal result.
6. Interrupt the real stream or process and prove reattachment on the deployed path.
7. Remove duplicate buffering or replay state after the SDK path passes.

Read [the source map and decision table](references/full-reference.md) when durability or retries are part of the task.

## Log the run

```bash
skill-run-log /sandbox-sdk-integration --target "<integration>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Auth, tenant isolation, or scoped tokens are involved | `/harden` | the boundary and token scopes |
| The integration has browser-visible streaming UI | `/ui-test` | the route and reconnect flow |
| Hand-built buffering, replay, or dispatch code remains | `/simplify` | those call sites and the SDK replacements |
| A real interrupted session resumed to a terminal result | `/verify` | the session, turn, execution IDs, and captured result |
