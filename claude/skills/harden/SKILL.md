---
name: harden
description: "Autonomous adversarial validator. Scans the codebase, derives every invariant worth proving, every fuzz target, every attack surface, every benchmark gap — ranks by risk × blast × coverage gap — then extends the project's EXISTING test/eval/bench/observability infra to cover them. Runs real adversarial inputs against the real system. Ends with proven invariants, reproducible counterexamples, and ranked findings routed to code fixes or /pursue. Use when the user says 'harden this', 'try to break this', 'red team', 'prove this is secure', 'find the exploits', 'what's not covered', or wants adversarial validation of a system claim."
---

# Harden — Autonomous Adversarial Validator

Prove the system holds under inputs the author didn't imagine. The AI derives what to attack, prove, and fuzz — not the user. One skill absorbs red-team (write exploits), property-based proof (verify invariants), fuzz (probe parsers and boundaries), and benchmark stress (find performance regressions).

Three rules that govern everything:

1. **Extend, never duplicate.** Every finding lands in the project's existing test/eval/bench/observability harness. Never build a parallel sidecar.
2. **Real flows, real state.** No mocks as default. Real DB, real HTTP, real container, real UI, real agent. Mocks only at process boundaries where the alternative is impossible.
3. **Take the lead.** Don't ask the user what to test. Scan the code, derive the adversarial surface, rank by risk, go.

## When to use

| Signal | Skill |
|--------|-------|
| "Try to break this" / "red team" / "find exploits" | `/harden` |
| "Prove this is secure" / "verify this invariant" | `/harden` |
| "What's not covered" / "find the gaps" | `/harden` |
| "Did we miss anything" on a security/correctness-critical path | `/harden` |
| Build-something new | `/pursue` |
| Tune a known metric | `/evolve` |
| Review existing code for bugs | `/critical-audit` (passive review) vs `/harden` (active attack) |

`/critical-audit` finds bugs by reading. `/harden` finds them by attacking.

## The Cycle

```
INVENTORY → SCAN → RANK → EXTEND → EXECUTE → REPORT → DISPATCH
```

## Phase 0: Inventory

Before attacking, map what the project already has to measure, test, and observe. You will extend this — never build parallel.

Run the inventory script:
```bash
bash ${SKILL_DIR}/inventory.sh
```

Record in `.evolve/harden/<date>-inventory.md`:

```markdown
## Test infra
- Runner: [vitest / jest / pytest / cargo test / go test]
- Location: [tests/, __tests__/, etc.]
- Real-vs-mocked ratio: [read a few tests, assess honestly]
- Coverage: [run the coverage report, record the real number]

## Eval infra
- Suite: [.evolve/, evals/, or none]
- Scenarios, judges, scoring dimensions
- Scorecard location, baseline history

## Benchmark infra
- Runner: [benchmark.js, criterion, vitest bench, custom scripts]
- Metrics tracked: [latency, tokens, cost, memory]
- Regression threshold: [does CI fail on regression? where's the baseline?]

## Observability
- Logs: [where written, what format]
- Traces: [OpenTelemetry, Sentry, Langfuse, etc.]
- Metrics: [Prometheus, dashboard]
- Where findings should land: [specific test file / scorecard / dashboard]
```

If any of these don't exist, note it — but you still must extend whatever IS there, not create a new harness.

**Mocks-as-coverage is itself a finding.** If the real-vs-mocked ratio shows mocks dominating the integration-test surface (anything above ~30% mock coverage on real-infra paths: DB, HTTP, agents, sandboxes, payment), that's the first finding in your report — SEVERITY=HIGH, category=test-integrity. A mocked test passes while the bug stays in production. Do not start Phase 1 adversarial scan until this is named in the inventory; attacks against a mock-coverage harness produce false confidence.

## Phase 1: Adversarial Scan

Derive the attack surface autonomously by reading the code. Write every target, with its attack class and risk, to `.evolve/harden/<date>-surface.md`.

**Six scan dimensions — run in parallel subagents:**

