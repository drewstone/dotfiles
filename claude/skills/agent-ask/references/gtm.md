# GTM operator bar

Use this when the production GTM agent does ads, copy, research, campaigns, or pricing work. `agent-ask --app gtm` uses the standard operator API; `gtm-ask` is the GTM-specific CLI. Read each command's current `--help` before relying on options or exit codes. The [GTM operator loop](https://github.com/tangle-network/gtm-agent/blob/master/docs/operator-loop.md) owns where approvals and other channels appear.

Ask for the outcome and audience. Have the agent find the current logo, fonts, colors, screenshots, pricing, and SDK code from live product sources. Use an isolated workspace for product proofs; Drew's workspace holds production state. When it asks a question, check served plans, the product site, and `@tangle-network/brand` before local company material, then cite the answer in the same thread. Drew decides spending, legal terms, phone use, and irreversible production changes.

Read every deliverable, including downloaded assets at full size. Grade each applicable item:

| Item | Passes when |
|---|---|
| SDK code | It runs or typechecks against the published package version. |
| Logo lockup | Size, spacing, and product name match the product's current site. |
| Brand assets | Logo, fonts, colors, and screenshots come from the live product or brand package. |
| Pricing | Every plan, price, and limit matches the served catalog and site at check time. |
| Craft | Specific sourced claims, deliberate hierarchy, no filler, brand-banned vocabulary, invented advantage, or generic layout. |

Return failed items to the same agent thread with evidence and the bar. When it cannot meet the bar, fix the missing GTM Agent capability and re-ask unassisted. Show Drew the passed result with the conversation link and evidence.
