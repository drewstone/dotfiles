# Copywriting Anti-Patterns

This file governs marketing copy, UI copy, page copy, launch copy, and general public-facing writing.

## Banned Defaults

Do not use:

- eyebrow/kicker labels above headings as default structure
- "Infrastructure for AI Agents" as a tiny label
- "The platform loop"
- "What Tangle builds"
- "Open source substrate"
- "Proof over positioning"
- "Research" or "Writing" above a page title
- "The trace is the product boundary" unless the page is explicitly about that thesis and argues it with evidence
- "Use the pieces directly"
- "Start with one agent run"
- "Three anchor pieces"
- "Follow the argument by system layer"

Do not use small labels to make text feel designed. Labels are for data, controls, navigation, provenance, status, units, or accessibility. They are not decoration.

## Generic AI Marketing Copy

Delete copy that says:

- "better, faster, safer" unless each claim is measured
- "powerful platform"
- "seamless experience"
- "robust infrastructure"
- "unlock potential"
- "designed for modern teams"
- "built for scale" without a number, constraint, or failure mode
- "end-to-end" without naming the boundary
- "AI-native" unless the distinction matters technically

Replacement pattern:

- Name the concrete object.
- Name the failure it prevents.
- Name the evidence the reader can inspect.

Bad:

> A robust platform for building better AI agents.

Better:

> Run the agent in a sandbox. Keep the files, model calls, browser state, and eval result attached to the same trace.

## Headings

Bad headings:

- labels pretending to be headings
- vague value claims
- "not just X, but Y"
- "How it works"
- "Everything you need to..."
- "Built for..."

Good headings:

- name the product boundary
- name the failure mode
- state the argument
- say the thing without needing an eyebrow

Heading test:

If the heading cannot stand alone without a label above it, it is not done.

## UI Copy

Avoid:

- labels that repeat the component
- button text that repeats nearby headings
- "click here"
- "learn more" when the target can be named
- over-instruction
- explaining controls that are already obvious

Use:

- action verbs for actions
- nouns for navigation
- states for state
- values for metrics
- units for numbers

## CTA Anti-Patterns

Do not add CTAs because a page feels like it needs a close.

CTA survives only if:

- it is the natural next action for this audience
- it points to a real surface
- it does not duplicate a nav link
- it is not compensating for weak body content

Bad:

> Ready to build the future?

Better:

> Open docs

Best:

No CTA, if the page is research or reference.