1. **Invariants.** What claims does the code implicitly make? Every state machine transition, every access-control check, every data-flow boundary is an invariant. Examples:
   - "After `revokeToken(jti)`, no request with that jti succeeds."
   - "After `deleteSandbox(id)`, no direct-access token for id works."
   - "A user can only read rows where `owner_id = session.user`."
   - "A JWT with `alg: none` is always rejected."

2. **Fuzz targets.** Every parser, every type coercion, every external input boundary. Examples:
   - JSON body parsers (malformed, oversized, UTF-8 corner cases, deep nesting)
   - URL/path parsers (traversal, encoding, null bytes, unicode normalization)
   - Headers (CRLF injection, oversized)
   - File uploads (zip bombs, symlink targets, malformed archives)

3. **Attack surface (OWASP + beyond).** Every trust boundary, external dependency, credential. Systematic — run every applicable class, not just the ones that look likely:
   - **Injection:** SQL, NoSQL, OS command, LDAP, XPath, template (SSTI), header (CRLF), log injection. Test every input→query/exec path.
   - **Broken auth:** Token replay, session fixation, JWT `alg:none`/`alg:HS256` on RS256 keys, credential stuffing timing oracle, password reset token prediction, OAuth state parameter bypass, PKCE downgrade.
   - **BOLA/IDOR:** Enumerate every endpoint with an ID param. Replace your ID with another tenant's. Try sequential IDs, UUIDs from other responses, zero, negative, max-int.
   - **SSRF:** Every place the server fetches a URL. Try `169.254.169.254`, `localhost:PORT`, `file://`, gopher, DNS rebinding. Chain SSRF through redirects.
   - **Mass assignment:** POST/PUT with extra fields (`isAdmin: true`, `role: owner`, `creditBalance: 999999`). Check if the ORM/framework silently accepts them.
   - **Security misconfiguration:** Default credentials, debug endpoints (`/debug`, `/metrics`, `/graphql`), verbose error messages leaking stack traces, CORS `*`, missing rate limits on auth endpoints.
   - **Cryptographic failures:** Hardcoded secrets in source/env/logs, weak hashing (MD5/SHA1 for passwords), missing HTTPS enforcement, predictable tokens (timestamp-based, sequential).
   - **CSRF/clickjacking:** State-changing POST/PUT/DELETE without CSRF tokens. Missing `X-Frame-Options`/CSP `frame-ancestors`.
   - **Deserialization:** If the app deserializes user-controlled data (JSON.parse of untrusted, pickle, Java serialization), try injection payloads.
   - **Supply chain:** `npm audit --audit-level=critical`, `cargo audit`, `pip-audit`. Check for postinstall scripts in deps. Pin vs range analysis.

4. **Credential hunting.** Secrets leak. Find them before an attacker does.
   - `git log --all -p | grep -iE 'api.?key|secret|password|token|sk-|pk-'` — scan full git history, not just HEAD
   - Grep source for hardcoded keys, connection strings, JWTs, private keys
   - Check `.env*` files for overly broad permissions (644 not 600)
   - Check logs/debug output for leaked tokens or PII
   - Check error responses for internal paths, stack traces, or credential fragments
   - Check CI configs for secrets in plaintext (not using secret managers)

5. **Race conditions & TOCTOU.** Concurrent mutations are where billing, auth, and state machines break.
   - Double-spend: send N identical debit requests simultaneously. Does balance go negative?
   - Signup race: create same account from 2 threads. Duplicate user? Orphaned state?
   - Token revocation race: revoke + use token simultaneously. Does the use succeed?
   - File/resource TOCTOU: check-then-act patterns where another request can mutate between check and act
   - Use `Promise.all` with 10-50 concurrent requests against every state-changing endpoint

6. **Benchmark gaps.** Every latency-sensitive path, every resource-bounded operation. Examples:
   - Hot-path functions with no `.bench()` coverage
   - Concurrency paths with no load test
   - Memory-bound operations with no leak test
   - ReDoS: regex patterns with backtracking on user input

## Phase 2: Rank

Compute risk for every target:

```
risk = severity × blast_radius × exploitability × coverage_gap
```

