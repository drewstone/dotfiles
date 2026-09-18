# Reflect: agent-app release project — 2026-08-29 — n=1 session

**Verdict:** Source verification fell from 3 to 1 executions per release, measured on releases 0.46.20 and 0.46.21.
**Biggest cost this period:** 1,128 runner-seconds to finding #1.
**Next:** /evolve targeting the real GTM prompt with baseline 0 of 2 successful retries.

## Corpus

| Field | Value |
|---|---|
| Sessions inspected | n=1, 2026-08-29 |
| Sources | PRs #493 and #495; runs 33268517858, 33268517871, 33268831079, 33270511974, 33271313270, 33271632339 |
| Prior reflections read | 3: 2026-08-11 router; 2026-06-24 fleet; 2026-06-23 agent-app |
| Not inspected | GitHub runner billing; n=9 open cross-repo actions from prior reflections |

## Findings — top 3 of 4, ranked by cost × occurrences

| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | One release ran the source path 3 times | 3 of 3 paths | 1,128 runner-sec | 670 runner-sec/release | measured | runs 33268517858, 33268517871, 33268831079 | PR #493 uses 1 main artifact | done |
| 2 | The tag rebuilt bytes already tested on main | 1 of 1 old tag | 412 runner-sec | 394 runner-sec/release | measured | run 33268831079 → 33271632339 | verify and publish the main artifact | done |
| 3 | Upload output omitted the API digest prefix | 1 of 1 first live runs | 431 runner-sec | 431 runner-sec/occurrence | measured | run 33270511974, step 22 | PR #495 normalizes once | done |

1 finding dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections

| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|
| Publish-only format defects | 2026-06-23 | 2 sessions | auto-publish plus dry-run | no live cross-run artifact existed | no; threshold is 3 |
| Verify the published artifact | 2026-06-23 | 2 sessions | npm and tarball checks | held: 2 of 2 SHA-512 values matched | no |

## Measurements

| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|
| Source executions/release | 3 | 1 | -2 (-66.7%) | 2 releases | measured | runs above |
| Observed verification runner time | 1,128s | 458s | -670s (-59.4%) | 2 releases | measured | job timestamps |
| Tag verification | 412s | 18s | -394s (-95.6%) | 2 tags | measured | package_release jobs |
| Main event to last publisher | 872s | 515s | -357s (-40.9%) | 2 releases | measured | workflow timestamps |
| Published tarballs matching source artifact | unmeasured | 2 of 2 | +2 | 2 packages | measured | SHA-512 comparison |

## Keep doing

| Practice | Evidence it worked | Number |
|---|---|---:|
| Block on live deployment | local checks missed the digest shape; run 33270511974 found it before npm | 0 packages exposed |
| Fail before download or publish | identity, digest, expiry, provenance, and checksums passed in order | 6 checks |

## Ranked actions

| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|
| 1 | Adopt agent-app 0.46.21 in GTM | production source fix | 0 of 2 → 1 of 1 prompt retries | 1 PR | now | Codex | live authenticated prompt |
| 2 | Promote Sidecar release #6445 | sealed-message fix | 0 of 2 → 1 of 1 retries | 1 merge | now | Drew | live artifact meets campaign bar |
| 3 | Revalidate prior cross-repo actions | untriaged carry-forward | 9 → 0 untriaged | unmeasured | next matching scope | Codex | update each source reflection |

## Durable notes written

Reuse check: extended `AGENTS.md:198` and `docs/SIGNOFF.md:87`; no duplicate note added.

## Self-gate

8/8 passed — failed: none.
k-of-n · cost both sides · status label · repeat check · Verdict names 1 number and 1 dispatch · actions name lever, target, owner, and verification · zero adjectives replace counts · words 146 ≤ 600 outside tables.
