---
name: gtm-ask
description: Delegate GTM work (ads, copy, research, campaigns, pricing pages) to Tangle's production GTM agent with gtm-ask, then gate its results on Drew's quality bar.
---

# GTM ask

Tangle's production GTM agent at gtm.tangle.tools does GTM work; this session is its operator and its builder, never its stand-in.
Producing the brand values, files, copy, screenshots or critique fixes yourself hides whether the product works.
Your job is the ask, the verdict, and the capability the agent was missing.

`gtm-ask --help` owns the commands, options and exit codes; [the operator loop](https://github.com/tangle-network/gtm-agent/blob/master/docs/operator-loop.md) says where approvals and Drew's other channels show up.

## 1. Write the outcome-level ask

State the outcome, its audience or channel, the bar it must clear, and any decision only Drew can make.
Tell the agent to find its own facts: the real logo and lockup from the product site, the brand fonts and colors, real product screenshots, live pricing, and working SDK code.
Done when the ask names the outcome and the bar, and holds nothing the agent could look up itself.

## 2. Send it and follow it

```bash
gtm-ask "<outcome-level ask>"                 # new conversation in Drew's GTM Agent workspace
gtm-ask --thread <id> "<verdict or answer>"   # continue the same conversation
gtm-ask status <id> --wait 9m                 # resume following after exit 3
```

Turns run for minutes.
Run it in the background, or in slices that fit the tool timeout with `--wait 9m` followed by `status --wait 9m` while it exits 3.
Use `--workspace` with an isolated test workspace for product proofs; Drew's workspace holds production state.
Done when the turn exits 0, 1 or 4.

- Exit 1 is a product or platform defect: diagnose it as the builder and fix the capability; redoing the work by hand is not a recovery.
- Exit 4, or a question in the reply: answer as Drew's operator from live sources first (served plans at `https://id.tangle.tools/v1/plans`, the live product sites, the `@tangle-network/brand` package) and `~/company` second, citing the source in a `--thread` reply.
  Open question cards and Hub approvals are answered in the conversation link the CLI prints.
  Escalate to Drew only spending, legal terms, his phone, and irreversible production changes.

## 3. Gate the result

Fetch every deliverable: `gtm-ask file <vault-path>` for documents and `--download <dir>` for the asset files, viewed at full size.
Grade each item with evidence:

| Item | Passes when |
|---|---|
| Real verified code | Every snippet runs or typechecks against the published package version. |
| Logo lockup | Logotype size, spacing and product name match a current screenshot of the product's own site. |
| Real brand assets | Logo, fonts, colors and screenshots come from the brand package or the live product, never redrawn or invented. |
| Live pricing truth | Every price, limit and plan claim matches the served plan catalog and live site at check time. |
| No slop | Specific claims with evidence, deliberate hierarchy and craft, no generic layout, filler, banned vocabulary or invented advantage. |

Done when every item is PASS or FAIL with its evidence; an unchecked item counts as FAIL.

## 4. Act on the verdict

Send failures back in the same thread as verdicts: the item, the evidence, and the bar, so the agent does the revision.
When the agent cannot meet the bar, the missing capability is the gtm-agent engineering task; build it, then re-ask unassisted.
Show Drew only work that passed every item, with the conversation link and the gate evidence.

## Log the run

```bash
skill-run-log /gtm-ask --target "<thread id and outcome>" --verdict <PASS|FAIL|WAITING> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The turn failed or the agent lacked a capability | `/diagnose` | the thread link, failure notice, and the ask |
| A creative deliverable needs visual review | `/product-design` | the downloaded assets and the product site screenshot |