- `severity`: what breaks (data loss, auth bypass, crash, slowdown) — 1-10
- `blast_radius`: how many users/tenants/systems affected — 1-10
- `exploitability`: how hard to trigger (public, authed, requires timing) — 1-10
- `coverage_gap`: inverse of existing test quality for this target — 1-10

Pick the top N (default 10–20) that fit in a reasonable compute budget.

## Phase 3: Extend Existing Harness

For each selected target, add coverage to the REAL harness. Rules:

- **Unit tests → existing test runner.** Add to the same directory, matching file naming, importing from the same sources. No new directory, no new runner.
- **Eval scenarios → existing eval suite.** If the project has `.evolve/` or `evals/`, add a scenario file in the right shape, register it in the suite index.
- **Fuzz targets → existing property-based harness.** If one exists (fast-check, hypothesis, cargo fuzz), extend it. If not, add one BUT ONLY if the project test runner supports plugin patterns.
- **Benchmarks → existing bench runner.** Add to the benchmark suite that CI already runs. If there's no benchmark job in CI, surface this gap in the report but don't fork infra — flag it for `/pursue`.
- **Observability → existing telemetry.** Every adversarial test emits metrics to the same channel real tests use.

## Phase 4: Execute — Red Team

Run the real system. No mocks beyond process boundaries. **Think like an attacker, not a tester.** The goal is not "check that auth exists" — it's "bypass auth, escalate to admin, read another tenant's data, and prove the full chain with a reproducible script."

### Environment

