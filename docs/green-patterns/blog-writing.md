# Green Patterns For Reader-First Technical Blogs

This guide defines the positive patterns that make a technical article useful to a reader who knows nothing about the project.
Use the [public technical blog style guide](blog-style-guide.md) for voice, article modes, and sentence-level decisions.

It complements the anti-pattern doctrine.
The anti-patterns reject failure modes; these patterns describe what to write instead.

## The reader contract

Before drafting, write one sentence for the reader:

> After reading this, a person who knows nothing about the project can explain **X** and decide **Y**.

If the sentence cannot name a decision, the article is probably a product description or a research note rather than a blog post.

The first paragraph must establish three things:

1. A problem a reader recognizes without knowing Tangle.
2. The question the article will answer.
3. The concrete result, change, or lesson that answers it.

Do not begin with the product name, an internal class, a benchmark score, or a repository path.

## The story shape

Use this sequence when the article describes a technical change or result:

1. **Situation** — show what a person is trying to do.
2. **Failure** — show what goes wrong or what was unknown.
3. **Plain-language model** — explain the smallest concept needed to follow the rest.
4. **Change or test** — say what was built or compared.
5. **Evidence** — show the result with a denominator, conditions, and limits.
6. **Consequence** — say what decision the reader should make differently.

The sequence can be shorter, but the reader must never reconstruct it from disconnected facts.

## Explain native language before using it

Use the pattern:

> A **worker** is the process that performs one run.

Then use “worker” consistently.

For every project-specific term, provide:

- the ordinary-language name
- the job it performs
- why the reader needs the term

Do not define five terms in a glossary after the reader has already encountered them.
Define one term at the moment it becomes necessary.

Metrics need the same treatment.
Say what a number counts, what its denominator is, and what it does not measure before interpreting it.

## Make the evidence legible

Every table needs a sentence that tells the reader how to read it.

For a benchmark, name the task, the number of attempts, the model or system, the comparison arms, the scorer, the cost boundary, and the missing data.

For a software change, name the user-visible behavior before naming the implementation.

For a comparison, name the scenario and criteria, then admit where another option is better.

Use links to public evidence.
Do not paste the commands used by the author to inspect a repository.

## Show one concrete artifact

Prefer one of these over a pile of abstractions:

- a small before-and-after example
- a short input/output pair
- a readable table with explained columns
- a trace excerpt translated into ordinary language
- a diagram with a sentence explaining the arrows
- a failure case and the decision it changes

The artifact should teach the mechanism, not decorate the page.

## Keep the product boundary visible

Say whether a statement describes:

- a public protocol or contract
- a hosted Tangle service
- an open-source repository
- a package release
- a proposed future change

Never turn a source-tree capability into a package promise.
Never turn a hosted behavior into a protocol guarantee.

## End with a decision

The ending should answer:

- What should the reader do now?
- When should they not use this approach?
- What evidence is still missing?

Do not end with a generic call to action, a recap of the headings, or a motivational line.

## Reference patterns we copied

These are evidence sources, not templates to imitate line for line.

- [Anthropic's “Demystifying evals for AI agents”](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) defines an evaluation, task, trial, grader, transcript, and agent scaffold before comparing evaluation strategies.
- [GitHub's “The technology behind new code search”](https://github.blog/engineering/the-technology-behind-githubs-new-code-search/) begins with the user question, explains why existing approaches fail at the relevant scale, and only then introduces the system name and implementation choices.
- [GitHub's “How we built the GitHub globe”](https://github.blog/engineering/how-we-built-the-github-globe/) starts with the product goal, names the proof the visual must provide, and walks from the user-facing artifact into the implementation and its performance limits.
- [Stripe's engineering archive](https://stripe.com/blog/engineering) consistently frames technical work as how, what, and why, rather than presenting a component inventory.

The transferable rule is simple: earn the technical detail by first giving the reader a problem they can understand.

## Pre-publish reader test

Give the draft to someone who has never used Tangle.
Ask them to answer these questions without opening a link:

1. What problem is the article about?
2. What does the unfamiliar product or component do?
3. What changed or was measured?
4. What number or artifact supports the claim?
5. What should they decide differently?

If they cannot answer any one of these, rewrite the opening or the section that failed.
