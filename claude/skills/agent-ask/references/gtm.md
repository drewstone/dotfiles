# GTM operator bar

Use this when the production GTM agent does ads, copy, research, campaigns, or pricing work. `agent-ask --app gtm` uses the standard operator API; `gtm-ask` is the GTM-specific CLI. Read each command's current `--help` before relying on options or exit codes. The [GTM operator loop](https://github.com/tangle-network/gtm-agent/blob/master/docs/operator-loop.md) owns where approvals and other channels appear.

Ask for the outcome and audience; the GTM agent creates the work. Have it find the current logo, fonts, colors, screenshots, pricing, and SDK code from live product sources. Use an isolated workspace for product proofs; Drew's workspace holds production state. When it asks a question, check served plans, the product site, and `@tangle-network/brand` before local company material, then cite the answer in the same thread. Drew decides spending, legal terms, phone use, and irreversible production changes.

Read every deliverable, including downloaded assets at full size. Give each deliverable PASS or FAIL with evidence for every applicable check; unchecked items FAIL.

| Item | Passes when |
|---|---|
| SDK code | It runs or typechecks against the published package version. Displayed code uses valid syntax for its shown language; JavaScript SDK expressions have no shell `$` prompt. |
| Logo lockup | Size, spacing, and product name match the product's current site. |
| Brand assets | Logo, fonts, colors, and screenshots match the live product site and brand package; cite the checked sources. |
| Pricing | Every plan, price, and limit matches the served catalog and site at check time. |
| Copy | Names the buyer's problem and a specific benefit with sourced claims; no cringe, generic hype, filler, brand-banned vocabulary, or invented advantage. |
| Cold email | Shared batch boilerplate ≤10%; zero AI-tell phrases, including "one risk worth naming", "the risk I'd name is quiet changes", "documents a workflow", or "squarely in your design space"; zero API identifiers in prose; ≤75 words; a first-person, specific observation a human would notice; one low-friction ask. |
| Layout | One clear focal point, deliberate reading order, readable type, and uncluttered spacing at the intended size. Render the saved creative at full size; inspect edges, clipping, and padding, especially footer/card spacing. |
| Idea | A clever, product-specific insight or hook the agent can defend with buyer evidence; a rival's name cannot replace this product's without changing the idea. |
| Campaign | Identifies the buyer, fits the channel, and leads through one clear CTA to a working buyer path and a measurable product outcome. |

Cold-email writing PASS counts only after a blind judge agrees with actual Drew labels. Hide authorship, earlier CEO/critic verdicts, and Drew labels until judging; an uncalibrated critic cannot confer PASS.

Ask why the agent chose the angle and design. Return FAILs in the same thread: one succinct verdict naming the item, evidence, and unmet bar, without writing its replacement. A capability gap goes to its builder with evidence and the smallest fix; after the fix, re-ask unassisted. Show Drew passed work with the conversation link and evidence.

Before showing any item to Drew, prepare one phone-readable local HTML gallery per batch under `~/reviews/`, with an openable absolute path (never claude.ai artifacts). For each item include its full-size asset, every claim with its live source, teardown against the 3 best real competitor examples, CEO and independent critic verdicts and disagreements, and the exact send/post being authorized. Hand the packet path to `op-gtm:phone-approvals` for yes/no/feedback; a yes covers only that exact send/post.

After every verdict, ask the agent to record the lesson where it will use it next: `knowledge/models/operator-priorities.md`, its skills, or a profile-trial proposal. Check the next relevant output against that lesson and cite the visible correction. A saved note alone is not retention; if the correction is absent, return FAIL and continue the loop.