- Real DB? Spin up the real DB (docker-compose, testcontainer, or the project's canonical test DB).
- Real HTTP? Start the real server on a real port.
- Real container/sandbox? Use the project's SDK to spawn real containers. Run exploit PoCs inside them.
- Real agent? Invoke the real agent with real tools against real endpoints.
- Real UI? Drive it with Playwright/bad CLI against a real DOM.

### Offensive methodology

For every target from the ranked surface, execute in this order:

1. **Recon.** Map the real attack surface from the outside — enumerate endpoints, discover hidden routes (`/debug`, `/admin`, `/graphql`, `/metrics`, `/.env`), fingerprint frameworks/versions, collect error messages for info leaks.

2. **Exploit.** Write the actual exploit code. Not "this endpoint might be vulnerable to SSRF" — `curl -X POST https://target/api/proxy -d '{"url":"http://169.254.169.254/latest/meta-data/"}'` and show the response. Every finding needs a runnable PoC.

3. **Escalate.** Chain findings. Auth bypass alone is a finding. Auth bypass → read another user's API keys → use those keys to access their sandboxes → exfiltrate their code → that's a critical chain. Always try to escalate:
   - Anonymous → authenticated (registration bypass, default creds, token theft)
   - User → admin (IDOR on admin endpoints, mass assignment on role fields, JWT claim manipulation)
   - Single-tenant → cross-tenant (swap tenant IDs in tokens, shared resource access, cache poisoning)
   - Application → infrastructure (SSRF to cloud metadata, container escape, env var exfiltration)

4. **Exfiltrate.** Prove impact. If you got access, show what data you can read. If you bypassed billing, show the zero-cost request. If you escaped a sandbox, show host filesystem access. The PoC should make the severity undeniable.

5. **Persist.** Can the attacker maintain access? Planted JWT with no expiry, webhook to external URL, modified config that survives restart. Check these paths exist even if you don't exploit them — note them as findings.

### Race condition execution

Don't just theorize about races — trigger them:

```typescript
// Example: billing double-spend race
const results = await Promise.allSettled(
  Array.from({ length: 20 }, () =>
    fetch('/api/billing/debit', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: userBalance }), // full balance, 20x
    })
  )
)
const successes = results.filter(r => r.status === 'fulfilled' && r.value.ok)
// If successes > 1, the user spent more than their balance. Finding: CRITICAL.
```

### Capture everything

- Invariant holds / fails (with 10K+ inputs for "holds" claims)
- Counterexample on failure (minimal reproduction)
- **Full exploit chain** on success (runnable script, not prose)
- **Exact HTTP requests/responses** for every finding (curl commands preferred)
- Performance number + delta from baseline
- Tokens, time, cost, side effects, state deltas

## Phase 5: Report

Write `.evolve/harden/<date>-report.md`:

```markdown
# Harden Report — <scope>
Date: <date>

## Proven invariants
| Invariant | Inputs tested | Result |
| After revokeToken(jti), all requests with jti fail | 10,000 adversarial | HOLDS |

## Exploit chains (CRITICAL/HIGH)
| # | Chain | Severity | Impact |
| 1 | Anonymous → IDOR on /api/users/:id → read any user's API keys → use key to access their sandbox | CRITICAL | Full cross-tenant data access |

### Chain 1: Cross-tenant data exfiltration via IDOR
**Recon:** GET /api/users/1 returns 200 with full profile when authenticated as user 2.
**Exploit:**
```bash
# As user 2, read user 1's API keys
curl -H "Authorization: Bearer $USER2_TOKEN" https://target/api/users/1/keys
# Response: {"keys": [{"id": "sk-tan-abc123", "name": "production"}]}

# Use stolen key to access user 1's sandbox
curl -H "Authorization: Bearer sk-tan-abc123" https://target/api/sandbox/list
# Response: user 1's sandboxes visible
```
**Escalation:** API key grants full sandbox access including file read/write.
**Impact:** Any authenticated user can read any other user's credentials and access their infrastructure.
**Fix:** `requireOwnership(userId, session.user)` check on `/api/users/:id/*` routes. See file:line.

## Credential findings
| Location | Type | Severity |
| git log (commit abc123, 2025-03-14) | Hardcoded Stripe secret key in .env committed then removed | HIGH — still in git history |

## Race condition findings
| Endpoint | Concurrent requests | Result |
| POST /api/billing/debit | 20 simultaneous full-balance debits | 3 succeeded — user spent 3x balance | CRITICAL |

## Dependency vulnerabilities
| Package | CVE | Severity | Fix |
| lodash@4.17.20 | CVE-2021-23337 | HIGH | Upgrade to 4.17.21 |

## Still unknown
| Surface | Why couldn't I reach it |
| Firecracker VM network isolation | No Firecracker host available locally |

## Extended infra
- Added N property-based tests to existing vitest suite
- Added N eval scenarios to existing .evolve/ suite
- Added N benchmarks to existing bench runner
- Flagged: no CI bench regression gate — needs /pursue

## Ranked next steps
1. [CRITICAL finding] → fix now
2. [HIGH finding] → fix this sprint
3. [Coverage gap] → /pursue to build missing infra
```

## Phase 6: Dispatch

End every `/harden` run with explicit routing:

- **Every CRITICAL finding with a PoC** → fix in code now. Do not defer.
- **Every HIGH without a PoC** → iterate in `/harden` until you have a PoC or prove the invariant holds.
- **Every coverage gap** → `/pursue` to build the missing infra (e.g., "project has no CI benchmark gate — needs generational addition").
- **Every tunable metric uncovered** → `/evolve` with the new baseline.

Write `.evolve/current.json`:
```json
{
  "mode": "evolve | pursue | harden",
  "status": "findings_pending | clean",
  "activeHarden": "<date>-report.md",
  "critical": N,
  "high": N
}
```

## Persist

- Inventory → `.evolve/harden/<date>-inventory.md`
- Surface → `.evolve/harden/<date>-surface.md`
- Report → `.evolve/harden/<date>-report.md`
- Global index → `~/.claude/harden/INDEX.md` (one line per run)
- Durable findings → project memory (`.memory/` if used) for repeat regression prevention

## Rules

1. Inventory before attacking. Extend what exists.
2. Derive the surface yourself — don't ask the user.
3. Real flows, real state. No mocks as default.
4. Every finding has a PoC or a 10K-input proof.
5. Route to code fix, `/pursue`, or `/evolve`. Never "note for later."
6. Measure everything. Emit to the project's observability channel.

## Related Skills

```
/harden          ← adversarial: derive, attack, prove, measure
  ├── /critical-audit  ← passive review (complementary, not replacement)
  ├── /pursue    ← when coverage gap needs architectural infra
  ├── /evolve    ← when harden exposes a tunable metric
  └── /diagnose  ← when a PoC fails to reproduce reliably
```
