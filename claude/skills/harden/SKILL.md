---
name: harden
description: "Autonomous adversarial validator. Derives invariants, fuzz targets, attack surface, and benchmark gaps from the codebase, then extends the project's existing harness to cover them. Triggers: 'harden this', 'try to break this', 'red team', 'find the exploits', 'what's not covered'."
---

# Harden — Autonomous Adversarial Validator

Prove the system holds under inputs the author didn't imagine. The AI derives what to attack, prove, and fuzz — not the user. One skill absorbs red-team (write exploits), property-based proof (verify invariants), fuzz (probe parsers and boundaries), and benchmark stress.

Shared conventions in `_common.md`. Three rules govern everything:

1. **Extend, never duplicate.** Every finding lands in the project's existing test/eval/bench/observability harness. No parallel sidecar.
2. **Real flows, real state.** No mocks as default. Real DB, HTTP, container, UI, agent. Mocks only at process boundaries when alternatives are impossible.
3. **Take the lead.** Don't ask the user what to test. Scan the code, derive the adversarial surface, rank by risk, go.

## Prerequisites

- **A runnable system to attack.** Services, full-stack apps, agents, CLIs. Pure-library repos: harden's value is limited — `/critical-audit` is usually right. If harden anyway, inventory must find a harness to attack through (example app, integration tests, CLI).
- **The project's test harness exists.** Extending a non-existent harness means building one — out of scope. Route to `/pursue` first.
- **Resume**: prior `.evolve/harden/<date>-report.md` findings unresolved? Re-run those targets first before discovering new ones.

## When harden vs critical-audit

| Signal | Skill |
|--------|-------|
| "Try to break this" / "red team" / "find exploits" | `/harden` |
| "Prove this is secure" / "verify this invariant" | `/harden` |
| "What's not covered" / "find the gaps" | `/harden` |
| "Did we miss anything" on security/correctness path | `/harden` |
| Review existing code for bugs (read-only) | `/critical-audit` |

`/critical-audit` finds bugs by reading. `/harden` finds them by attacking.

## The cycle

```
INVENTORY → SCAN → RANK → EXTEND → EXECUTE → REPORT → DISPATCH
```

## Inventory

Map what the project has to measure, test, observe. You will extend this — never build parallel.

```bash
bash ${SKILL_DIR}/inventory.sh
```

Record in `.evolve/harden/<date>-inventory.md`:

```markdown
## Test infra
- Runner, location, real-vs-mocked ratio, coverage report number

## Eval infra
- Suite (.evolve/, evals/, none), scenarios, judges, scoring dimensions, scorecard

## Benchmark infra
- Runner, metrics tracked, regression threshold, where baseline lives

## Observability
- Logs (where, format), traces (OTel/Sentry/Langfuse), metrics, where findings should land
```

If something doesn't exist, note it — but extend what IS there, don't fork.

**Mocks-as-coverage is itself a finding.** If real-vs-mocked ratio shows mocks dominating integration-test surface (>30% on real-infra paths: DB, HTTP, agents, sandboxes, payment), that's HIGH finding #1 — `category=test-integrity`. A mocked test passes while the bug stays in production. Do not start the adversarial scan until this is named.

## Adversarial scan

Derive the attack surface by reading code. Write every target with attack class and risk to `.evolve/harden/<date>-surface.md`. Six dimensions — run in parallel subagents:

### 1. Invariants

What claims does the code implicitly make? Every state machine transition, access-control check, data-flow boundary is an invariant.
- "After `revokeToken(jti)`, no request with that jti succeeds."
- "After `deleteSandbox(id)`, no direct-access token for id works."
- "A user can only read rows where `owner_id = session.user`."
- "A JWT with `alg: none` is always rejected."

### 2. Fuzz targets

Every parser, type coercion, external input boundary.
- JSON body (malformed, oversized, UTF-8 corner cases, deep nesting)
- URL/path (traversal, encoding, null bytes, unicode normalization)
- Headers (CRLF injection, oversized)
- File uploads (zip bombs, symlink targets, malformed archives)

### 3. Attack surface (OWASP + beyond)

Systematic — every applicable class, not just likely ones:

