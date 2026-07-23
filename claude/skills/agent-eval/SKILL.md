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
- Keep candidate-generation cases separate from final decision cases.
- Search returns detached candidates; it does not mutate live product state.
- Do not add silent fallbacks, duplicate run formats, or product-specific policy.

## Output

Report source files read, exact public exports changed, integrity rules preserved, tests run, and artifact paths for any measured result.
Run package typecheck, build, package verification, and the full suite for shared contracts, statistics, capture, or public exports.

## Then consider

- `eval-engineering` when the change needs a new production-derived case.
- `eval-agent` when adding or calibrating a model judge.
- `harden` when changing redaction, credentials, wire input, or release authority.
- `verify` before publishing.
