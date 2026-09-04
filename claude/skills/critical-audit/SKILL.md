---
name: critical-audit
description: Review code, docs, APIs, SDKs, or products for correctness and risk, with ranked fixes.
---

# Critical Audit

Emit a **ranked findings table**, not a review essay. A finding without `file:line` + a concrete failure scenario + a fix + a verification is a vibe: drop it and count it as dropped.
Severity maps CRITICAL/HIGH = **P1** (blocking), MEDIUM = **P2**, and LOW = **P3**.

## Flow

1. **Scope.** `--diff-only` → `git diff --name-only <base>..HEAD` (base = `--base <ref>`, default `origin/main`); 0 files → abort. `--scope a,b` → those paths. Else whole repo. Record base sha + head sha.
2. **Detect project type** (or `--project`): `Cargo.toml` → unsafe/error-handling/API · `package.json`+react → state/a11y/bundle · `package.json` → async/types/errors · `.sol` → reentrancy/access-control/gas/storage · `pyproject.toml` → types/errors/tests.
3. **Read before judging** — the changed code, its tests, and 3 existing callsites of any pattern you call inconsistent.
4. **Run reviewers serially** (A → B → C). `--parallel` only after checking quota headroom this session.
5. **Dedupe** identical `file:line` + issue; **rank** CRITICAL > HIGH > MEDIUM > LOW; report how many you dropped.
6. **Self-gate (9 checks), then emit.** The artifact states which failed.
7. **Persist** `.agent/critical-audit/<iso-ts>/{manifest.json, findings.jsonl, summary.md}`; append `.agent/skill-runs.jsonl`. `--reaudit <path>` re-checks a prior run's findings against HEAD.

## Reviewer lenses

| Reviewer | Hunts | Runs when |
|---|---|---|
| **A — correctness & security** | logic/off-by-one, injection, auth bypass, SSRF, path traversal, TOCTOU, swallowed errors, create-without-cleanup, resource leaks | always |
| **B — architecture & quality** | API coupling, N+1, blocking calls, allocation churn, missing error-path and boundary tests | always |
| **C — standards & real-system coverage** | drift vs 3 sampled callsites, doc accuracy, dep hygiene, mocks as *primary* coverage | scope >5 files, or scope touches tests |
| **`--personas=x,y,z`** (min 3) | customer-facing surface gaps: wire-chain breaks, missing narrative anchor, idempotency, resume-after-crash | SDK / docs / examples / README only |

Persona briefs live in `agents/personas/*.md`; the 5-persona precedent (4 wire-chain breaks + 1 durable-state anti-pattern that a single pass missed) is a worked example in `references/full-reference.md`, which is **not** a second contract.

## Hard rules

| Rule | Why |
|---|---|
| **≤600 words outside tables.** No paragraph >3 lines — if it is longer, it is a table. | Prior contract shipped 4 output nouns and 0 table schemas across 669 runs; a noun list produces paragraphs. |
| **`k of n` or `n=` on every quantity.** Banned as claims: several, many, most, often, repeated, significant, substantial, strong, widespread, widely. | "several callers" is unrankable; "4 of 11 callers" sorts. |
| **`measured \| inferred \| hypothesis` on every finding row**, with the exact check for `measured` (command + output, `path:line`, run id). | `hypothesis` rows are banned from the Verdict and from the P1 set — an unreproduced guess must not block a merge. |
| **Concrete failure scenario per finding: input/state → wrong result.** "Could be unsafe", "may leak" fail the gate. | If you cannot name the triggering input, you have not proven a defect. |
| **Evidence is a pointer**, never a summary: `path:line`, PR#, run id, or literal command + its output. "The tests pass" is a defect; `vitest run pkg → 41/41` is a claim. | — |
| **Cost both sides, same unit**, assumption stated: `cost if shipped` and `saved if fixed` in one impact unit (requests/day, rows, $/mo, minutes of downtime). Unknown → `unmeasured (<reason>)`; deleting the column is a gate failure. | Saved < cost when the fix is partial or the path is reachable on only a subset of callers — that gap is the ranking signal. |
| **Serial by default.** | 3 of 5 documented `--parallel` runs hit provider 429 and lost findings. |
| **Real-system tests only.** Any test added to close a finding must hit the real failure surface; `vi.fn()`/`mockFetch` as primary coverage is itself a finding. | A mocked test goes green while the production defect ships. |
| **No score, no style nits.** No `X/10`. No naming/format comments unless they change correctness, performance, or a reader's ability to find the bug. | An unanchored 1–10 grade carries ~0 bits and costs words the findings table needs. |
| **No ceremony.** No restating the task, no "None from this session" sections, no closing summary of what you just emitted. Omit any empty section. | — |

