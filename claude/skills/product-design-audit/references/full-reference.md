---
name: product-design-audit
description: Use when auditing or redesigning product UI, marketing pages, dashboards, app shells, workflow products, fake product components, proof theater, visual slop, IA, copy hierarchy, route quality, interaction states, or senior/staff-level product design with alternatives, implementation, screenshots, and deployment proof.
---

# Product Design Audit

Use this skill to turn a broad UI quality complaint into a systematic redesign loop. The output is not a vibes report. Inventory the product, evaluate every surface against the target user and domain, compare alternatives, implement the best changes, verify the rendered app, and leave a trace that another agent can resume.

This skill should feel uncomfortable when the product is genuinely rough. It is allowed to delete, consolidate, rename, re-route, resize, and recompose surfaces when the evidence says the current design is wrong. Do not stop after a cosmetic pass if the trace still contains unresolved user complaints.

The skill is product-general. Do not assume the app is trading, crypto, AI, SaaS, consumer, internal ops, or marketing until the repository, screenshots, traces, live product, or user brief proves it. Infer the product context first, write it down, then audit the UI against that context.

Marketing pages and product pages share the same truth contract. A landing page may compress, sequence, or dramatize the product, but it must not invent product-like UI that users cannot open, click, inspect, or understand as conceptual.

For a serious multi-page audit, read `references/audit-matrix.md` before writing the audit record.

## Aggression Level

Default to **8/10** for ordinary UI review. Escalate to **10/10** when the user says any version of:

- every page, every component, every subcomponent
- professional, senior, staff, production-grade, not toy
- keep iterating, continue, still rough, evaluate alternatives
- live/deploy/prove it
- repeated concrete critique across multiple turns

At 10/10, the work is not complete until:

- A `PRODUCT_BRIEF.md` exists or has been updated from actual evidence.
- Every route and major state has an inventory entry.
- Every visible component has a purpose, data contract, action, redundancy check, and risk note.
- Every major page/component decision compares at least 3 alternatives, with a named winner and rejected options.
- Every user complaint is either fixed, proven already fixed, or carried forward as an explicit unresolved risk.
- Browser screenshots or smoke artifacts cover the core pages, light/dark themes where relevant, and the breakpoints named by the product.
- Typecheck, tests, build, and rendered UI verification pass.
- If the user asked to ship, the deployed production URL is verified against the exact commit, not inferred from a push.

## Workflow

1. **Recover context.** Read recent trace files, `.evolve/` records, screenshots, open tasks, git diffs, prior commits, and existing design docs. Identify prior decisions, failures, and proof gaps before changing code.
2. **Build the complaint ledger.** Extract every concrete user complaint and every prior unresolved risk. Turn them into checkable items with owner route/component, expected proof, status, and whether they are product, visual, data, interaction, theme, or deployment failures.
3. **Write the product brief.** Create or update `PRODUCT_BRIEF.md` at the product/repo root unless the repo already has an equivalent canonical brief. Keep it concise and evidence-backed. It must answer: what product is this, who uses it, what job it performs, what the primary workflows are, what data matters, what actions matter, what trust/risk/accessibility constraints exist, what design posture fits, and what non-goals should be avoided.
4. **Orient to the user.** Use the product brief to define the primary persona, job-to-be-done, domain conventions, and what data must be visible first. For current products, competitors, APIs, or standards, verify with current primary sources.
5. **Audit product reality before marketing polish.** If a marketing page claims or visualizes a workflow, inspect the real app route, real component, real screenshot, real recorded flow, API response, or product state first. If the product route is weak, fix or show the route honestly; do not hide the gap behind a prettier invented component.
6. **Inventory everything.** Enumerate every route/page, major component, subcomponent, state, breakpoint, theme, hover/focus/active state, empty/error/loading state, modal/dropdown, and table/chart/data surface affected by the product.
7. **Score purpose and hierarchy.** For each item, answer: what user decision does it support, what data does it need, what action follows, what can be removed, what is duplicated, and what fails under real data.
8. **Run the product-truth gate.** For every product-like panel, ask: does this exact surface exist, is it a real screenshot, is it a faithful component backed by real data, or is it clearly labeled as a conceptual diagram? Anything else is fake proof and must be deleted or replaced.
9. **Generate alternatives.** For every meaningful page or component decision, compare at least 3 options. Score each 1-10 against the product brief, target user, information density, clarity, implementation risk, and long-term system fit. Pick one explicitly.
10. **Implement, not only audit.** Unless the user asked for a report only, fix the highest-impact issues immediately. Prefer existing primitives and route patterns. Consolidate duplicates. Do not create decorative complexity.
11. **Run iterative passes.** After the first implementation pass, re-open screenshots and the complaint ledger. Run at least one adversarial second pass. For 10/10 mode, keep iterating until new findings are minor, duplicate, or blocked by a real external constraint.
12. **Verify final artifacts.** Run typecheck/tests/build plus browser screenshots or the repo's existing smoke harness. Check desktop and mobile where relevant, light/dark themes, hover/focus, overflow, table corners, dropdown placement, and real data density.
13. **Ship proof when asked.** If the user asked for deployment, push the intended commit, monitor the deploy workflow to completion, verify the live URL, and run production smoke or HTTP checks against the deployed app.
14. **Record the trace.** Update or create a dated audit record under `.evolve/` with inventory, product brief link, complaint ledger, alternatives, decisions, shipped changes, verification, screenshots, deployment proof, unresolved risks, and next highest-value pass.

