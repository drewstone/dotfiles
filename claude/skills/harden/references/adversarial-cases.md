# Adversarial cases

Choose cases from the boundary under investigation and adapt them to authorized test resources.
Preserve the initial state, triggering input, observed effect, and cleanup result so a failure can become a regression test.

## Identity and access

- Replace resource identifiers with another test tenant's identifiers, including identifiers learned from legitimate responses.
  Check both direct endpoints and related caches, exports, downloads, and background jobs.
- Revoke a session or token, then retry access through each relevant entrypoint.
  Check authorization again when work resumes or a queued action executes.
- Test token signature and algorithm validation, intended audience, expiry, OAuth state, and redirect restrictions according to the actual protocol.
- Add fields a caller must not control, such as an owner, role, or balance, to create and update requests.
- Check whether retries duplicate billing, permission changes, or external effects.

## Parsers, files, and outbound requests

- Exercise malformed, oversized, deeply nested, empty, and Unicode inputs around the accepted schema and size limits.
- Test traversal, encoded separators, symbolic links, and archive members against a disposable filesystem boundary.
  Verify the resolved path stays inside the authorized root after links and normalization are handled.
- Trace untrusted values into queries, command arguments, templates, and response headers.
  A parser accepting an input is not itself an injection defect; demonstrate the dangerous interpretation downstream.
- For outbound URL fetching, test redirect chains and address resolution with controlled destinations.
  Check that restrictions still apply after redirects and DNS resolution; use a fixture to represent blocked internal or metadata addresses.
- For resource-exhaustion risks, bound concurrency, input size, memory, and time to the test environment's capacity.
  A timeout or leak claim needs measurements from the implementation under test.

## Credentials and response data

Use a scanner with redacted output or inspect locations without printing secret values.
Check source, history when in scope, build artifacts, CI output, logs, traces, and error responses.
Verify that redaction preserves useful diagnosis without revealing credentials or another tenant's records.
Treat a discovered secret as exposed material; remediation follows the relevant credential owner's rotation process and existing authority.

## Concurrent state changes

Use a barrier or controlled scheduling to align competing operations at the critical transition.
Choose concurrency sufficient to exercise the race, rather than prescribing a fixed request count.

- Send competing debits or claims against a test balance or resource and inspect committed state after all operations settle.
- Race duplicate creation or dispatch using the same identity or idempotency key.
- Interleave authorization revocation with use according to the system's promised revocation semantics.
- Change a resource between a permission or existence check and the operation that relies on it.

Collect every response and the final durable state.
Multiple successful HTTP responses alone do not prove duplicate effects: retries may legitimately return the same idempotent result.
Conversely, a failed response may follow a committed effect, so inspect state before retrying.
