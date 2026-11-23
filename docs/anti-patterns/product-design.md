# Product Design Anti-Patterns

This file keeps scoped rejection examples and review methods for visible UI, product demos, dashboards, landing-page graphics, and application surfaces.

## Label-Driven UI

Bad:

- badge rows
- cards with tiny category labels
- labels above every metric
- captions that restate icons
- process labels like `run`, `observe`, `improve`, `ship`

## Setup narration

Remove setup instructions once the feature works. A visible document needs no “File loaded successfully” banner or standing explanation of where its bytes are stored. Keep a receipt when the result is otherwise invisible, such as a request accepted for background processing.

When a prerequisite is missing, give the user one next action where the task stopped. For example, show “Choose the original file” in an empty preview that needs a local copy. Remove the prompt when the file opens.

Review every place the feature appears on first use, after reopening it, and when recovery is required. A fix in a shared component should remove the repeated copy from every working screen.

## Dashboard and Settings Drift

Use one shared page frame and heading component across sibling dashboard pages and settings tabs.
Keep their width, content inset, heading baseline, and type scale consistent.
Constrain a form or card inside that frame instead of centering each page independently.
Use the same frame for loading states, with an accessible status and a skeleton shaped like the coming content.

Remove decorative category eyebrows that repeat the tab or page title.
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

## Fake Diagrams

Bad diagrams:

- boxes connected by arrows with labels
- "loop" graphics with no real state
- traffic-light terminal rows
- ornamental trace tables
- SVG architecture art that cannot be mapped to a real system

## Visual Asset Anti-Patterns

Do not use:

- generic gradient blobs
- decorative orbs
- abstract SVGs for technical proof
- stock imagery for inspectable products
- fake browser chrome unless the browser state matters
- monochrome code blocks as the only visual language

## AI Product UI Anti-Patterns

Keep account, profile and provider setup in settings. If a user cannot send a message, show the missing requirement and one action that resolves it. Once sending works, remove the setup prompt from the composer. Check both states.

Do not:

- anthropomorphize the agent
- imply certainty when the model is uncertain
- hide provenance
- hide confidence, failure, or stop reason
- make generated output look like verified fact
- use "magic" as the primary explanation

## Wrapping and truncation

- a headline that wraps its last word onto its own line at 1280
- a pill, badge, tab or button label that wraps to a second row
- a table cell that wraps a date, an id, a size or a status
- code or a URL cut with an ellipsis in a marketing frame
- ten tabs in a row that fold into two rows

Check responsive text fit and reflow. Allow necessary wrapping and accessible scroll regions. Inspect orphaned words, clipped actions and unexplained truncation in the rendered page. Recompose at narrow widths before reducing type; reserve no-wrap for content that requires it and provide an accessible way to inspect overflow.

## Label and surface mismatch

- a card whose title promises one product and whose preview shows another surface
- a real component dropped into a marketing card because it exists, not because it shows the claim
- a caption under a preview that explains what the eye should have seen

When the claim and the surface disagree, do not keep either.
Write three other ways to show the claim (another real surface, a real capture, a narrower claim that the surface does prove), pick the one a buyer recognises, and cut the caption.

## Result and run pages

A page that reports what an automated run, job or experiment did.
Its reader has thirty seconds and has never seen the system.
The first screen answers six questions in plain words: what was asked; what happened, with the number, its unit, the baseline and the bar; how sure, and why; whether it is finished; what it cost; what to do next.

Bad:

- a status that contradicts the records: "Running" after the result passed its check, "waiting on" a step that ended days ago
- one chip carrying two answers, such as the verdict joined to the state of the logs
- a verdict that blames the result for an instrument failure: "did not pass" when the measurement could not run
- a verdict without its number, or a number without its unit, baseline and bar
- the brief printed as the finding: the question, hypothesis or success definition the run was given, shown as if it were what happened
- internal vocabulary on the first screen: names of comparators, stages, contracts, nodes, seats, versions, traces
- counts that read as verdicts: "0 findings" on a run that produced a working change
- the result described but never drawn: the object, the diff, the timing against its baseline
- a next action set in bold text instead of a link or button
- an alarm without its cause, its cost and the action that clears it
- a masthead centred in an empty viewport, or a second column that is mostly blank
- one name for several agents or versions
- copy that narrates the system or hedges: "the system's own test checked this apart from the team"

Removal test: each visible element names the reader question it answers.
Remove an element that answers none; treat an element whose answer contradicts the records as a defect, not a style choice.

Why these pages regress:

- They are proven by tests of strings and by code review, and nobody looks at the rendered page.
- No record holds the result's number, baseline, bar and object, so the page fills its slots with the run's brief.
- Status is computed in several places from partial state, so the places disagree.
- Redesigns stop at a storyboard, and the build that follows ships a slice.
- The build ends unserved: when the brief does not line up the deploy path and the served-page capture before the build starts, the merged work waits and the served page never changes.
- The builder cannot see the page before merge: the viewer builds only on a gate host, so nobody renders it on the real worst-case runs until it is served; the brief names how the builder will see the rendered page, or the served page is the first render and the fix-forward is planned.

Fix the cause, not the page: one function computes every status from the records, settlement writes the result as data, and the [result page gate](review-gates.md#result-page-gate) runs on the rendered page before merge and after deploy.
