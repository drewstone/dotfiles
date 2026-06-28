---
name: sandbox-sdk-integration
description: Integrate @tangle-network/sandbox SDK without rebuilding stream durability, session replay, browser-safe clients, or idempotent dispatch already provided by the platform.
---

# Sandbox SDK Integration

Use this when consuming the public sandbox SDK from Workers, edge functions, browsers, mobile clients, batch jobs, or chat surfaces.
The common failure is rebuilding session durability that the SDK already provides.

## Hard Stop

Before adding Durable Objects, KV event buffers, in-memory SSE rings, custom replay queues, or hand-rolled `Last-Event-ID` handling, read the current SDK docs/source.
If the SDK already owns the behavior, delete the duplicate layer.

## Flow

1. Identify the runtime: Worker, browser, server, batch, or mobile.
2. Read the live SDK entrypoints and examples for that runtime.
3. Use the browser-safe client where the code runs in a browser.
4. Preserve session IDs, idempotent dispatch, stream replay, and reconnect semantics provided by the SDK.
5. Verify with a real stream interruption or resume path when durability is the point.
6. Remove duplicated state and prove the app still resumes.

## Output

Report the SDK primitive used, duplicate code removed or avoided, resume proof, and remaining integration risk.
Use `references/full-reference.md` for the full durability table and migration warnings.

## Then consider

- `harden` if auth, tenant isolation, or capability tokens are involved.
- `ui-test` if the integration includes browser-visible chat or stream UI.