## Output template

Emit exactly this. Omit a section only where its rule says so.

```markdown
# Audit: <scope> — <base sha>..<head sha> — n=<F> files, <k> findings

**Verdict:** REQUEST_CHANGES | APPROVE — <reason in ≤12 words> · <c> CRITICAL / <h> HIGH / <m> MEDIUM / <l> LOW
**Worst:** #1 `<file:line>` — <one line> · cost if shipped <n unit>
**Next:** <exact command or /skill>

## Scope
| Field | Value |
|---|---|
| Files | n=<F> via `<flag>` |
| Base..head | `<sha>..<sha>` |
| Project type | <type> |
| Reviewers | A,B,C[,personas=…] · serial\|parallel |
| Not inspected | <what, why> |

## Findings — <k> of <total>, ranked
| # | Sev | file:line | Defect | Failure scenario (input/state → wrong result) | Status | Evidence | Fix | Verification | Cost if shipped | Saved if fixed |
|---:|---|---|---|---|---|---|---|---|---:|---:|

<total−k> dropped (no reproducible failure scenario / no actionable fix).

## Systemic patterns — same defect in ≥3 files
| Pattern | Files | Instances | Root fix | Status |
|---|---|---:|---|---|

Omit when no pattern reaches 3 files.

## Re-audit (only with `--reaudit`)
| Prior # | Sev | Resolution | Evidence |
|---:|---|---|---|

Resolution ∈ resolved · still-present · moved(`file:line`) · unverifiable. Any CRITICAL/HIGH `still-present` blocks the calling workflow.

## Assumptions & unverified
| Assumption | Finding it would flip | Check that settles it |
|---|---|---|

## Self-gate
<k>/9 passed — failed: <list, or "none">.
1 verdict = decision + 1 number · 2 every finding has file:line · 3 concrete failure scenario · 4 status label · 5 evidence is a pointer · 6 cost both sides · 7 fix + verification per row · 8 zero adjectives standing in for counts · 9 <N> words ≤600 outside tables.
```

**Gate:** `REQUEST_CHANGES` if ≥1 CRITICAL or HIGH is unresolved, or ≥1 MEDIUM whose failure scenario names a production-incident path. Otherwise `APPROVE`.

## Calibration

- **0/10** — "Overall the error handling is weak in several places and tests are thin; 7/10." 0 `file:line`, 0 scenarios, 0 costs, 1 unanchored score, 3 banned adjectives.
- **10/10** — `| 1 | CRITICAL | src/auth.ts:88 | session id compared with == after JSON parse | attacker sends id `0` → matches stored `"0"`, session takeover | measured (`vitest run auth → repro test fails at :88`) | PR#4110 line 88 | use timing-safe strict compare | add `auth.spoof.test.ts` asserting reject | ~2.4k req/day exposed | 2.4k (full) |`

## Log the run

```bash
skill-run-log /critical-audit --target "<scope> n=<F> files" --verdict <APPROVE|REQUEST_CHANGES> --next /<skill-or-stop>
```

The log line is provenance, not evidence: a finding is supported only by the pointer it cites.

## Then consider

| Condition (threshold) | Next skill | Pass it |
|---|---|---|
| ≥1 CRITICAL/HIGH unresolved on an open PR | `/review-to-green` | PR#, the finding rows, per-row verification |
| ≥1 finding in class auth/authz/injection/secret/TOCTOU | `/harden` | file:line list + failure scenarios |
| Fixes pushed and ≥1 CI job red | `/converge` | run id + failing job names |
| Systemic table non-empty (same defect in ≥3 files) | `/pursue` | pattern row + full file list |
| ≥3 findings are docs/README accuracy | `/docs-slop-audit` | the doc paths + the wrong claims |
| ≥1 fix landed since a prior `.agent/critical-audit/<ts>/` run | `/critical-audit --reaudit <ts>` | prior run path |
| 0 CRITICAL/HIGH and caller was `/pursue` diff-audit | stop | APPROVE line + head sha |
