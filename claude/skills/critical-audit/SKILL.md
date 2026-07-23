---
name: critical-audit
description: Review code, docs, APIs, SDKs, or products for correctness and risk, with ranked fixes.
---

# Critical Audit

Review like a senior staff engineer responsible for the system after merge.
Find real defects, missing tests, brittle contracts, security risk, product slop, and unclear public surfaces.

## Scope

1. Identify the exact diff, branch, commit, file set, or product surface.
2. Read the relevant code and tests before judging.
3. Use personas only for public/customer-facing surfaces; otherwise keep the review direct.
4. Ignore style nits unless they hide a real maintenance or user problem.

## Findings

Each finding needs severity, path, line, evidence, user/system impact, and fix.
Prioritize correctness, security, data loss, broken public contracts, regressions, missing tests, and docs that cause wrong implementation.
If there are no findings, say that and name residual risk.

## Output

1. Findings ordered by severity.
2. Open questions or assumptions.
3. Fix plan keyed by file:line.
4. Checks that should pass after fixes.

Use `references/full-reference.md` for multi-persona details, report format, and persistence conventions.

## Then consider

- `review-to-green` when the audit maps to an active PR review.
- `harden` when findings involve security boundaries.
- `converge` when fixes must drive CI green.