## Audit Rules

- Treat every visible element as guilty until it proves a purpose.
- Every page needs one obvious primary job. Secondary surfaces must support it, not compete with it.
- Dense product apps should be compact, scannable, and operational. Avoid landing-page composition, nested cards, oversized labels, and repeated explanations.
- Product-like marketing components must be true to the product. Use real screenshots, real route components, real recorded flows, real data-backed recreations, or clearly conceptual diagrams. Delete glossy dashboards, consoles, timelines, trace viewers, annotation panels, and workflow cards that do not exist in the app.
- Artifact chips such as "file + line", "sandbox trace", "GitHub annotations", "proof attached", and similar labels are not proof by themselves. Keep them only when they are controls, filters, table columns, report fields, or visible states in the real product.
- Small labels that restate nearby titles, routes, cards, modes, or icons are fake density. Remove them unless they disambiguate risk, state, provenance, units, permissions, or destructive action.
- "It is illustrative", "competitors do this", "we will build it later", and "it makes the page feel richer" are not valid reasons to ship a fake product surface.
- Data surfaces must show the right data at the right level: headline metrics, current state, risk, recency, provenance, and the next inspectable detail.
- Navigation must be route-native and predictable. Do not duplicate sidebars, horizontal navs, tabs, and breadcrumbs unless each layer has a distinct job.
- Themes are first-class. Audit light and dark together, including hover/active/focus, disabled states, dropdowns, modals, charts, and table headers.
- Tables and charts are professional instruments, not decorative cards. Prevent overflow, clipped text, accidental rounded frames, hidden columns, and misleading marker placement.
- Components may be draggable/resizable only through a coherent persisted layout model. Do not bolt on local drag behavior that breaks keyboard use, routing, or layout recovery.
- Empty states must be truthful and domain-native. Never fake data or add onboarding copy that obscures the product surface.
- Repeated labels are suspect. Labels survive only when they disambiguate risk, state, action, provenance, or units.
- Sparse data is not permission to add filler. Use the space for inspection, context, actions, or honest empty state.
- If the UI shows consequential data, reconcile it against the strongest available source of truth. Consequential data includes money, identity, health, legal/compliance, permissions, analytics, workflow state, automation traces, inventory, operations, safety, and any product-specific record users act on.
- A screenshot is evidence only after it has been visually inspected. A passing smoke script without screenshot review is incomplete for design work.
- Verification must inspect the rendered UI, not just source code or unit tests.

## Product Brief

Create or update `PRODUCT_BRIEF.md` before making broad design changes. If the repo has a more specific canonical product brief, use that path and link it from the audit trace.

Use this structure:

```markdown
# Product Brief

Product:
Status:
Primary users:
Core jobs:
Primary workflows:
Critical data:
Primary actions:
Trust, risk, and compliance:
Design posture:
Non-goals:
Evidence:
Open questions:
```

Keep the brief short enough to be read before every design decision. It is not a marketing doc. It is the source of truth for why each page and component exists.

## Trace Format

Use this structure in `.evolve/<product>-design-audit-YYYY-MM-DD.md`:

```markdown
# Product Design Audit

Status:
Product:
Primary users:
Reference surfaces:
Product brief:

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
Target score:
Findings:
Complaint ledger:
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
- Data truth:
- Production/deploy:

## Verification
- Commands:
- Browser checks:
- Screenshots:
- Deployment:
- Live proof:

## Next Pass
```

Keep the record terse but complete enough for another agent to continue without rediscovering the whole product.

## Stop Conditions

Do not call the audit complete just because the latest pass is better. Stop only when one of these is true:

- All complaint-led checklist items are fixed or explicitly carried as unresolved risk.
- All high-impact routes score at least 8/10, and the primary route(s) score at least 9/10.
- Remaining defects are blocked by missing backend data, unavailable credentials, or a product decision that must be made by the user.
- The deployed product has been verified if shipping was part of the request.

If a pass improves the product but exposes a deeper information-architecture or data-contract problem, name that problem and start the permanent fix when it is within the current repo.

## Implementation Bias

Prefer the repo's existing app shell, design tokens, primitives, test harness, and smoke harness. Add an abstraction only when it removes real duplication or makes future audits easier. If a component is bad because its data contract is wrong, fix the data contract rather than polishing fake presentation.
