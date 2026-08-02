# Blog Discovery Anti-Patterns

This file governs search engine optimization (SEO), answer engine optimization (AEO), and generative engine optimization (GEO) for public Tangle writing.

The reader still comes first.

Google's current guidance says that AEO and GEO are names people use for visibility in AI search, not a replacement for ordinary SEO.

There is no special AI markup, ideal word count, required chunk size, or `llms.txt` file that makes a page visible.

The durable strategy is a useful, original, crawlable page that answers a real question and makes its evidence easy to inspect.

## Keyword failures

Do not:

- choose a keyword because a tool invented a volume number without showing the source, date, country, and match type
- force an exact phrase into the title, first sentence, every heading, image alt text, and conclusion
- create one page for every spelling or long-tail variation of the same question
- use a product name as a substitute for the category or problem a reader is searching for
- call a page “best,” “complete,” “ultimate,” or “2026” unless the article can support that promise and the date matters
- put a keyword in a heading when the heading no longer sounds like something a person would say
- treat a keyword list as an outline

Exact-match language is a clue about reader intent, not a string to repeat.

Google says its language systems can match related wording without every variation appearing verbatim.

## Search-first page failures

Reject a page when:

- the opening answers a search crawler but not a recognizable human problem
- the page promises a question and never gives a self-contained answer
- the title and description target one query while the body argues about another
- the page repeats another article's topic, title, and evidence closely enough that the reader cannot tell which page to choose
- a comparison page hides the scenario, criteria, date, or conditions under which another option wins
- the conclusion is a generic call to action instead of a reader decision
- internal links exist only to distribute keywords rather than help the next step

Do not create doorway pages that differ only by a product name, location, or keyword variant.

## Answer-engine failures

Do not:

- add a fake “quick answer” that the body does not support
- turn every article into a list of shallow FAQ questions
- add FAQ structured data when the questions and answers are not visibly present on the page
- imply that FAQ markup guarantees an answer-engine citation or a Google rich result
- use `llms.txt`, hidden text, invisible keywords, or machine-only paragraphs as a visibility trick
- write fragments that remove the conditions and limits a model needs to quote the claim safely
- call a citation-rate experiment a ranking guarantee
- count a brand mention as a citation unless the engine actually linked to the page

An answer engine needs a clear claim, the object the claim describes, the evidence behind it, and the limits of the claim.

Shorter is not automatically more extractable.

Google explicitly says there is no requirement to split a page into tiny chunks and no need to rewrite content in a special AI style.

## Authority and evidence failures

Never:

- cite a search-result snippet as if it were the source
- publish a number without its task, denominator, comparison, version or date, and missing data
- use “secure,” “verifiable,” “production-ready,” or “trusted” without naming the mechanism and boundary
- turn a private repository, local path, commit, or inspection command into public evidence
- use a competitor's name as a keyword when the article does not fairly explain the comparison
- claim that Tangle's protocol guarantees behavior provided only by a hosted service, a source tree, or an unreleased package
- use a citation, quote, or statistic merely because a GEO paper reported that such additions can improve visibility in one benchmark

The GEO research is a useful experiment, not a promise about Google's or any other engine's ranking system.

## Technical discovery failures

Do not ship a post with:

- a missing or duplicated canonical URL
- a title that is vague, misleading, or copied from another page
- a description that is missing, generic, or unrelated to the visible opening
- broken internal links or anchor text such as “click here” that hides the destination
- an image whose alt text repeats keywords instead of describing the image's job
- a page that is not publicly crawlable, indexable, and reachable from ordinary site links
- structured data that says something the visible page does not say

Structured data can help search eligibility, but it does not replace readable content and it does not create an answer-engine ranking signal by itself.

## Measurement failures

Do not report “SEO improved,” “AEO improved,” or “GEO improved” from a single impression, one model response, or a tool's proprietary score.

Measure separately:

- Google Search Console queries, pages, impressions, clicks, click-through rate, and position over a named period
- Bing Webmaster Tools AI citations, cited pages, and grounding queries when that public preview is available to the property
- answer-engine citation rate as successful, attributable responses divided by successful measured queries, with provider, model, prompt, date, and failures shown
- page-level changes against a comparable prior period rather than against memory

An API failure is not an absence of a citation.

Do not hide zeroes, missing rows, or provider failures in a summary percentage.

## Sources

- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Google Helpful, Reliable, People-First Content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google's guide to generative AI features in Search](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Google Article structured data guidance](https://developers.google.com/search/docs/appearance/structured-data/article)
- [Google Search Console Performance report](https://support.google.com/webmasters/answer/17010961)
- [Bing AI Performance in Webmaster Tools](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview)
- [GEO: Generative Engine Optimization](https://arxiv.org/abs/2311.09735)
