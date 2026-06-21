---
name: sandbox-sdk-integration
description: Use when integrating or consuming the public `@tangle-network/sandbox` SDK from a Cloudflare Worker, edge function, browser, mobile client, batch script, or any place where an agent stream can drop or a process can die mid-turn. The platform already provides per-session event buffering, replay with `Last-Event-ID`, idempotent dispatch by `sessionId`, and a browser-safe `SessionGatewayClient`. Do NOT add Durable Objects, KV ring buffers, hand-rolled replay logic, or any custom state to "save the stream" — it already exists server-side. Trigger keywords: cloudflare worker, durable object, session resume, stream reconnect, `lastEventId`, `streamPrompt`, `dispatchPrompt`, `SessionGatewayClient`, `box.session(...)`, browser SSE, edge agent app, sandbox SDK chat.
---

# Sandbox SDK Integration

You are integrating an app on top of `@tangle-network/sandbox`. The most common, most expensive mistake is **rebuilding stream durability that the platform already ships**. A team lost weeks doing this with Cloudflare Durable Objects when `SessionGatewayClient` already existed. This skill prevents the next instance.

## Hard rule

> If you are about to add **any** of these to support sandbox agent streaming, stop and re-read the table below:
> - A `DurableObjectNamespace` for session/stream state
> - `state.storage.put` / `KV.put` of SSE events keyed by session id
> - An in-Worker `Map<sessionId, Event[]>` ring buffer
> - Hand-rolled `EventSource` reconnect with custom `Last-Event-ID` plumbing
> - A "resume queue" / "retry buffer" middleware between your handler and the SDK

The platform already does all of this. You will spend a week reproducing it badly, then a week ripping it out.

## Decision tree

| Your consumer | What to use | Why |
|---|---|---|
| Server-side, fire-and-forget, single process holds the whole call | `box.streamPrompt(msg)` / `box.streamTask(msg)` | Internal auto-reconnect handles transient drops within the same call |
| Must survive client process death (Worker isolate eviction, redeploy, laptop close) | `box.dispatchPrompt(msg, { sessionId })` then `box.session(sessionId).events({ since })` / `.result()` from a fresh process | `dispatchPrompt` is **idempotent on sessionId**: a retry with the same id is a lookup, never a re-execute |
| Browser / mobile that needs reconnect across tab reload, wifi flap, sleep | `SessionGatewayClient` from `@tangle-network/sandbox/session-gateway` | autoReconnect with backoff, `enableReplayPersistence` for `lastEventId`, sequence-gap detection, replay-on-reconnect |
| Webhook / payment / billing retry safety | `dispatchPrompt({ sessionId: deterministicKeyFromRequest })` — same key = same session | Stripe-style idempotency at the session boundary |
| Long-running batch (100s of sandboxes, hours) where the orchestrator script may crash | `box.dispatchPrompt(prompt, { sessionId: stableTaskKey })`; persist `(taskKey → sessionId)` to disk; on restart `client.list()` + `box.session(id).result()` | Re-dispatch with the same key is a no-op; no double-billing |

## What it looks like in code

```typescript
// CF Worker /chat handler — the correct pattern
import { Sandbox } from "@tangle-network/sandbox";

export default {
  async fetch(req: Request, env: Env) {
    const client = new Sandbox({ apiKey: env.TANGLE_API_KEY });
    const box = await client.get(env.SANDBOX_ID);

    const sessionId = req.headers.get("x-turn-id") ?? crypto.randomUUID();
    const lastEventId = req.headers.get("last-event-id") ?? undefined;

    // Idempotent: a retry of the same x-turn-id is a lookup, not a re-execute.
    await box.dispatchPrompt(await req.text(), { sessionId });

    // Stream existing + future events. Replays from lastEventId if reconnecting.
    const stream = new ReadableStream({
      async start(controller) {
        for await (const event of box.session(sessionId).events({ since: lastEventId })) {
          controller.enqueue(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
        }
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream" } });
  },
};
```

```typescript
// Browser-direct streaming (no proxy through your server)
import { SessionGatewayClient } from "@tangle-network/sandbox/session-gateway";

const client = new SessionGatewayClient({
  url: "wss://your-api.example.com/session",
  token: await fetchScopedToken(),          // box.mintScopedToken({ scope: "session", sessionId })
  sessionId,
  autoReconnect: true,
  enableReplayPersistence: true,            // persists lastEventId across reloads
  replayStorage: localStorageAdapter,        // your impl of ReplayStateStorage
  handlers: {
    onMessage: (event) => render(event),
    onReplayStart: ({ since }) => showSpinner(`replay from ${since}`),
    onReplayComplete: () => hideSpinner(),
    onBackpressureWarning: ({ suggestReplay }) =>
      suggestReplay && client.replay(client.stats.replay.lastEventId),
  },
});
client.connect();
```

## Forbidden patterns (with what to use instead)

| ❌ Wrong | ✅ Right | Why |
|---|---|---|
| `new DurableObjectNamespace` for chat state | `SessionGatewayClient` + `box.session(id).events({ since })` | Server already buffers events in Redis with TTL |
| `env.KV.put("session-events:" + id, JSON.stringify(buffer))` | Same as above | Same |
| `crypto.randomUUID()` per webhook retry into `streamPrompt` | `dispatchPrompt(msg, { sessionId: requestId })` | sessionId-idempotency dedupes upstream |
| `for await (const e of box.streamPrompt(...)) { /* fire-and-forget */ }` from a Worker handler | `dispatchPrompt` first, then `box.session(id).events()` | Worker CPU/wall limit will truncate the iterator; sandbox keeps running |
| Treating the end of `streamPrompt`'s iterator as "complete" | Check for terminal `result`/`done` event; absence means "reconnect budget exhausted, may not be done" | The internal auto-reconnect silently gives up after 3 attempts |

## Canonical references

- `products/sandbox/sdk/README.md#stream-durability-is-platform-managed` — full table + code
- `products/sandbox/sdk/INTEGRATION.md#resume-and-durability` — wire-level semantics, idempotency, terminal states
- `products/sandbox/sdk/examples/cf-worker-chat.ts` — end-to-end Worker
- `products/sandbox/sdk/examples/browser-streaming-resume.ts` — browser with `SessionGatewayClient`
- `products/sandbox/sdk/examples/reconnect-from-last-event-id.ts` — explicit resume from event id
- Server primitives (read-only, for understanding): `apps/orchestrator/src/session-gateway/redis-event-buffer.ts`, `apps/sidecar/src/storage/{stream-message-recorder,backend-message-persistence}.ts`

## Rules

1. Before writing any state-storing code in front of the SDK, identify which row of the decision tree your consumer matches.
2. If your design needs MORE durability than the tree offers, re-read the tree. The answer is almost always "you picked the wrong row."
3. Cite the README / INTEGRATION.md section by name in PR descriptions so reviewers can spot DO-rebuild risk.
4. Never claim a turn completed without seeing the terminal `result` / `done` event. End-of-iterator alone is not a completion signal.
5. Use a deterministic `sessionId` for any retryable trigger (webhook event id, payment intent id, queue message id) so retries collapse.
