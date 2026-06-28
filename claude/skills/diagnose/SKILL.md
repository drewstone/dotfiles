---
name: diagnose
description: Analyze test, CI, benchmark, or eval failures; cluster by root cause; rank by impact and fix effort; produce concrete fix hypotheses.
---

# Diagnose

Use this when there are multiple failures and the next decision is what to fix first.
Do not patch before clustering; repeated symptoms often share one cause.

## Flow

1. Locate the raw failure data: logs, reports, CI artifacts, JSON, XML, or benchmark rows.
2. Parse all failures and preserve counts.
3. Cluster by root cause, not by file or test name alone.
4. Rank clusters by user impact, unblock value, confidence, and fix effort.
5. For each top cluster, name a testable hypothesis and the exact evidence that supports it.
6. Recommend the first fix and the check that should go green.

## Output

Return totals, clusters, representative errors, root-cause hypotheses, ranked fix order, and missing data.
Use `references/full-reference.md` for supported formats and parsing details.

## Then consider

- `converge` when the next step is fixing CI.
- `autopsy` when one result is suspicious rather than many failures.
