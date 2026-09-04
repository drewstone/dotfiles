# Sandbox durability source map

Read the source for the exact package version in the application.
Do not infer retry behavior from an older integration guide or copied example.

## Current sources

In the `agent-dev-container` repository:

- `products/sandbox/sdk/src/types.ts` defines `PromptOptions`, replay identifiers, `turnId`, and detach behavior.
- `products/sandbox/sdk/INTEGRATION.md#resume-and-durability` explains the three reconnect paths and terminal states.
- `products/sandbox/sdk/README.md` documents `streamPrompt`, `dispatchPrompt`, sessions, and batches.
- `products/sandbox/sdk/examples/cf-worker-chat.ts` shows retry-safe Worker dispatch.
- `products/sandbox/sdk/examples/durable-batch.ts` shows restart-safe batch state.
- `products/sandbox/sdk/examples/reconnect-from-last-event-id.ts` shows execution replay.
- `products/sandbox/sdk/examples/browser-streaming-resume.ts` shows browser reconnect.
- `products/sandbox/sdk/examples/worker-do-anti-pattern.ts` maps hand-built state to SDK features.

Check the published version with:

```bash
npm view @tangle-network/sandbox version
```

Compare local source with the repository's current default branch before relying on it.

## Pick identifiers by meaning

| Need | Use | Meaning |
|---|---|---|
| Continue one conversation | `sessionId` | Conversation and event-buffer identity. It blocks a concurrent duplicate only while work is in flight. |
| Retry one logical turn | `turnId` with `sessionId` | A completed retry returns cached work instead of running the model again. |
| Replay one execution stream | `executionId` with `lastEventId` | Rejoin the exact execution after the last acknowledged event. |
| Deduplicate one code call | `runCode({ idempotencyKey, sessionId })` | Repeat one code execution within its documented cache window. |

Persist `sessionId` and `turnId` before dispatch if the caller can crash between dispatch and persistence.
Use `box.findCompletedTurn(turnId, { sessionId })` before redispatch when recovery starts without trusted local state.

## Pick the client by lifetime

| Caller lifetime | SDK path |
|---|---|
| One attached server process | `box.streamPrompt` |
| Execution must survive caller disconnect | `box.dispatchPrompt`, then `box.session(sessionId)` |
| Fresh process rejoining an execution | session events with the saved event ID, or the documented execution replay path |
| Browser or mobile client | `SessionGatewayClient` with replay persistence |
| Restartable batch | persist task → sandbox/session/turn IDs, inspect completed turns, then dispatch only unfinished work |

## Completion and failure

The end of an iterator is not scientific or business completion.
Require the SDK's terminal result.

- `completed`: the result was recorded; a matching `turnId` can return it.
- `interrupted`: partial content may exist, but the turn did not complete.
- no terminal marker: treat the outcome as unknown or interrupted and inspect authoritative state.

Client reconnect limits may return control to the caller.
They do not prove the remote execution stopped.

## Reject these designs

- A Durable Object or KV store that copies the platform's event buffer.
- A local SSE ring that becomes the only replay source.
- A new `sessionId` for each retry of the same logical turn.
- A claim that `sessionId` alone makes completed retries idempotent.
- Completion inferred from stream silence, iterator closure, process age, or client timeout.
