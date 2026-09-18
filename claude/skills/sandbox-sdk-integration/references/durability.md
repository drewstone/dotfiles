# Durability and identities

Read [prompt and dispatch types](https://github.com/tangle-network/agent-dev-container/blob/develop/products/sandbox/sdk/src/types.ts) and the matching example in the [SDK examples](https://github.com/tangle-network/agent-dev-container/tree/develop/products/sandbox/sdk/examples).
Choose an attached stream, durable batch, Worker dispatch, or cross-process reconnect example according to the caller that can fail.

| Identity | What it identifies |
|---|---|
| `sessionId` | A conversation; its existence alone does not suppress a completed retry |
| `turnId` with `sessionId` | One logical turn whose completed result can be recovered within the supported retention contract |
| `executionId` and `lastEventId` | One existing execution and the stream position acknowledged by its consumer |

Persist stable identities before dispatch when recovery must survive caller loss.
Use a new turn identity for new work and preserve it for retries of the same work.
Inspect authoritative session or completed-turn state when dispatch may have committed but its response was lost.
Check the current retention behavior before promising recovery after eviction.

A dispatch receipt says whether work started or existing work was found.
It is not the final result.
Use the SDK's current outcome tracker when consuming raw events; preserve waiting, interrupted, failed, and completed outcomes.
A stream ending or reconnect budget expiring does not prove the remote execution stopped.

For recovery proof, interrupt the caller at the point its state could be lost.
Resume from persisted identities, confirm one terminal outcome, and inspect any repeated provider actions or charges.
