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
