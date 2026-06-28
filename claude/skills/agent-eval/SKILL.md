---
name: agent-eval
description: Extend @tangle-network/agent-eval internals: campaigns, scorecards, trace capture, backend integrity, held-out gates, analysts, auto-PR loops, RL bridge, and eval release checks.
---

# agent-eval

Use this only when changing or extending `@tangle-network/agent-eval` internals.
If the task is product-side adoption, use the relevant adoption skill instead.

## Load Order

1. Read the current package source before trusting remembered API names.
2. Read `references/full-reference.md` only when you need the full primitive table or historical bug-class catalog.
3. Confirm exports from the package barrel and target subpath before writing imports.
4. Prefer existing primitives over new local wrappers.

## Hard Rules

- Backend integrity comes first: run or preserve `assertRealBackend` / equivalent checks before interpreting results.
- Capture integrity is wired by construction: every run needs spans, raw-provider capture, outcome, and end-of-run completeness checks.
- Pin model snapshots; do not record bare aliases as eval evidence.
- Keep `AgentProfile` canonical; do not invent local profile shapes.
- Scorecard comparisons need variance; flat identical samples can hide broken statistical branches.
- `HeldOutGate` depends on correct split tags; mistagging invalidates the verdict.
- Hook failures that matter to a release check must fail loudly in tests and CI.
- Do not add silent fallbacks, stub backends, parallel scorecard formats, or duplicate eval runners.

## Canonical Moves

- New eval matrix: use `runEvalCampaign` plus scorecard recording and integrity checks.
- Release check: compare latest vs prior scorecard cells, then run held-out promotion logic.
- Analyst extension: register a new analyst kind through the existing analyst registry.
- Auto-improvement loop: compose cluster/evolve/gate/PR primitives instead of hand-rolling a loop.
- Trace replay: use the raw-provider sink and replay cache; do not re-call live models to debug old runs.

## Output

Report the source files read, exact exported primitives used, integrity checks preserved, and tests run.
If a result depends on trace or scorecard data, include the artifact path and row count.

## Then consider

- `eval-agent` when building a judge component rather than editing the eval package.
- `harden` when the change touches trust boundaries, credential capture, or release checks.
