# Product Design Audit Matrix

Use this matrix to force a complete pass. Do not paste it wholesale into user replies; use it as the working checklist and trace substrate.

## Page Inventory Fields

For every route/page:

- URL/route
- Page job
- Primary persona and decision
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

## Alternative Scoring

Score each option 1-10:

- User fit: Does this match the user's domain workflow?
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

## Product UI Heuristics

For trading, crypto, DeFi, and AI-operator tools:

- Show current state, risk, exposure, recent activity, provenance, and next action before explanatory copy.
- Prefer tables, ledgers, charts, tapes, inspectors, and command surfaces over marketing cards.
- Keep route and account context persistent but compact.
- Make addresses, IDs, transactions, vaults, runs, and references copyable when they matter.
- Show venue/asset identity with logos or recognizable marks when available.
- Preserve auditability: decisions, traces, fills, and validations must be inspectable.
- Do not hide critical state behind hover-only UI.
- Do not use fake success states, fake trades, or synthetic transcripts.

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
