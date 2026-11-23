# Copywriting Anti-Patterns

This file owns writing methods and rejected examples for marketing, UI, pages, launches and public-facing writing.

## Sell What You Do

A page we publish is a seller's page. Every sentence gives the reader a reason to choose the product, or the proof of one. Say what the product does, why it matters to the reader, and show it with an example they can run.

Do:

- **Say what it does in the first line.** A reader who stops there knows what is sold: "Financial infrastructure to grow your revenue." ([Stripe](https://stripe.com/)) The test: "If the visitor reads only this text on your page, will they know exactly what you sell?" ([Julian Shapiro](https://www.julian.com/guide/startup/landing-pages))
- **Lead with the reader's gain, then the feature that delivers it.**
- **Give the number and how it was measured.** "Up to 18 hours of battery life", with the test beside it: "browsing 25 popular websites while connected to Wi-Fi" ([Apple](https://www.apple.com/macbook-air/)). Claude Hopkins, 1923: "Say it gives three and one-third times the light and people realise that you have made tests and comparisons." ([Scientific Advertising](https://draytonbird.com/wp-content/uploads/2012/08/Hopkins_Scientific_Advtg.pdf))
- **Put the proof on the same screen as the claim**: the benchmark link, the measurement, the customer's own words.
- **Show an example the reader can run.** A command on the page is a trial with no signup: "Ship from GitHub or our CLI with fly launch." ([Fly.io](https://fly.io/))
- **Show one scene the reader can picture.** "I was able to renew @letsencrypt certificate on my home NAS while being 8000 kilometers away from it." (a customer on [Tailscale](https://tailscale.com/)) A scene does more than a list of categories.
- **Show the product.** "Don't show me fancy illustrations. Show me your product." ([Harry Dry](https://marketingexamples.com/landing-page/guide))
- **Sell against doing nothing first.** "To win business, the first competitive alternative we need to beat is the status quo." ([April Dunford](https://aprildunford.substack.com/p/positioning-and-competition))
- **On a page that names a rival, answer its strength in one sentence and go back to selling.** Render concedes and tops it: "Heroku is easy to use compared to AWS, but our customers tell us Render is even easier." ([Render](https://render.com/render-vs-heroku-comparison)) Linear calls the rival's strength an old belief, then lists who switched: "For years, conventional wisdom held that small teams started on Linear for speed while large enterprises needed Jira" ([Linear](https://linear.app/switch)). Then give the switch path: the mapping table and the commands.
- **End on one next step that completes the headline's claim**, with the words that remove the last objection to clicking.

Do not:

- **Tell the reader when to pick a competitor.** "Pick X when", "X is the right tool if", "any of the four work". A neutral buyer's guide on the seller's own site advertises the rival. Hopkins on the opposite error: "To attack a rival is never good advertising." Neither recommend a rival nor attack one.
- **List what the product does not do.** "What we don't (yet) ship", "on the roadmap", "a v2 surface". Describe what ships today. A missing capability is work to build, never a sentence on the page.
- **Reprint a rival's claims or link its pricing page.**
- **Describe the page's own fairness.** "Honest comparison", "we'd rather correct the table than win a row".
- **Open with a category label.** Such headers "read like slogans instead of descriptions" (Julian Shapiro). Write one sentence with a subject, a verb and the job done.
- **Praise without proof.** "The most polished", "famously straightforward". Replace the adjective with the measured number.
- **Give a number without its method.**
- **Hedge.** "Can help", "may", "aims to", "designed to".

Some vendors publish a "who should pick them" section on purpose (PostHog's [comparison guide](https://posthog.com/blog/comparison-content-guide) asks for one). We do not. Render, Linear and Supabase sell on their comparison pages without one, and that is the model.

## Banned Defaults

Do not use:

- eyebrow/kicker labels above headings as default structure
- "Research" or "Writing" above a page title
- logo usage rules on a brand kit, such as "Use the supplied logo files without stretching, recoloring, or adding effects."

## Counting Copy

Do not announce how many things follow, and do not count the page's own items:

- "Three commands: create the project, prompt the agent, start a preview."
- "Two things changed."
- "Three witnesses address two proposed inequalities."
- "Five tools cover four workflows."
- A closing note that restates which items on the page share a subject.

The reader can count. Give the things themselves: the commands as the reader types them, the items by name. Counts belong in data: tables, labels and units.

Bad:

> Three commands: create the project, prompt the agent, start a preview.

Better:

```sh
app create demo
app prompt demo "a landing page with a signup form"
app preview demo
```

## Captions That Describe The Media

Do not use the text beside a clip or image to describe, excuse or disclaim it:

- "The video is sped up."
- "As you can see in the clip..."
- "The screenshot shows the dashboard."
- "Watch until the end."

Put the fact in the frame. A sped-up recording carries a running clock, so the viewer reads the real duration from the picture. The text says what was built and gives the input to repeat it.

## Show The Example

A how-to post gives the exact input and shows the output: the commands, the prompt, the result on screen. Cut a sentence that describes an example the post could have shown, and show the example.

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
- local file paths
- bare commit IDs, branch names, worktree names, or internal issue numbers
- private-repository instructions or notes about how the author verified a claim

Use a named public source link instead.
Explain the fact the source supports in the sentence before the link.
The reader needs the conclusion and its evidence, not our investigation transcript.

## Headlines that wrap

- a headline whose length is decided before the container width
- a last word alone on its own line

Write the headline to the width it will render in and check it at 1280 and 400 px.
A noun-first description of what the product is beats an imperative that needs a second line.

## Search And Answer Engines

- **Publish first-hand numbers, commands and results.** Google's own check: "Does the content provide original information, reporting, research, or analysis?" ([helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content))
- **Keep the substance in visible text.** Google's AI answers need no special file or markup: "There are no additional requirements to appear in AI Overviews or AI Mode" ([AI features](https://developers.google.com/search/docs/appearance/ai-features)). The page must be indexable, and the claim must be in text, not only in an image or a video.
- **Let the answer engines' crawlers in.** A site that blocks `OAI-SearchBot` in robots.txt is left out of ChatGPT search answers ([OpenAI crawlers](https://developers.openai.com/api/docs/bots)).
- **Answer the question a person types.** Put the subject in the heading and the answer in the first sentence under it, so a quoted passage stands on its own.
- **Write the title and description as the reader would search**, and say what the page gives them.
