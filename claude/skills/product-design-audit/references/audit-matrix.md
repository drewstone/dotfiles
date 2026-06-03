# Product Design Audit Matrix

Use this matrix to force a complete pass. Do not paste it wholesale into user replies; use it as the working checklist and trace substrate.

## Page Inventory Fields

For every route/page:

- URL/route
- Page job
- Primary persona and decision
- Product brief alignment
- Primary data
- Secondary data
- Primary action
- Navigation entry points
- Exit paths
- Loading state
- Empty state
- Error/locked state
- Mobile behavior
- Light/dark behavior
- Screenshots checked
- Score before/after
- User complaints mapped
- Unresolved risks
- Ship/live proof if production-facing

## Component Inventory Fields

For every component/subcomponent:

- Name and file
- Owner page(s)
- User purpose
- Data shown
- Action enabled
- State variants
- Redundant with
- Can remove?
- Can merge?
- Can compact?
- Needs larger typography?
- Needs more data?
- Overflow risk
- Theme risk
- Accessibility risk
- Verification method
- Screenshot or DOM proof
- Delete/merge/keep decision
- Score before/after

## Alternative Scoring

Score each option 1-10:

- Product brief fit: Does this match the product's stated job, users, workflows, posture, and non-goals?
- User fit: Does this match the user's actual workflow?
- Information hierarchy: Is the right data obvious first?
- Density: Is it compact without becoming illegible?
- Interaction clarity: Does the user know what can be clicked, expanded, dragged, copied, or edited?
- System fit: Does it align with existing navigation, tokens, routes, and primitives?
- Robustness: Does it handle long text, missing data, errors, loading, and mobile?
- Implementation risk: Can it land without destabilizing the product?

Winner selection rule:

- Pick the highest product score, not the easiest patch.
- If two options tie, choose the one that removes duplication and improves future system consistency.
- If the best option requires a real infrastructure change, start it; do not replace it with a deceptive local workaround.

## Complaint Ledger Fields

For every concrete user complaint or prior unresolved risk:

- Source: user turn, screenshot, trace section, test failure, live smoke, or audit finding
- Surface: route/page/component/subcomponent
- Failure type: product hierarchy, visual craft, density, theme, interaction, data truth, accessibility, responsiveness, deployment
- Current evidence
- Expected proof
- Fix decision: fix now, prove already fixed, defer with reason, or blocked
- Verification command or screenshot
- Status: open, fixed, verified, unresolved

Do not collapse multiple complaints into a vague bucket. "Light theme is wrong" is a category; "Top agent hover has dark text on dark hover in light mode" is a checkable item.

## Product Brief Fields

Before judging the UI, create or update `PRODUCT_BRIEF.md` and answer:

- Product: What is this product, in one concrete sentence?
- Status: Prototype, internal tool, beta, production, marketing site, admin console, workflow app, marketplace, game, etc.
- Primary users: Who uses it, what expertise do they have, and what do they already understand?
- Core jobs: What must the product help them decide or do?
- Primary workflows: What are the 3-7 workflows the UI must make obvious?
- Critical data: What records, metrics, objects, statuses, or media are users acting on?
- Primary actions: What commands, submissions, edits, approvals, navigation, or inspections matter?
- Trust/risk/compliance: What must be accurate, auditable, accessible, permissioned, reversible, or safe?
- Design posture: Dense operations tool, creative editor, consumer app, marketplace, executive dashboard, technical docs, marketing page, game, etc.
- Non-goals: What patterns would be tempting but wrong for this product?
- Evidence: Which files, screenshots, routes, APIs, docs, or user statements support the brief?
- Open questions: What cannot be inferred yet?

## Domain Heuristics

Derive product-specific heuristics from `PRODUCT_BRIEF.md`. Examples:

- Operations tools: prioritize current state, owner, risk, next action, history, and exception handling over explanatory copy.
- Creative tools: prioritize canvas/output, fast iteration controls, asset provenance, undo/redo, and export confidence.
- Marketplaces: prioritize item identity, comparison, trust, pricing, availability, reviews, and checkout path.
- Developer tools: prioritize setup state, API keys, logs, errors, docs adjacency, copyable commands, and integration proof.
- Admin/compliance tools: prioritize audit trail, permissions, validation state, irreversible actions, and exact record identity.
- Trading/financial tools: prioritize balances, risk, exposure, orders/executions, provenance, venue/account identity, and reconciliation.

Use examples only after the product brief proves the category. Do not impose a category because it appears in this matrix.

## Visual Verification Checklist

Check at least:

- Home/dashboard
- Main list/explorer page
- Detail/workspace default
- Chart-heavy page
- Table/ledger page
- Chat/trace/run page
- Operations/admin page
- Create/deploy form flow
- Modals/dropdowns
- Sidebar collapsed/expanded
- Light theme
- Dark theme
- Hover/focus/active
- Empty/loading/error/locked
- 375px mobile
- 768px tablet if supported
- 1280px and 1440px desktop

For 10/10 mode, also produce or inspect a contact sheet or screenshot set that includes the routes named in the complaint ledger. Check the screenshot pixels, not only the test exit code.

Flag immediately:

- Body scroll on core desktop workspaces
- Horizontal scroll inside traces/cards
- Text overlap or clipping
- Dark text on dark hover or light text on light hover
- Rounded table frames when the design system expects square data surfaces
- Dropdowns opening offscreen
- Duplicated nav/sidebar/tab systems
- Labels that do not help the user decide or act
- Cards inside cards
- Components whose visible data does not match the user workflow

## Hard Gates

The pass is not complete while any of these are true:

- A primary route has no screenshot proof.
- A component was changed but no hover/focus/theme state was inspected when relevant.
- A table/chart/data surface shows values that cannot be reconciled to the available data source.
- A user complaint is marked fixed without a command, screenshot, or source-code proof.
- A deploy was requested but only the push succeeded. Production must be checked after the deploy workflow finishes.
- A route still has duplicated navigation systems unless the trace explains each layer's distinct job.
- The audit makes domain-specific claims that are not grounded in `PRODUCT_BRIEF.md` evidence.
