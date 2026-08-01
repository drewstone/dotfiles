# Blog Quality Rubric

This rubric grades public technical blogs for a zero-context reader.
Use it with the [public technical blog style guide](../green-patterns/blog-style-guide.md) when reviewing voice and structure.
The reader is assumed to know nothing about Tangle, its products, its repositories, its architecture, or its vocabulary.

## Hard rejects

Reject the draft regardless of its numeric score if any item is true:

- The opening does not state a recognizable problem and a question the article will answer.
- A Tangle-native term, acronym, metric, protocol, or component appears before a plain-language explanation.
- The article contains internal commands, shell pipelines, local paths, branch names, commit hashes, private-repository instructions, or author-side investigation notes.
- The article makes a product, package, protocol, or performance claim without a public source or a clearly labeled measured result.
- A number has no denominator, conditions, or explanation of what it measures.
- The article cannot name a decision or action that becomes easier for the reader.
- The article is a product inventory, SEO keyword page, or research note disguised as a blog.
- The article ends with a generic CTA or a recap that adds no new decision.

## Scoring

Score each dimension from 0 to 4.

- **0** — absent or actively misleading.
- **1** — mentioned but unusable without insider knowledge.
- **2** — understandable after effort, with important gaps.
- **3** — clear and useful to a new reader.
- **4** — exceptionally clear, concrete, and teachable.

### 1. Reader problem

Does the opening show a problem a newcomer recognizes?

### 2. Single story

Can a reader state the article's one argument in one sentence?
Do sections advance that argument rather than introduce unrelated facts?

### 3. Definitions

Does every native term receive an ordinary-language definition at first use?

### 4. Jargon control

Are acronyms, metrics, protocols, and implementation terms explained only when needed?
Does the article avoid substituting internal names for explanation?

### 5. Evidence

Does the article show a concrete artifact, example, source, test condition, or measured result?
Can a reader tell what the evidence proves and what it does not prove?

### 6. Measurement honesty

Are sample size, denominator, comparison arms, dates, cost boundary, completion, and missing data visible when relevant?

### 7. Product boundaries

Does the article distinguish protocol behavior, hosted service behavior, source code, package release, and roadmap?

### 8. Reader decision

Does the conclusion say what to use, change, test, avoid, or measure next?
Does it name the conditions where the conclusion does not apply?

### 9. Prose

Does each sentence have a job?
Does the writing sound like a person explaining a real experience rather than an abstract system narrating itself?
Does it match the house voice: direct, specific, curious about the failure, and modest about interpretation?

### 10. Structure

Can a reader scan the headings and understand the sequence?
Are tables and links used to clarify rather than to create the appearance of rigor?

## Thresholds

- **36–40, no hard rejects** — publishable after factual and link checks.
- **30–35, no hard rejects** — revise before publication.
- **0–29 or any hard reject** — rewrite from the reader problem, not from the existing sentences.

No post may be called “good” from the numeric score alone.
The reviewer must write a one-sentence reader takeaway and name the evidence that supports it.

## Grader worksheet

```text
Post:
Audience assumed:
Reader problem:
Reader takeaway:
Decision unblocked:

Hard rejects:

Reader problem:      /4
Single story:        /4
Definitions:         /4
Jargon control:      /4
Evidence:            /4
Measurement honesty: /4
Product boundaries:  /4
Reader decision:     /4
Prose:               /4
Structure:           /4
Total:               /40

Terms that need definitions:
Claims needing sources:
Sentences to remove:
Required rewrite:
Reviewer:
Date:
```

## Review order

Review in this order:

1. Read only the title, summary, and first 250 words.
2. Write the reader takeaway before reading the rest.
3. List every term a newcomer would not know.
4. Check every number and source.
5. Remove internal repository mechanics.
6. Score the full draft.
7. Rewrite the opening and the weakest section before polishing sentences.

If the reviewer cannot summarize the post after the first read, the post is not ready for line editing.
