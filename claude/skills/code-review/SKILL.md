---
name: code-review
description: Compatibility alias for critical-audit when reviewing code or pull requests.
---

# Code Review — merged into /critical-audit

This skill was folded into **`/critical-audit`**. Its bug/structure/AI-slop review, the P1/P2/P3 finding-priority convention, and the mandatory APPROVE / REQUEST_CHANGES verdict gate now live there.

Use **`/critical-audit`** (with `--diff-only` to scope to the PR diff). Severity maps to the P-priorities you expect: CRITICAL/HIGH = P1, MEDIUM = P2, LOW = P3.
