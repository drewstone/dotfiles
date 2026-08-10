# Reflect: session — 2026-08-01 — n=1

**Verdict:** Five existing URLs produced 6 clicks from 6,714 Google impressions over 28 days; 5 of 5 were rewritten locally (measured).
**Biggest cost this period:** 6,708 of 6,714 impressions without a click to finding #1.
**Next:** `/ship` targeting commit `6d7a6df`, with 0 of 5 revised URLs live.

## Corpus

| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-01 |
| Sources | `company/gtm/signals/2026-08-01/search-and-answer-visibility.md:14`; `tangle-website` commit `6d7a6df`; `company/tools/seo-engine/geo.db`; 6 skill-run rows |
| Prior reflections read | n=3: `2026-04-25-164800-r7-r20-arc.md`, `2026-06-06-blog-self-improving-stack-series.md`, `2026-04-04-gtm-agent.md` |
| Not inspected | n=1 production release, because 0 pushes or deploys were authorized; OpenAI answers, because 0 valid keys were available |

## Findings — top 4 of 5, ranked by cost × occurrences

| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | Existing ranking pages do not earn clicks | 5 of 5 URLs | 6,708 of 6,714 impressions without a click per 28 days | unmeasured until 1 post-release window closes | measured | signal brief lines 14–16 and 42–46 | Deploy 5 rewrites; compare identical windows | Website owner |
| 2 | Answer collection previously failed silently | 1 of 1 scheduled paths | 73 of 73 answer checks absent per run | 73 of 73 captured per run | measured | `geo.db`: `audit_runs` row 1; signal brief lines 29–36 | Fail on provider/config errors; retain run counts | GTM automation |
| 3 | Private source blocks public inspection | 1 of 1 repositories | unmeasured claim count; source inventory not inspected | 1 public evidence package | measured | `gh-drew repo view tangle-network/supervisor-lab --json visibility` → `PRIVATE` | Publish frozen tables, commands, environment, and commit IDs without private source | Drew + research owner |
| 4 | Date-only values used local time | 3 of 3 renderers | 3 of 3 renderers could show the prior date west of UTC | 3 of 3 corrected | measured | commit `6d7a6df`, `src/utils/date.ts`; browser snapshot showed August 1 | Format date-only values in UTC once | Website owner |

1 finding dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections

0 unresolved repeats across the 3 paths listed above.

## Measurements

| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Search rows captured | 0 | 1,554 | +1,554 | 916 query + 638 page rows | measured | signal brief lines 24–32 |
| Answer rows captured | 0 | 73 | +73 | 73 prompts | measured | signal brief lines 29–36 |
| Gemini citations | unmeasured | 4 | baseline | 73 prompts | measured | signal brief lines 18–20 |
| Changed-page copy checks | 0 | 6 passed | +6 | 6 pages, range 7–10 of 10 | measured | `pnpm check:copy <route>` output |
| Blog warnings | 1 | 0 | -1 | 81 posts | measured | `pnpm check:blog` → 81 posts, 0 errors, 0 warnings |
| Crawler routes | 0 | 11 passed | +11 | 11 routes | measured | OAI-SearchBot local curl loop → 11 HTTP 200 |

## Keep doing

| Practice | Evidence it worked | Number |
|---|---|---:|
| Inspect demand before writing net-new series | Existing URLs selected from Search Console | 5 of 5 URLs |
| Browser-check visible and machine-readable output | Desktop, tablet, mobile plus deterministic route checks passed | 14 of 14 browser checks |
| Fail closed on invalid credentials | Copy audit stops after the first 401/403 | up to 109 of 110 doomed calls avoided |

## Ranked actions

| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Review and deploy `6d7a6df` | Live revised pages | 0 to 5 live URLs | unmeasured review time | next approved release | Website owner | 5 of 5 live URLs contain revised titles and dates |
| 2 | Publish a public supervisor-lab evidence package | Openable sources | 0 to 1 package | unmeasured; source inventory pending | before series drafting | Drew + research owner | Fresh checkout reproduces every published table |
| 3 | Repeat identical measurements | Attribution | 0 to 2 follow-up windows | 2 scheduled runs | day 14 and day 28 after deploy | GTM automation | Store 2 dated Search Console runs and 2 matching Gemini runs |

## Durable notes written

Reuse check: checked: no existing note (grep'd `Search and Answer Visibility|6,714 Google impressions|4 of 73` over `company/gtm`, `.evolve`, and `~/.claude/reflections`).

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|
| `company/gtm/signals/2026-08-01/search-and-answer-visibility.md` | Improve 5 ranking pages before adding 7-post series | false 0 of 73 answer status |

## Self-check

8/8 passed — failed: none.
k-of-n · cost both sides · status label · repeat check · Verdict names one number + one dispatch · actions name lever+target+owner+verification · zero adjectives standing in for counts · words ≤600 outside tables.
