---
name: hub-sdk-adoption
description: Adopt hub-sdk for OAuth connections, tool calls, capability tokens, and policy enforcement.
---

# Hub SDK Adoption

Use this when a product needs to call the hosted Tangle Hub for connections, tools, approvals, policies, tokens, audits, or workflows.
Use `agent-integrations` instead when implementing connector contracts or an execution provider.

## Read Current Truth

1. Inspect the product lockfile and installed `@tangle-network/hub-sdk` version.
2. Read its package exports, generated types, README, and nearest example.
3. Inventory current hub calls, local hub types, transport wrappers, auth handling, and direct HTTP requests.
4. Find current package usage in adjacent maintained products before designing a new wrapper.

Do not copy method signatures or endpoint tables from this skill.

## Integration Boundary

The product owns users, sessions, permissions, stored connection references, UI, and business policy.
The SDK owns Hub request and response types, transport, envelopes, redaction helpers, and typed errors.

Generated apps, browsers, and sandboxes must not receive Hub API keys, provider refresh tokens, signing secrets, or unrestricted capability tokens.

## Replace Competing Paths

1. Add the current package version using the repository's dependency policy.
2. Create the SDK client at the server boundary with explicit base URL and request auth.
3. Replace direct Hub HTTP calls with the matching typed SDK client.
4. Replace local copies of Hub request, response, error, connection, tool, policy, token, and workflow types.
5. Remove transport wrappers that only rename SDK methods or unwrap the same envelope.
6. Keep product adapters only when they add product policy, persistence, or identity mapping.
7. Remove obsolete dependencies only after confirming they are not still used for connector specs or runtime execution.

A migration is incomplete when both old and new transports remain reachable.

## Security And Failure Rules

- Resolve credentials on the server and fail when required configuration is absent.
- Bind user-scoped calls to the authenticated product principal.
- Use short-lived, action-scoped capabilities for delegated execution.
- Require product approval for write or destructive actions unless stored policy authorizes them.
- Preserve SDK error codes, status, details, and retry meaning.
- Do not turn missing auth, denied approval, or transport failure into empty data.
- Use stable idempotency keys for state-changing calls and webhook processing.
- Redact credentials before logs, traces, or error persistence.

## Prove Adoption

Run repository searches that show:

- the target product imports the SDK;
- no direct Hub transport remains outside approved SDK or server adapter code;
- no local duplicate Hub wire types remain;
- deleted wrappers have no importers;
- the old dependency is absent or has a documented remaining role.

Then run typecheck, focused tests, and one real request for connection listing, tool discovery, or the product's primary Hub action.
Test denied auth, required approval, malformed response, retry, and duplicate-write behavior.

## Completion

Report the installed version, exact imports, removed files and dependencies, retained product adapters, real request result, failure cases, and commands run.

## Then consider

- `agent-integrations-adoption` when implementing connector or provider execution behind the Hub.
- `harden` for credentials, capability tokens, webhooks, or destructive tools.
- `verify` before release.
