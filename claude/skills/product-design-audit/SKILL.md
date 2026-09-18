---
name: product-design-audit
description: Audit and fix product UI workflows, information structure, states, responsiveness, and polish.
---

# Product Design Audit

Turn observed UI problems into concrete improvements within the requested scope.
For a report-only request, deliver findings without changing the product.

## Audit and improve

1. Read existing product decisions and unresolved user complaints before changing a surface.
2. Establish the user, task, domain expectations, and primary workflow from the product and current evidence.
   Reuse an existing brief; create a durable record only when the work needs one.
3. Inspect the live or runnable product in a browser at relevant sizes, states, and supported themes.
   Trace consequential displayed values to their data source.
4. Compare the workflow with the existing design system and relevant real product references.
   Evaluate purpose, navigation, hierarchy, density, controls, data, accessibility, and failure handling.
5. Remove redundant or misleading surfaces and implement the highest-impact justified corrections when edits are in scope.
   Compare alternatives where a real design tradeoff remains; do not manufacture alternatives for obvious fixes.
6. Reopen the original failing paths, inspect screenshots, and run the repository's applicable checks.
   Mark a complaint fixed only when the evidence shows the intended result.

For audits spanning routes or interacting states, read [the audit matrix](references/audit-matrix.md) to track coverage and complaints.
For public pages or marketing copy, read the relevant repository `docs/anti-patterns/` guidance before editing.

## Evidence and completion

Verify real interactions and rendered states, not just source or build output.
Keep controls and labels that help users act, understand risk, or navigate accessibly.
Marketing product views must be real, faithful representations or clearly conceptual diagrams.
Sparse data does not justify fabricated activity or readiness.

Report the observed problems, decisions, changed files, before/after screenshots or browser artifacts, checks, and remaining issues.
Complete the requested improvements; a numerical design score is not a completion criterion.
If deployment is part of the request, also verify the served revision and live user path.

## Log the run

```bash
skill-run-log /product-design-audit --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Changed workflows need additional adversarial browser testing | `/ui-test` | the routes, states, and observed risks |
| Evidence questions the product value rather than UI execution | `/product-innovation-audit` | the workflow and unresolved user value |
| The requested correction needs a new visual direction | `/product-design` | the design constraints and real references |
