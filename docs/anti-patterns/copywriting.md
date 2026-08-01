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

## No-AI-Slop Patterns

Adapted from [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop) (MIT).
These are the AI-writing tells to strip from every draft.
Two modes: **detect** (name the pattern, quote the offending line, suggest the fix — don't guess whether AI wrote it; "detectors guess, named patterns are evidence") and **edit** (make the *minimum effective edit*; leave strong human sentences alone).

### Patterns to cut (with the fix)

- **Binary contrast** — "It's not X, it's Y." State Y directly. ("The question isn't the model, it's the eval" → "The eval matters more than the model.")
- **Throat-clearing opener** — "Here's the thing," "Let me be clear." Cut it; state the point.
- **Faux-insight setup** — "What most people get wrong," "The part everyone misses." Drop the flattery, say the thing.
- **Colon reveal** — noun phrase + colon + dramatic lowercase reveal. Rewrite as a plain sentence; reserve colons for lists/labels.
- **Superficial analysis** — trailing "-ing" clauses ("highlighting the team's commitment"). Replace with the real consequence.
- **Importance puffery** — "marks a pivotal moment," "stands as a testament." State the fact.
- **Weasel attribution** — "experts agree," "studies show." Name the source or cut it.
- **Fake-strong verbs** — "serves as a centralized hub." Prefer "is"/"has" + a concrete list of what it does.
- **Synonym cycling** — rotating "the agent / the assistant / the tool." Repeat the right word.
- **Negative listing** — "Not X. Not Y. A Z." Just say Z.
- **Dramatic fragmentation** — "That's it. That's the whole thing." Use complete sentences.
- **Rhetorical setups, fake-profound kickers, summary-recap endings** — "What if I told you," a cute closing metaphor, "In conclusion." Drop them; end on the clearest concrete sentence.

### Words to cut

**Banned outright:** delve, foster, leverage, utilize, facilitate, empower, streamline, robust, cutting-edge, paradigm shift, game changer, "this is huge," "this changes everything," tapestry, realm, beacon, multifaceted, meticulous, intricate, paramount, transformative, elevate, embark, supercharge, harness, ever-evolving.

**Empty adverbs (cut when hollow):** just, literally, honestly, simply, actually, truly, fundamentally, importantly, crucially, inherently, inevitably.

**Empty phrases:** "it's worth noting," "it's important to note," "at the end of the day," "when it comes to," "at its core," "in today's world," "in the age of," "the reality is," "the truth is," "in terms of," "in order to," "going forward," "let's dive in."

### Fundamentals

Lead with the point when setup adds nothing.
Active voice; never let an object perform a human verb.
Untangle sentences without flattening cadence.
Concrete beats abstract: names, numbers, dates, mechanisms.
Strong verbs ("made a decision" → "decided"; "has the ability to" → "can").
Minimum effective edit — preserve the writer's real voice; invent nothing.
Em dashes: none in short copy; one or two in longer drafts only when they beat other punctuation.

### Repository debris is not reader content

Never put these in a public blog body:

- `git show`, `git log`, `git diff`, `sed`, `awk`, `curl`, `npm view`, or similar author-side commands
- shell pipelines that ask the reader to inspect our repository
- local paths such as `src/agent/profile-materialization.ts`
- bare commit IDs, branch names, worktree names, or internal issue numbers
- private-repository instructions or notes about how the author verified a claim

Use a named public source link instead.
Explain the fact the source supports in the sentence before the link.
The reader needs the conclusion and its evidence, not our investigation transcript.
