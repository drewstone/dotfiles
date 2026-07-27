---
name: sandbox-sdk-integration
description: Adopt sandbox without rebuilding streaming, replay, browser clients, or idempotent dispatch.
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

| Condition | Next skill | What to pass |
|---|---|---|
| Auth, tenant isolation, or capability tokens are involved | `/harden` | the boundary crossed + the token scopes |
| The integration includes browser-visible chat or stream UI | `/ui-test` | the route + the streaming flow to exercise |
| ≥1 hand-rolled SSE, replay, or dispatch path exists | `/simplify` | the hand-rolled call sites + the SDK primitive that replaces them |
| Integration lands and ≥1 real session streams end-to-end | `/verify` | the session ID + the non-mocked stream output |

## Log the run

On completion, append one line so `/reflect` and `/governor` can grade this skill later:

```bash
skill-run-log /sandbox-sdk-integration --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```
