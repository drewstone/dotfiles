---
name: agent-eval
description: Maintain agent-eval cases, judges, run records, traces, campaigns, comparisons, and releases.
---

# Agent Eval

Use this only when changing `@tangle-network/agent-eval` itself.
Product integrations belong in the adoption flow.
Current source, types, exports, and package docs define the API.

## Procedure

1. Read the package README, concepts doc, target subpath barrel, and implementation.
2. Search for an existing primitive, adapter, and regression test before adding one.
3. Keep cases, scores, run records, comparisons, statistics, and trace analysis in eval.
4. Keep execution, worker control, and product storage transactions out of eval.
5. Add focused behavior and error tests, then public-import tests for exported changes.
6. Update the nearest user document and changelog when consumers must act.

## Integrity Rules

- Missing backend use, output, trace evidence, usage, or identity fails loudly.
- Record pinned model versions, complete errors, cost, and latency.
- Preserve unknown provider fields and redact secrets at ingestion.
- Use code for objective facts and model judges only for semantic facts.
- Deterministic failures cannot be overridden by a model score.
- Keep service and measurement failures distinct from agent failure.
- Pair baseline and candidate on equivalent cases and conditions.
- Compare authored text against a length-matched neutralized control.
- Reject a lift that survives removal of the candidate's content.
- Test the delivery carrier; an unread file is not equivalent to a tool description.
- Keep candidate-generation cases separate from final decision cases.
- Search returns detached candidates; it does not mutate live product state.
- Do not add silent fallbacks, duplicate run formats, or product-specific policy.

## Output

Report source files read, exact public exports changed, integrity rules preserved, tests run, and artifact paths for any measured result.
Run package typecheck, build, package verification, and the full suite for shared contracts, statistics, capture, or public exports.

## Log the run

On completion, append one line so later analysis can grade this skill:

```bash
skill-run-log /agent-eval --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Diff touches redaction, credentials, wire input, or release authority (binary: those files appear in `git diff --name-only`) | `/harden` | the changed file list + the trust boundary each one crosses |
| 0 existing cases cover the changed production path | `/eval-engineering` | the production trace or code path to convert into one pinned case |
| Judge agreement with human labels < 0.9 over ≥20 labeled examples | `/eval-agent` | the labeled set + the current disagreement rows |
| A deployed result looks contaminated (pass rate moved > 20pp with no agent change) | `/eval-harness-diagnose` | the run record IDs on both sides of the jump |
| Package builds and ≥1 case runs green | `/verify` | the case IDs run + the exact command and its output |