- **Injection:** SQL, NoSQL, OS command, LDAP, XPath, template (SSTI), header (CRLF), log injection. Test every input→query/exec path.
- **Broken auth:** Token replay, session fixation, JWT `alg:none`/`alg:HS256` on RS256 keys, credential-stuffing timing oracle, password reset token prediction, OAuth state bypass, PKCE downgrade.
- **BOLA/IDOR:** Every endpoint with an ID param. Replace your ID with another tenant's. Sequential, UUIDs from other responses, zero, negative, max-int.
- **SSRF:** Every URL fetch. `169.254.169.254`, `localhost:PORT`, `file://`, gopher, DNS rebinding. Chain through redirects.
- **Mass assignment:** POST/PUT with extra fields (`isAdmin: true`, `role: owner`, `creditBalance: 999999`). Does the ORM silently accept?
- **Misconfig:** Default credentials, debug endpoints (`/debug`, `/metrics`, `/graphql`), verbose errors leaking stack traces, CORS `*`, missing rate limits.
- **Crypto:** Hardcoded secrets in source/env/logs, weak hashing (MD5/SHA1 for passwords), missing HTTPS enforcement, predictable tokens.
- **CSRF/clickjacking:** State-changing without CSRF tokens. Missing `X-Frame-Options`/CSP `frame-ancestors`.
- **Deserialization:** Untrusted JSON.parse, pickle, Java serialization → injection payloads.
- **Supply chain:** `npm audit --audit-level=critical`, `cargo audit`, `pip-audit`. Postinstall scripts. Pin vs range.

### 4. Credential hunting

Secrets leak. Find them first.
- `git log --all -p | grep -iE 'api.?key|secret|password|token|sk-|pk-'` — full history, not HEAD
- Hardcoded keys, connection strings, JWTs, private keys in source
- `.env*` permissions (644 not 600)
- Logs/debug for leaked tokens or PII
- Error responses for internal paths, stack traces, credential fragments
- CI configs for plaintext secrets

### 5. Race conditions & TOCTOU

Concurrent mutations are where billing, auth, and state machines break.
- Double-spend: send N identical debit requests simultaneously. Balance go negative?
- Signup race: same account from 2 threads. Duplicate user? Orphaned state?
- Token revocation race: revoke + use simultaneously. Use succeeds?
- File/resource TOCTOU: check-then-act where another request mutates between
- `Promise.all` with 10–50 concurrent against every state-changing endpoint

### 6. Benchmark gaps

- Hot-path functions with no `.bench()` coverage
- Concurrency paths with no load test
- Memory-bound operations with no leak test
- ReDoS: backtracking regex on user input

## Rank

```
risk = severity × blast_radius × exploitability × coverage_gap
```

Each 1–10. Pick top 10–20 fitting the compute budget.

## Extend the existing harness

For each selected target:

- **Unit tests** → existing test runner. Same directory, same naming, imports from same sources. No new directory, no new runner.
- **Eval scenarios** → existing eval suite. If `.evolve/` or `evals/` exists, add a scenario file in the right shape, register in the index.
- **Fuzz targets** → existing property-based harness (fast-check, hypothesis, cargo fuzz). Add one only if the test runner supports plugin patterns.
- **Benchmarks** → existing bench runner that CI runs. No CI bench job → surface in report, flag for `/pursue`. Don't fork.
- **Observability** → existing telemetry channel.

## Execute — red team

Run the real system. No mocks beyond process boundaries. Think like an attacker, not a tester. Goal isn't "check that auth exists" — it's "bypass auth, escalate to admin, read another tenant's data, prove the full chain with a reproducible script."

### Environment

