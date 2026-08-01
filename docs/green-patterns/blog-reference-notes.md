# Reverse-Engineered Blog References

These notes record the patterns extracted from real technical articles.
They are evidence for the rubric, not instructions to copy another company's voice.

## Anthropic: Demystifying evals for AI agents

Source: [anthropic.com/engineering/demystifying-evals-for-ai-agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

### Observed sequence

1. State why evaluation matters before introducing evaluation terminology.
2. Define an evaluation with a plain sentence.
3. Distinguish a simple test from a multi-step agent test.
4. Define task, trial, grader, transcript, and scaffold at the point of use.
5. Explain why the system is harder to measure.
6. Compare methods and state the conditions where each is useful.

### Rule extracted

A specialist article can use precise vocabulary if it earns each term with a definition before relying on it.

### Anti-pattern extracted

Do not open with “our eval,” a grader name, or a score and expect the reader to infer the object being measured.

## GitHub: The technology behind new code search

Source: [github.blog/engineering/the-technology-behind-githubs-new-code-search](https://github.blog/engineering/the-technology-behind-githubs-new-code-search/).

### Observed sequence

1. Start with the user question: how does the product work?
2. Give the short answer before the architecture.
3. Explain why existing tools did not meet the product's scale and user needs.
4. Name the new system only after the reader understands the decision to build it.
5. Introduce one mechanism at a time, with a concrete analogy or number.
6. Connect each implementation choice to a user-visible requirement.

### Rule extracted

Every technical detail must answer a reader question created by the preceding section.

### Anti-pattern extracted

Do not list components, storage layers, or algorithms before explaining the constraint that made each one necessary.

## GitHub: How we built the GitHub globe

Source: [github.blog/engineering/how-we-built-the-github-globe](https://github.blog/engineering/how-we-built-the-github-globe/).

### Observed sequence

1. Start with the product experience and the design goal.
2. Name the evidence of real activity the experience must show.
3. Explain the visual artifact in ordinary terms.
4. Move into rendering details only after the reader knows what the details are for.
5. Include performance limits and the fallback when the ideal cannot hold.

### Rule extracted

Start at the reader-visible result, then walk inward toward the implementation.

### Anti-pattern extracted

Do not make the repository or system diagram the protagonist.
The reader's problem and the artifact are the protagonists.

## Stripe engineering archive

Source: [stripe.com/blog/engineering](https://stripe.com/blog/engineering).

### Observed sequence

The strongest Stripe engineering introductions answer three questions early:

- What were we trying to do?
- Why did the existing approach fail or become expensive?
- What did we build and what changed for the user?

The archive's own description frames the work as how, what, and why.

### Rule extracted

Technical detail earns its place by explaining a decision, not by proving that the author saw the code.

### Anti-pattern extracted

Do not confuse a list of implementation nouns with an explanation.

## OpenAI: Unrolling the Codex agent loop

Source: [openai.com/index/unrolling-the-codex-agent-loop](https://openai.com/index/unrolling-the-codex-agent-loop/).

### Observed sequence

1. State which part of the product the article covers and which terms will be used interchangeably.
2. Give the reader a simple mental model before discussing the implementation.
3. Walk through one cycle in order, from user input to model response to tool result.
4. Explain the vocabulary needed for the next section before using it repeatedly.
5. Move into configuration and source links only after the reader understands the flow.
6. Close with what the model explains and what a later article will cover.

### Rule extracted

Architecture writing works when the reader can draw the process before seeing its internal parts.

### Anti-pattern extracted

Do not make file names, endpoints, or source links carry the explanation.
They are evidence for a mental model, not a substitute for one.

## Cognition: How Cognition Uses Devin to Build Devin

Source: [cognition.com/blog/how-cognition-uses-devin-to-build-devin](https://cognition.com/blog/how-cognition-uses-devin-to-build-devin).

### Observed sequence

1. Open with a concrete internal result and a time comparison.
2. Explain the reader-facing product in ordinary language before listing interfaces.
3. Show the same workflow across several entry points.
4. List the work that consistently succeeds and the conditions that improve results.
5. Name where the product is still weaker and where human judgment remains necessary.
6. End with practical setup steps and a short operational principle.

### Rule extracted

Deployment writing becomes useful when it tells a reader what to try first and what not to delegate yet.

### Anti-pattern extracted

Do not turn an internal adoption statistic into a universal performance claim.
Name the team, time window, workload, and denominator, then describe what the number does and does not show.

## Anthropic: Designing AI-resistant technical evaluations

Source: [anthropic.com/engineering/AI-resistant-technical-evaluations](https://www.anthropic.com/engineering/AI-resistant-technical-evaluations).

### Observed sequence

1. Lead with the problem and the surprising result that forced a redesign.
2. Establish the history and sample size before describing the three versions.
3. Explain each iteration as a response to a concrete failure.
4. Share the remaining limitation and invite a bounded next test.

### Rule extracted

An evidence story is stronger when each change has a reason and each result has a limit.

### Anti-pattern extracted

Do not present an improved number without explaining what failed before it and what remains untested.

## Tangle application

The current Tangle posts invert these patterns when they:

- lead with F1, line counts, or contract counts before explaining the task
- use “AgentProfile,” “worker,” “bridge,” or “trace” without an ordinary-language introduction
- paste commands that reproduce the author's repository inspection
- describe source commits instead of the user-visible behavior they changed
- end with source inventory rather than a reader decision

The rewrite rule is therefore not “make the prose friendlier.”
It is “move the reader's problem, definitions, and decision ahead of the implementation record.”
