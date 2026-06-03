---
name: product-design-audit
description: Rigorous product UI redesign and design-system audit for apps, dashboards, trading terminals, DeFi dapps, AI tools, and complex web products. Use when the user asks to systematically evaluate every page, component, subcomponent, redesign, layout, theme, interaction state, data hierarchy, or asks for a senior/staff-level product design pass with alternatives, critique, implementation, browser verification, and traceable decisions.
---

# Product Design Audit

Use this skill to turn a broad UI quality complaint into a systematic redesign loop. The output is not a vibes report. Inventory the product, evaluate every surface against the target user and domain, compare alternatives, implement the best changes, verify the rendered app, and leave a trace that another agent can resume.

For a serious multi-page audit, read `references/audit-matrix.md` before writing the audit record.

## Workflow

1. **Recover context.** Read recent trace files, `.evolve/` records, screenshots, open tasks, git diffs, and existing design docs. Identify prior decisions, failures, and proof gaps before changing code.
2. **Orient to the user.** Define the primary persona, job-to-be-done, domain conventions, and what data must be visible first. For current products, competitors, APIs, or standards, verify with current primary sources.
3. **Inventory everything.** Enumerate every route/page, major component, subcomponent, state, breakpoint, theme, hover/focus/active state, empty/error/loading state, modal/dropdown, and table/chart/data surface affected by the product.
4. **Score purpose and hierarchy.** For each item, answer: what user decision does it support, what data does it need, what action follows, what can be removed, what is duplicated, and what fails under real data.
5. **Generate alternatives.** For every meaningful page or component decision, compare at least 3 options. Score each 1-10 against the domain user, information density, clarity, implementation risk, and long-term system fit. Pick one explicitly.
6. **Implement, not only audit.** Unless the user asked for a report only, fix the highest-impact issues immediately. Prefer existing primitives and route patterns. Consolidate duplicates. Do not create decorative complexity.
7. **Verify final artifacts.** Run typecheck/tests/build plus browser screenshots or the repo's existing smoke harness. Check desktop and mobile where relevant, light/dark themes, hover/focus, overflow, table corners, dropdown placement, and real data density.
8. **Record the trace.** Update or create a dated audit record under `.evolve/` with inventory, alternatives, decisions, shipped changes, verification, screenshots, unresolved risks, and next highest-value pass.

## Audit Rules

- Treat every visible element as guilty until it proves a purpose.
- Every page needs one obvious primary job. Secondary surfaces must support it, not compete with it.
- Dense product apps should be compact, scannable, and operational. Avoid landing-page composition, nested cards, oversized labels, and repeated explanations.
- Data surfaces must show the right data at the right level: headline metrics, current state, risk, recency, provenance, and the next inspectable detail.
- Navigation must be route-native and predictable. Do not duplicate sidebars, horizontal navs, tabs, and breadcrumbs unless each layer has a distinct job.
- Themes are first-class. Audit light and dark together, including hover/active/focus, disabled states, dropdowns, modals, charts, and table headers.
- Tables and charts are professional instruments, not decorative cards. Prevent overflow, clipped text, accidental rounded frames, hidden columns, and misleading marker placement.
- Components may be draggable/resizable only through a coherent persisted layout model. Do not bolt on local drag behavior that breaks keyboard use, routing, or layout recovery.
- Empty states must be truthful and domain-native. Never fake data or add onboarding copy that obscures the product surface.
- Verification must inspect the rendered UI, not just source code or unit tests.

## Trace Format

Use this structure in `.evolve/<product>-design-audit-YYYY-MM-DD.md`:

```markdown
# Product Design Audit

Status:
Product:
Primary users:
Reference surfaces:

## Inventory
- Route/page:
- Components:
- States:
- Data dependencies:
- Known complaints:

## Page Evaluations
### <Page>
Purpose:
Primary user decision:
Current score:
Findings:
Alternatives:
Decision:
Changes shipped:
Verification:
Remaining risk:

## Cross-Cutting System Findings
- Navigation:
- Theme:
- Tables/charts:
- Density:
- Copy/labels:
- Interactions:
- Responsiveness:

## Verification
- Commands:
- Browser checks:
- Screenshots:
- Deployment:

## Next Pass
```

Keep the record terse but complete enough for another agent to continue without rediscovering the whole product.

## Implementation Bias

Prefer the repo's existing app shell, design tokens, primitives, test harness, and smoke harness. Add an abstraction only when it removes real duplication or makes future audits easier. If a component is bad because its data contract is wrong, fix the data contract rather than polishing fake presentation.
