# Product Design Anti-Patterns

This file covers visible UI, product demos, dashboards, landing-page graphics, and application surfaces.

## Label-Driven UI

Bad:

- badge rows
- cards with tiny category labels
- labels above every metric
- captions that restate icons
- process labels like `run`, `observe`, `improve`, `ship`

Good:

- visible state
- selected tabs
- real controls
- real data
- real screenshots
- direct manipulation

If the label is removed and the UI collapses, the design is not carrying meaning.

## Dashboard and Settings Drift

Use one shared page frame and heading component across sibling dashboard pages and settings tabs.
Keep their width, content inset, heading baseline, and type scale consistent.
Constrain a form or card inside that frame instead of centering each page independently.
Use the same frame for loading states, with an accessible status and a skeleton shaped like the coming content.

Remove decorative category eyebrows that repeat the tab or page title, such as “Private to this business” above “Secrets.”
Keep a privacy, permission, or status label where it explains a real choice or action.

## Controls That Blend Into the Canvas

Give selects and filter controls a distinct surface and subtle elevation; a border alone on the page's background color is insufficient.
Make selected tabs and view modes clearly different in fill and text contrast from both the canvas and inactive controls.
Check light and dark themes, keyboard focus, and a narrow viewport in the rendered app.

## Dashboard Filler

Keep content in compact, aligned surfaces. Size metric cards and empty states to their contents.
Show measured values with a clear scope; omit unavailable gauges and empty columns instead of repeating “Unknown.”
Keep one primary row action and put secondary actions in an accessible menu, with destructive confirmation intact.
Remove static security claims, decorative status banners, repeated explanations, and unsupported support links.
Populate catalogs from usable resources; preserve an honest, actionable empty or failure state when none exist.

## Card Grids

Cards are allowed for repeated content items, modals, and true collections. Cards are not a solution for unclear product strategy.

Do not use card grids for:

- company maps
- "how it works"
- product taxonomy
- internal repo lists
- values
- mission
- vision

Use instead:

- one dominant product artifact
- a diagram with real boundaries
- a table if comparison is the task
- a screenshot sequence
- a single narrative scroll section

## Fake Diagrams

Bad diagrams:

- boxes connected by arrows with labels
- "loop" graphics with no real state
- traffic-light terminal rows
- ornamental trace tables
- SVG architecture art that cannot be mapped to a real system

Good diagrams:

- show real inputs and outputs
- name boundaries
- include timestamps, states, costs, logs, eval results, or screenshots when relevant
- make one argument visually

## Visual Asset Anti-Patterns

Do not use:

- generic gradient blobs
- decorative orbs
- abstract SVGs for technical proof
- stock imagery for inspectable products
- fake browser chrome unless the browser state matters
- monochrome code blocks as the only visual language

Use:

- real product screenshots
- generated bitmap images when a concept needs atmosphere
- motion only when it clarifies sequence or state
- diagrams derived from actual traces or architecture

## AI Product UI Anti-Patterns

Do not:

- anthropomorphize the agent
- imply certainty when the model is uncertain
- hide provenance
- hide confidence, failure, or stop reason
- make generated output look like verified fact
- use "magic" as the primary explanation

AI UI should show:

- what the system used
- what it produced
- what it is uncertain about
- what the user can approve, reject, inspect, or retry

## Wrapping and truncation

- a headline that wraps its last word onto its own line at 1280
- a pill, badge, tab or button label that wraps to a second row
- a table cell that wraps a date, an id, a size or a status
- code or a URL cut with an ellipsis in a marketing frame
- ten tabs in a row that fold into two rows

Nothing on a marketing page wraps or truncates at 1280, 1100 or 400 px.
Fit the copy to the width or the width to the copy: shorten the line, widen the container, pin column widths, set `white-space: nowrap`, or move the control into a vertical list.
Check the rendered page at each width before reporting; a build or a test proves nothing here.

## Label and surface mismatch

- a card whose title promises one product and whose preview shows another surface
- a real component dropped into a marketing card because it exists, not because it shows the claim
- a caption under a preview that explains what the eye should have seen

When the claim and the surface disagree, do not keep either.
Write three other ways to show the claim (another real surface, a real capture, a narrower claim that the surface does prove), pick the one a buyer recognises, and cut the caption.
