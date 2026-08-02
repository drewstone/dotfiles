# Blog Discovery Quality Rubric

Use this rubric after the reader-first [blog quality rubric](blog-quality.md).

It scores whether a useful article is discoverable and safely reusable in search-backed answers.

It does not reward keyword repetition.

Score each dimension from 0 to 4.

## Dimensions

### 1. Query and intent

Does the post own one recorded reader question with a clear intent and a deliberate page owner?

### 2. Title and snippet

Are the title and description unique, accurate, readable, and specific to this page?

### 3. Answer clarity

Does the opening give a self-contained answer, define necessary terms, and preserve the conditions and limits?

### 4. Evidence and entities

Can a search engine or answer system connect the named product or concept to public sources, examples, measurements, and visible text?

### 5. Technical discovery

Is the page crawlable, canonical, linked from the site, included in the sitemap, and represented accurately by its metadata?

## Hard failures

Any of these requires revision regardless of the score:

- no recorded primary query or intent
- keyword stuffing, hidden text, doorway content, or one-page-per-synonym duplication
- title or description that promises a different answer than the visible page
- structured data that contradicts visible content
- unsupported claim that a tactic guarantees ranking or AI citation
- broken canonical, blocked page, missing sitemap entry, or broken internal link

## Thresholds

- 18–20: ready after factual and live-search checks
- 14–17: revise before publication or promotion
- 0–13 or any hard failure: rewrite the search surface and opening

## Required audit output

For every post, record:

```text
Post:
Primary query:
Query source/date/region:
Intent:
Owning URL:
Related questions:
Search title:
Description:
Answer sentence:
Evidence links:
Technical checks:

Query and intent:       /4
Title and snippet:      /4
Answer clarity:         /4
Evidence and entities:  /4
Technical discovery:    /4
Total:                  /20

Hard failures:
Next edit:
```

Do not mark a post ready from this rubric without checking the published URL and the measured query or citation data.