- Real DB? Spin it up (docker-compose, testcontainer, project's canonical test DB).
- Real HTTP? Start the real server on a real port.
- Real container/sandbox? Use the project SDK to spawn real containers. Run PoCs inside.
- Real agent? Invoke with real tools against real endpoints.
- Real UI? Drive with Playwright/bad CLI against a real DOM.

### Methodology — every target, in this order

1. **Recon.** Map attack surface from outside — enumerate endpoints, discover hidden routes (`/debug`, `/admin`, `/graphql`, `/metrics`, `/.env`), fingerprint frameworks/versions, collect error messages for info leaks.
2. **Exploit.** Write actual exploit code. Not "this might be vulnerable" — `curl -X POST https://target/api/proxy -d '{"url":"http://169.254.169.254/latest/meta-data/"}'` and show the response. Every finding needs a runnable PoC.
3. **Escalate.** Chain findings. Auth bypass alone is a finding. Auth bypass → read API keys → access sandboxes → exfiltrate code → critical chain. Always try:
   - Anonymous → authenticated (registration bypass, default creds, token theft)
   - User → admin (IDOR on admin endpoints, mass assignment on role fields, JWT claim manipulation)
   - Single-tenant → cross-tenant (swap tenant IDs, shared resource access, cache poisoning)
   - Application → infrastructure (SSRF to cloud metadata, container escape, env exfiltration)
4. **Exfiltrate.** Prove impact. Got access → show what data you can read. Bypassed billing → zero-cost request. Sandbox escape → host filesystem access. Make severity undeniable.
5. **Persist.** Can the attacker maintain access? Planted JWT with no expiry, webhook to external URL, modified config surviving restart. Note these even if not exploited.

### Race execution — trigger, don't theorize

```typescript
// billing double-spend race
const results = await Promise.allSettled(
  Array.from({ length: 20 }, () =>
    fetch('/api/billing/debit', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: userBalance }), // full balance, 20×
    })
  )
)
const successes = results.filter(r => r.status === 'fulfilled' && r.value.ok)
// successes > 1 → user spent more than their balance. CRITICAL.
```

### Capture

- Invariant holds/fails (10K+ inputs for "holds" claims)
- Counterexample on failure (minimal reproduction)
- Full exploit chain on success (runnable script, not prose)
- Exact HTTP requests/responses (curl preferred)
- Performance number + delta from baseline
- Tokens, time, cost, side effects, state deltas

## Report

Write `.evolve/harden/<date>-report.md`:

```markdown
# Harden Report — <scope>

## Proven invariants
| Invariant | Inputs tested | Result |
| After revokeToken(jti), all requests with jti fail | 10,000 adversarial | HOLDS |

## Exploit chains (CRITICAL/HIGH)
| # | Chain | Severity | Impact |
| 1 | Anonymous → IDOR on /api/users/:id → read API keys → access sandbox | CRITICAL | Full cross-tenant data access |

### Chain 1: Cross-tenant data exfiltration via IDOR
**Recon:** GET /api/users/1 returns 200 when authenticated as user 2.
**Exploit:**
```bash
curl -H "Authorization: Bearer $USER2_TOKEN" https://target/api/users/1/keys
# Response: {"keys": [{"id": "sk-tan-abc123", "name": "production"}]}
curl -H "Authorization: Bearer sk-tan-abc123" https://target/api/sandbox/list
# Response: user 1's sandboxes visible
```
**Escalation:** API key grants full sandbox access including file r/w.
**Impact:** Any authenticated user can read any other user's credentials.
**Fix:** `requireOwnership(userId, session.user)` on `/api/users/:id/*`. See file:line.

## Credential findings
| Location | Type | Severity |

## Race condition findings
| Endpoint | Concurrent requests | Result |

## Dependency vulnerabilities
| Package | CVE | Severity | Fix |

## Still unknown
| Surface | Why couldn't I reach it |

## Extended infra
- Added N property-based tests to existing vitest suite
- Added N eval scenarios to existing .evolve/ suite
- Added N benchmarks to existing bench runner
- Flagged: no CI bench regression gate — needs /pursue

## Ranked next steps
1. [CRITICAL] → fix now
2. [HIGH] → fix this sprint
3. [Coverage gap] → /pursue
```

## Dispatch

End with explicit routing:

- **Every CRITICAL with PoC** → fix in code now. Don't defer.
- **Every HIGH without PoC** → iterate `/harden` until you have a PoC or prove the invariant.
- **Every coverage gap** → `/pursue` to build missing infra ("no CI bench gate — needs generational addition").
- **Every tunable metric uncovered** → `/evolve` with the new baseline.

Write `.evolve/current.json`:
```json
{"mode":"evolve|pursue|harden","status":"findings_pending|clean","activeHarden":"<date>-report.md","critical":N,"high":N}
```

## Persist

- Inventory → `.evolve/harden/<date>-inventory.md`
- Surface → `.evolve/harden/<date>-surface.md`
- Report → `.evolve/harden/<date>-report.md`
- Global index → `~/.claude/harden/INDEX.md` (one line per run)
- Durable findings → project memory for repeat regression prevention
- `.evolve/skill-runs.jsonl` line on completion

## Rules

1. Inventory before attacking. Extend what exists.
2. Derive the surface yourself — don't ask the user.
3. Real flows, real state. No mocks as default.
4. Every finding has a PoC or a 10K-input proof.
5. Route to code fix, `/pursue`, or `/evolve`. Never "note for later."
6. Measure everything. Emit to the project's observability channel.
