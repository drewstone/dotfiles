---
name: critical-audit
description: Review code, docs, APIs, SDKs, or products for correctness and risk, with ranked fixes.
---

# Critical Audit

Review the requested artifact for concrete defects and rank findings by impact and likelihood.
An audit request authorizes investigation; make fixes only when the task also calls for them.

## Review

1. Establish the requested scope, revision, and comparison base.
   For `--diff-only`, inspect the complete diff against `--base` or the repository's target branch.
   An empty diff is a checked no-change result.
   Honor `--scope` paths when supplied.
2. Read the affected code or documents, required behavior, tests, and relevant callers before judging a pattern.
3. Examine correctness, security, failure handling, architecture, and the repository's documented standards where they affect the task.
   Trace a suspected defect from a concrete input or state to the wrong outcome.
4. Use source evidence or a focused reproduction to test each claim.
   Distinguish confirmed defects, supported inferences, and unresolved hypotheses.
   Tests must exercise the behavior under review; select unit or integration coverage according to where the defect occurs.
5. Combine duplicate findings and rank by consequence, reachability, and likelihood.
   A source-backed defect can be confirmed without a production exploit.
   An untested possibility is not a blocking finding.

Choose independent reviewers only when separate expertise or user perspectives will improve coverage and delegation is available and authorized.
Reviewer count and execution order depend on the scope and available resources.

When reviewing an SDK's customer-facing surface, read only the applicable perspective briefs:

- [Cloudflare application developer](agents/personas/indie-cf.md) for Worker integration and reconnect behavior.
- [Enterprise platform engineer](agents/personas/enterprise-platform.md) for tenancy, billing retries, and audit records.
- [Batch research operator](agents/personas/researcher-batch.md) for durable jobs and recovery after a client crash.
- [Coding-agent integration](agents/personas/ai-coding-agent.md) for whether the documented entrypoints reveal existing capabilities.
- [SDK surface designer](agents/personas/sdk-surface-designer.md) for request, schema, server, and client compatibility.

`--personas` can select those perspectives; it does not require additional reviewers or make every listed capability a product requirement.

## Findings and re-audit

For each finding, include severity, file:line, triggering scenario, evidence, user impact, a proposed fix, and the check that would prove it.
Use the repository's severity definitions when present.
Otherwise reserve CRITICAL/HIGH for defects that block release, MEDIUM for material nonblocking defects, and LOW for limited impact.
Report the scope, checks, uninspected material, and uncertainty with the verdict.
Quantify impact when evidence permits; identify estimates and unknowns instead of inventing costs or scores.

Persist runs that need later review under `.agent/critical-audit/<timestamp>/`:
`manifest.json` records scope and revisions, `findings.jsonl` records findings and evidence, and `summary.md` records the verdict.
For `--reaudit <path>`, recheck every prior finding against the current revision.
Without a path, locate the latest applicable run.
Record resolved, still present, moved, or unverifiable findings with current evidence.

## Log the run

```bash
skill-run-log /critical-audit --target "<scope> n=<F> files" --verdict <APPROVE|REQUEST_CHANGES> --next /<skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Confirmed blockers remain on a PR whose fixes are in scope | `/review-to-green` | the PR, findings, and verification checks |
| A security finding needs adversarial validation | `/harden` | the affected boundary and triggering scenario |
| Pushed fixes have failing CI | `/converge` | the revision and failing checks |
| A shared design problem needs a broader authorized change | `/pursue` | the affected callers and behavior to preserve |
| Incorrect documentation claims need a focused review | `/docs-slop-audit` | the claims and contradictory sources |
