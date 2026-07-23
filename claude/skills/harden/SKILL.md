---
name: harden
description: Test security boundaries, credentials, races, malformed input, and invariants; prove each fix.
---

# Harden

Use this for security and abuse resistance, not ordinary CI cleanup or code polish.
The job is to prove what breaks, fix real weaknesses, and leave tests that catch regressions.

## Flow

1. Inventory trust boundaries, auth/permission checks, parsers, file/network inputs, secrets, storage, concurrency, and external calls.
2. Derive invariants the system must never violate.
3. Try to break those invariants with realistic attacks, malformed inputs, race attempts, and credential misuse.
4. Reproduce each real issue with the smallest executable proof.
5. Fix the root cause, then add or extend the existing test path so the proof fails before the fix and passes after it.
6. Rank remaining risk by exploitability and impact.

## Attack Checklist

- Broken auth, tenant isolation, IDOR, confused deputy, privilege escalation.
- Injection, unsafe deserialization, path traversal, SSRF, file upload abuse.
- Credential leaks in source, env, logs, artifacts, traces, and screenshots.
- Race conditions, replay, stale authorization, time-of-check/time-of-use bugs.
- Missing coverage around security-critical state transitions.

## Output

Report only verified findings and explicitly label unverified hypotheses.
For each finding include evidence, impacted boundary, proof command/test, fix, and residual risk.

Use `references/full-reference.md` for the full legacy playbook and report template.

## Then consider

- `converge` for red CI after the security fix lands.
- `critical-audit` for broad code review once exploit paths are covered.
