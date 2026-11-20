---
name: critical-audit
description: Review a diff, branch, or PR against standards and spec, or audit and polish code, docs, APIs, or products for defects and unsupported claims, including whether an autonomous agent observes state, uses tools and follows promised behavior.
---

# Critical Audit

An excellent review finds the defect that would have reached a user, proves it from a concrete input to a wrong outcome, and names the fix that removes its whole class; it also says when sound work only matches what already existed.
An audit request authorizes investigation; fix only when the task also asks for it.
A request to polish or improve implemented work includes fixing every confirmed gap, in the code that owns it and across every caller it reaches ([AGENTS.md](../../AGENTS.md) rule 1).

## Review

1. Establish the target, revision and base; `--diff-only` reviews the complete diff against `--base` or the target branch (an empty diff is a checked no-change result), and `--scope` limits paths.
2. Read the affected code or documents, required behavior, tests and callers, and trace each suspected defect in correctness, security, failure handling or architecture from a concrete input to the wrong outcome.
3. Test each claim with source evidence or a focused reproduction and label it confirmed, supported inference or open hypothesis; an untested possibility never blocks, and a source-backed defect needs no production exploit.
4. Merge duplicates and rank by consequence, reachability and likelihood.

Add independent reviewers when separate expertise would find what one reader misses; for an SDK's customer-facing surface, read only the matching brief in `agents/personas/` ([indie Cloudflare](agents/personas/indie-cf.md), [enterprise](agents/personas/enterprise-platform.md), [batch research](agents/personas/researcher-batch.md), [coding agent](agents/personas/ai-coding-agent.md), [SDK surface](agents/personas/sdk-surface-designer.md)), selected by `--personas`.

## Review a change against standards and spec

For a branch, PR or work since a fixed point, report the repository's standards and the originating spec as two separate axes ([change review](references/change-review.md)).

## Polish against explicit criteria

State what each criterion (correctness, design, robustness, tests, public interface) means for this artifact and run the check that could expose its failure ([quality checks](references/quality-checks.md) for docs, skills and unfamiliar artifacts).
Fix the gaps, rerun the affected checks, and finish when the criteria pass or a named requirement stays open; a failing test is work to finish, and an introduced regression comes before further polish.
Skip changes that only rename working concepts or impose a preferred architecture without a demonstrated benefit.
Mark each criterion `PASS` (with its check and result), `FAIL`, `UNCHECKED` or `N/A` (with its reason).

## Review documents

For technical documents, public writing and skills, follow [document review](references/docs-patterns.md): the reader's task, each claim against current source, unsupported claims and filler removed, and the scanner for broad sets.

## Audit an autonomous agent

Treat labels, docs and the agent's own account as claims until execution records support them.
Collect prompts, traces, tool results and state changes under real run identities, check that the agent observed the state it needed, acted and checked the effect, and compare its decisions with the mandate, permissions and completion conditions; a learning claim needs feedback traced to a later changed decision.
Separate observed defects from missing evidence, and name the earliest decision that explains each.

## Findings and re-audit

Each finding carries severity, file:line, triggering scenario, evidence, user impact, the fix across its class, and the check that proves it; without repository definitions, CRITICAL and HIGH block release, MEDIUM is material and nonblocking, LOW is limited.
A quality verdict names what was not inspected and does not authorize a release.

Persist runs that need later review under `.agent/critical-audit/<timestamp>/` (`manifest.json`, `findings.jsonl`, `summary.md`); `--reaudit <path>`, or the latest run without one, rechecks every prior finding against the current revision as resolved, still present, moved or unverifiable.

## Log the run

```bash
skill-run-log /critical-audit --target "<scope> n=<F> files" --verdict <PASS|FAIL> --detail "<APPROVE|REQUEST_CHANGES>: <n> findings" [--pr <PR URL>] --next /<skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Confirmed blockers or failing CI remain on a PR the task may fix | `/converge` | the PR, findings, failing checks and verification |
| A security finding needs adversarial validation | `/harden` | the affected boundary and triggering scenario |
| Obsolete code and documentation share a removable capability | `/simplify` | the consumer evidence and affected paths |
| The work is sound but only matches what already existed, with no gain over the baseline or the best known result | `/be-ambitious` | the number to beat and the check that would show a gain |
| The criteria pass and an authorized release remains | `/ship` | the verified revision, target and checks |
