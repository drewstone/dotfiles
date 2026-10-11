---
name: prove-journeys
description: Prove an agent app's product flows by real usage - record browser journeys as test identities, score every chat turn, run a skeptical critic, and hand over one INDEX.md with a ranked fix list. Use when asked to prove the flows that matter work, to record real users, or to show a fix working the way a customer sees it.
---

# Prove journeys

A flow works when a recording shows a person getting the result, at a founder's bar.
Specs, canaries and green CI are evidence about code; this skill produces evidence about the product.
On 2026-10-11 it found that GTM proved 2 of its 4 minimum-customer-path checks, and that its first harness had scored 6 of 6 failed turns "completed".

The recorder, the turn scorer and the report are agent-app's `journeys` kit (`@tangle-network/agent-app/journeys`, CLI `agent-app-journeys`); its [guide](https://github.com/tangle-network/agent-app/blob/main/docs/journeys.md) owns the config, the script API and the scoring rule.
The saved workflow `prove-journeys` runs steps 1 to 4 for a list of flows.
`journeys-env` loads the identities' credentials from the host vault.

## Inputs

- The app's production origin and repository, and a checkout of it on a Beelink with dependencies installed, on an agent-app release that ships `journeys`.
- Test identities: names, roles, the environment variable names that hold their credentials, and the test workspaces they may use. Never a value.
- The flow list, from the app's own definition of what must work: its launch checklist's minimum customer path, `PRODUCT_FLOWS`, or delivery plan. Treat every "Live" claim as unproven.

## 1. Prepare the host

Add `journeys.config.mjs` at the app root when it has none; the guide's example is GTM's.
In the checkout, run `journeys-env -- pnpm exec agent-app-journeys signin <identity>` for each identity, then one journey that opens the app and calls `j.checkChatContract(page)` on a chat page.
Done when every identity prints a verified user and the contract check shows the transcript, composer, input and Send.

## 2. Record one journey per flow

Give each flow one owner who writes its script under `journeys/<flow-id>/` in that checkout and runs it with `journeys-env -- pnpm exec agent-app-journeys run journeys/<flow-id>/run.ts`.
Run at most two journeys at once across the Beelinks, and stagger their starts by 30 seconds.

- Act as the person the flow is for, at their pace, with outcome-level asks; do not read source to decide whether something works, only to name a cause after a failure.
- Use only the test identities and workspaces; press nothing that sends, posts, schedules, publishes, approves, invites a real address or pays. Drafts and approval cards are fine.
- Keep to the journey's turn budget (`maxTurns`, default 6). Never press Sign out in a shared session.
- Screenshot every screen you judge (`j.shot` takes desktop and phone); measure every turn through `sendNew`/`sendInThread`.
- After `finish()`, run `agent-app-journeys frames <id> <label>` and look at 6 to 10 frames before judging; copy the folder off the host with the rsync line it prints.

Done when each flow has a highlights video, `timings.json`, frames you looked at, and a report with a verdict, steps with evidence and mm:ss, every turn, the output's grade, and failures with repro steps.

## 3. Review it skeptically

A separate reviewer, never a journey's author, re-checks every P0 and P1 against frames and traces, re-runs a thin repro within a stated turn budget, and marks each failure verified, refuted or unproven.
It grades output and UI at Drew's bar: specific, sourced, correct, saved where the person finds it; no tiny fonts, field-path helper text, raw JSON or bare codes; live validation; honest failures in plain words.
Each verified failure carries a rank by impact on a customer getting useful work done, a fix, the measured number now with its denominator, the target, and the journey that proves the fix.
Read the turn table against the videos: a turn scored `completed` over a visible failure card is a scorer defect, reported against agent-app `journeys`.
Done when `critic-result.json` holds the headline, scorecard, ranked verified failures, UI critique, refuted or unproven claims and coverage gaps.

## 4. Write the index

On the host that holds the folder, run `agent-app-journeys index <folder> --critic <folder>/critic-result.json --title "<app> journeys <date>"`, and copy INDEX.md beside the videos.
Done when INDEX.md opens with the highlights, and its ranked fixes and turn table match `critic-result.json` and the `timings.json` files.

## Prove a fix

Rerun the shortest journey that shows the fixed behavior, on production after the release or on a local stack (`JOURNEYS_BASE_URL`) before it, and quote the before and after numbers from `timings.json` with their denominators.
Leave the script in `journeys/` so it can become a standing check.

## Log the run

```bash
skill-run-log /prove-journeys --target "<app>: <n> flows" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --metric "flows proven end to end" --before <n> --after <n> --source INDEX.md --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Verified failures need fixing in parallel | `/orchestrate` | one lane per ranked failure, each proven by rerunning its journey |
| A scored outcome disagrees with its video | `/diagnose` | the turn, its frames, and agent-app `src/journeys/score.ts` |
