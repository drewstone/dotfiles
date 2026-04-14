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

## Phase 1: Adversarial Scan

Derive the attack surface autonomously by reading the code. Write every target, with its attack class and risk, to `.evolve/harden/<date>-surface.md`.

**Four scan dimensions — run in parallel subagents:**

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

3. **Attack surface.** Every trust boundary, external dependency, credential storage. Examples:
   - SSRF targets (cloud metadata, internal services)
   - Auth bypass (token replay, cid confusion, alg substitution)
   - Container escape (if containerized)
   - Supply chain (npm postinstall, git hook, malicious mirror)

4. **Benchmark gaps.** Every latency-sensitive path, every resource-bounded operation. Examples:
   - Hot-path functions with no `.bench()` coverage
   - Concurrency paths with no load test
   - Memory-bound operations with no leak test

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

## Phase 4: Execute

Run the real system. No mocks beyond process boundaries.

- Real DB? Spin up the real DB (docker-compose service, testcontainer, or the project's canonical test DB).
- Real HTTP? Start the real server on a real port.
- Real container/sandbox? Use the project's SDK (e.g., sandbox SDK) to spawn real containers. Run exploit PoCs inside them.
- Real agent? Invoke the real agent with real tools against real endpoints.
- Real UI? Drive it with Playwright/bad CLI against a real DOM.

Capture everything:
- Invariant holds / fails
- Counterexample on failure (minimal reproduction)
- Attack succeeds / blocked (with PoC code on success)
- Performance number + delta from baseline
- Tokens, time, cost, side effects, state deltas

## Phase 5: Report

Write `.evolve/harden/<date>-report.md`:

```markdown
# Harden Report — <scope>
Date: <date>

## Proven
| Invariant | Inputs tested | Result |
| After revokeToken(jti), all requests with jti fail | 10,000 adversarial | HOLDS |

## Broken
| Finding | Severity | PoC | File:Line |
| SSRF to 169.254.169.254 succeeds from sandbox | CRITICAL | [curl command] | docker.ts:597 |

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
