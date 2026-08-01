# Public Technical Blog Style Guide

This is the house style for Tangle's public technical writing.
It is designed for a reader who knows nothing about Tangle, its products, or its vocabulary.

## The voice

Write like a patient engineer explaining one surprising result to a smart stranger.

The voice is:

- direct rather than theatrical
- specific rather than abstract
- curious about the failure, not proud of the machinery
- confident about observed facts and modest about interpretation
- warm enough to sound human, without pretending the reader is part of our team

Use “we” only for work Tangle actually did.
Use “you” for a reader decision or a concrete action.
Do not use “we” to smuggle a market claim into the article.

## The default article shape

Use this sequence for most technical posts:

1. **A recognizable situation.** Show what a person is trying to do.
2. **The failure or uncertainty.** Explain what went wrong or what we could not tell.
3. **The smallest useful model.** Define the one or two concepts needed to follow the story.
4. **The choice.** Explain what we changed or compared and why.
5. **The evidence.** Show the example, measurement, or public source with its limits.
6. **The consequence.** State what the reader should use, change, test, or avoid.

The title should name the problem, tension, or lesson.
It should not be a product name followed by a feature list.

## Openings

The first 150 words must answer four questions:

- What is the reader trying to accomplish?
- What makes it difficult?
- What did we learn or change?
- Why should the reader care?

Use this opening pattern when useful:

> When **person** tries to **job**, **failure** makes the result hard to trust.
> We tested **change or comparison** and found **plain-language result**.
> This post explains **one decision** the reader can make with that result.

Do not open with a product name, an acronym, a score, a commit, a repository path, or “In this post.”

## Native terms

Define a project-specific term at the moment the reader needs it.

Use the three-part definition:

> An **agent profile** is a saved set of instructions and permissions for one kind of automated worker.
> It tells the worker what it may use and how it should start.
> The term matters here because saving those settings is different from delivering them to the worker.

The definition must say what the thing is, what job it does, and why the article needs the word.

Spell out an acronym before its short form.
Explain a metric before showing its value.
Translate a protocol or file format into the user-visible behavior it enables.

Never make a glossary do work that belongs at first use.

## Evidence and numbers

Introduce every table with a sentence that tells the reader how to read it.

For a measured result, name:

- the task
- the number of attempts and the denominator
- the systems or approaches compared
- what the metric counts
- the date or version when it affects the result
- cost and completion when relevant
- what was not measured

Do not turn a number into a broad promise.
Write “this test found” rather than “this proves” unless the evidence supports the stronger claim.

## Technical detail

Technical detail earns its place by answering a question created by the preceding paragraph.

Explain the user-visible behavior before the implementation that produces it.
Prefer a small before-and-after example, a readable table, or a diagram with explained arrows.
Link to public source material instead of pasting repository commands, local paths, or inspection transcripts.

When code is necessary, show a short public-facing interface or input/output example.
Never show a shell pipeline, commit hash, private path, or author-side debugging command in a blog body.

## Product boundaries

State whether each claim describes a public protocol, a hosted Tangle service, an open-source repository, a released package, or a proposed change.

Do not turn a source-tree capability into a package promise.
Do not turn a private experiment into a public product guarantee.

## Endings

End with a decision, not a recap.

The last section should answer:

- what the reader should do now
- when the approach does not apply
- what evidence is still missing

If there is no useful action or decision, the draft is probably a reference note rather than a blog post.

## Reference voices

These are patterns to learn from, not voices to imitate line for line.

### Anthropic: the patient teaching note

Anthropic's engineering posts usually start with why the problem matters, then define the object being discussed, then separate simple cases from harder ones.
They introduce precise terms at the point of use and state where a method breaks down.

Use this mode for measurement, safety, and methodology posts.
Borrow the progressive definitions, concrete examples, and explicit limits.
Do not borrow internal vocabulary without translating it for a Tangle newcomer.

### OpenAI: the system unpacking

OpenAI's engineering posts establish the scope of the article, explain the mental model, and walk through one process in order.
Their strongest architecture posts connect each implementation choice to a user-visible behavior and link the public source for deeper detail.

Use this mode for runtime, interface, and architecture posts.
Borrow the sequential explanation and clear boundaries.
Do not make the reader reconstruct the model from source files or code dumps.

### Cognition: the operator's field note

Cognition's strongest posts begin with a real workflow or a measured outcome, then explain what the team learned from using the product.
They are practical about where the product works, how to start, and where human judgment remains necessary.

Use this mode for deployment lessons and case studies.
Borrow the concrete workflow, “works best when” guidance, and candid limitations.
Do not copy product superlatives or present an internal usage number as universal evidence.

### Stripe: the decision memo

Stripe's engineering archive consistently frames a post around how, what, and why.
The implementation is present, but the challenge and the user consequence remain the spine.

Use this mode when a post has several technical choices and needs a clear reason for each one.

## Tangle's final blend

The default Tangle post combines the four useful traits:

- Anthropic's definitions and limits
- OpenAI's ordered system explanation
- Cognition's practical workflow and candid advice
- Stripe's focus on why each choice mattered

The resulting article should feel like a clear explanation of a real problem, not a product tour, a code-review transcript, or a research abstract.

## Writer's preflight

Before editing sentences, write these five lines:

```text
Reader:
Problem:
Plain-language answer:
Evidence:
Decision:
```

If any line is blank, stop polishing and fix the argument.
