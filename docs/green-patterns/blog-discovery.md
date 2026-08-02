# Green Patterns For Searchable Technical Blogs

Use this guide after the reader-first story exists.

SEO makes a useful page discoverable.

AEO makes the page's answer easy to understand and quote.

GEO measures whether search-backed answer systems actually retrieve and cite the page.

These are overlapping outcomes, not three reasons to write three different versions of an article.

## Start with a query brief

Before drafting, record five lines:

```text
Reader:
Problem:
Primary query:
Related questions:
Decision:
```

The primary query is the clearest ordinary-language phrase for the reader's problem.

Related questions are the few follow-ups a reader must answer before making the decision.

Each query entry records its source, country or audience, date checked, intent, and the page that owns it.

Use sources in this order:

1. Google Search Console queries and pages for our own measured demand.
2. Google Trends or Keyword Planner for directional interest, with the date, region, and tool settings recorded.
3. Current search results and related questions for the language and page types users encounter.
4. Product documentation, support questions, and real customer language for technical specificity.

Do not invent a search volume when we do not have one.

## Own one intent per page

Give each post one primary job:

- explain a category or mechanism
- teach a deployment or debugging decision
- compare options for a named scenario
- report a measured result
- document a product boundary

One page may answer related questions, but it must not compete with another Tangle page for the same primary question without a deliberate canonical owner.

Use the existing series and internal links to form a reader path.

Do not split one useful explanation into several pages just to create more keyword targets.

## Write the result into the search surface

The title should be unique, descriptive, and accurate.

It should name the reader's problem or decision and include the primary query when that sounds natural.

Do not treat an arbitrary character limit as a ranking law; check how the title renders and whether the important words survive truncation.

The description should be a short, page-specific explanation of the answer and the evidence.

The first paragraph should answer the primary query in ordinary language, then state what the article will show and where the conclusion stops.

A good opening can be read alone and still tell a searcher whether the page is relevant.

## Make answers extractable without flattening the story

Use this sequence:

1. State the answer or observed result.
2. Define the one unfamiliar term needed to understand it.
3. Explain the failure, choice, or comparison that makes the answer useful.
4. Show one artifact, table, source, or measured result.
5. State the conditions, limits, and reader decision.

Write one direct answer near the top, not a pile of keyword-shaped fragments.

Use headings that name real questions or decisions when the reader would naturally ask them.

Use tables for criteria, conditions, and tradeoffs.

Introduce every table with a sentence that tells the reader what the columns mean.

Keep important facts in visible text.

Use ordinary HTML headings, paragraphs, lists, links, and tables before adding metadata.

## Make evidence quotable and safe

For every load-bearing claim, include one of:

- a public primary source
- a short example with inputs and outputs
- a measured result with task, denominator, comparison, version or date, and limits
- a public implementation link whose boundary is stated in the sentence

Put the qualification next to the claim, not in a footnote the reader will miss.

Use descriptive anchor text such as “Google's Article structured data guide,” not “read more.”

When a post compares products, name the scenario, criteria, date, and where the other option is better.

When a post reports Tangle work, say whether the evidence comes from a protocol, hosted service, public repository, released package, or proposal.

## Use native terms as entities, not decorations

Define a Tangle term at first use with its ordinary-language meaning, job, and relevance to the article.

Then use the same name consistently.

Mention the product or project once where it is necessary to identify the evidence or decision.

Do not repeat the brand in every heading.

The best entity signal is a consistent explanation that connects the name to a real object, source, and user outcome.

## Build a useful internal graph

Link to the one next article that answers the next question.

Link back to the series introduction when a post is deep in a sequence.

Link to public product or protocol documentation when the reader needs to act.

Use anchor text that describes the destination.

Do not link every keyword occurrence.

## Add only honest metadata

Emit Article or BlogPosting metadata that matches the visible title, author, date, image, and canonical URL.

Use BreadcrumbList when the breadcrumb is visible and accurate.

Use FAQ structured data only when the page visibly contains the same questions and answers and the markup is valid.

Do not add special “AI optimization” markup, hidden text, or `llms.txt` as a shortcut.

Validate structured data, canonical URLs, sitemap inclusion, robots access, and rendered links on the built page.

## Measure the result

Record the pre-change and post-change period, URL, primary query family, title and description version, and the exact edits.

For Search Console, report impressions, clicks, click-through rate, position, and the query-to-page mapping.

For Bing AI Performance, report total citations, cited pages, and grounding queries when the property is eligible.

For answer-engine tests, report provider, model, prompt, date, successful attempts, failed attempts, citations, cited URL, and whether the cited text supports the claim.

Treat citation visibility as a measurement, not a promise.

## Pre-publish card

- [ ] One reader and one primary intent are named.
- [ ] The primary query came from a recorded source, not a guess.
- [ ] The title is unique, accurate, and readable.
- [ ] The description summarizes this page rather than the product category.
- [ ] The opening answers the query before introducing internal language.
- [ ] Every native term and metric is defined at first use.
- [ ] Each important claim has a public source, artifact, or measured result.
- [ ] Numbers include task, denominator, conditions, and limits.
- [ ] Comparison pages state when another option is better.
- [ ] Internal links help the reader continue, and anchor text names the destination.
- [ ] Article metadata, canonical URL, sitemap, and visible content agree.
- [ ] Search Console and answer-engine measurement fields are ready for the post-publish check.

## Sources and boundaries

Google's [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) recommends useful, readable content, descriptive titles, page-specific descriptions, relevant links, and anticipating the words readers may search.

Google's [people-first guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) warns against producing many pages across unrelated topics, writing to an invented word count, and creating content mainly to attract search visits.

Google's [generative AI search guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) says existing SEO remains the foundation, rejects special AI markup and mandatory chunking, and points owners to Search Console's generative AI performance report.

Bing's [AI Performance preview](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview) exposes citations, cited pages, and grounding queries, but does not claim that citation counts are rankings or authority scores.

The [GEO paper](https://arxiv.org/abs/2311.09735) is useful prior art for testing citation visibility, but its reported gains are benchmark results and must not be turned into a universal promise.
