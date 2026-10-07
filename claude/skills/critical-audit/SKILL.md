---
name: critical-audit
description: Review or polish code, docs, APIs, SDKs, or products for defects, quality gaps, and unsupported claims, with ranked fixes.
---

# Critical Audit

Review the requested artifact for concrete defects and quality gaps, and rank findings by impact and likelihood.
An audit request authorizes investigation; make fixes only when the task also calls for them.
A request to polish or improve implemented work includes fixing the confirmed gaps within scope; leave sound work unchanged.

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

## Polish against explicit criteria

When the task is to polish or judge implemented work, assess correctness, design, robustness, tests, and public interfaces where they apply.
State what each criterion means for this artifact before judging it, then inspect or run the check that can expose its failure.
For docs, skills, or unfamiliar artifact types, read [quality checks](references/quality-checks.md) when selecting suitable evidence.
Fix actionable gaps within scope, repeat the affected checks and required repository validation, and finish when the applicable criteria pass or a specific requirement remains unresolved.

A failing test or missing requested behavior is work to resolve within scope, not a reason to end an authorized implementation task.
An introduced regression takes priority over further polish.
Avoid changes that only restate code, rename working concepts, or impose a preferred architecture without a demonstrated benefit.
Use `PASS`, `FAIL`, `UNCHECKED`, or `N/A` for each criterion; a pass needs a cited check and its result, and a not-applicable criterion needs its reason.

## Review documents

For technical documents, establish the reader's task from the documents in scope and nearby navigation or metadata.
For public writing, read the relevant repository `docs/anti-patterns/` guidance before editing.
Verify claims against current source, configuration, public APIs, deployment state, or cited material.
Distinguish implemented behavior, hosted operations, protocol guarantees, plans, and opinions.
Remove unsupported claims, generic filler, and procedural copy that does not help the reader act.
Keep qualifiers that express a real limitation, and preserve technical repetition and passive voice when they improve clarity.
Follow current product documentation for exact product names and responsibilities; a generic skill cannot own that inventory.

For a broad document set, use [the scanner](scripts/scan-docs-slop.mjs) to find candidate passages:

```bash
node <skill-directory>/scripts/scan-docs-slop.mjs --json <file-or-directory>...
```

Check `scannedFiles`, `findingCount`, and `emittedCount` before relying on its output.
The scanner skips some directories and file types, limits emitted findings, and does not establish factual correctness.
Read [document patterns](references/docs-patterns.md) when triaging recurring wording or product-boundary findings.
Separate the material scanned from the material actually reviewed, and run the repository's documentation and link checks after editing.

## Findings and re-audit

For each finding, include severity, file:line, triggering scenario, evidence, user impact, a proposed fix, and the check that would prove it.
Use the repository's severity definitions when present.
Otherwise reserve CRITICAL/HIGH for defects that block release, MEDIUM for material nonblocking defects, and LOW for limited impact.
Report the scope, checks, uninspected material, and uncertainty with the verdict.
Quantify impact when evidence permits; identify estimates and unknowns instead of inventing costs or scores.
A quality verdict does not authorize a release.

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
| Confirmed blockers or failing CI remain on a PR whose fixes are in scope | `/converge` | the PR, findings, failing checks, and verification |
| A security finding needs adversarial validation | `/harden` | the affected boundary and triggering scenario |
| A shared design problem needs a broader authorized change | `/pursue` | the affected callers and behavior to preserve |
| Obsolete code and documentation share a removable capability | `/simplify` | the consumer evidence and affected paths |
| The criteria pass and an authorized release remains | `/ship` | the verified revision, target, and checks |
