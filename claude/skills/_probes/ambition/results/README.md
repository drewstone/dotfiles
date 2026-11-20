# Ambition probe results

## 2026-11-20: the bar-first skills

[`2026-11-20.json`](2026-11-20.json) holds every reply and judgment. Base `99143a9` (the skills before the rebuild); head `e875730`, whose skill text this branch ships unchanged. The agent was `claude-opus-5-5` and the judge `grok-4.7-build`, with 2 samples for each of 15 scenarios across 7 skills.

| Arm | n | Q1 best known result | Q2 target above our number | Q3 mechanism change | All three |
|---|---|---|---|---|---|
| current | 30 | 6/30 (20%) | 5/30 (17%) | 27/30 (90%) | 1/30 (3%) |
| new | 30 | 16/30 (53%) | 25/30 (83%) | 29/30 (97%) | 15/30 (50%) |
| control | 30 | 0/30 (0%) | 5/30 (17%) | 26/30 (87%) | 0/30 (0%) |

Paired by scenario and sample, the discordant replies on each question compare as follows; the p value is McNemar's exact two-sided test.

| Question | New YES, current NO | Current YES, new NO | p | New YES, control NO | Control YES, new NO | p |
|---|---|---|---|---|---|---|
| Q1 | 11 | 1 | 0.0063 | 16 | 0 | 3.1e-05 |
| Q2 | 21 | 1 | 1.1e-05 | 20 | 0 | 1.9e-06 |
| Q3 | 3 | 1 | 0.63 | 4 | 1 | 0.38 |

The pooled row in the JSON summary (35 of 38 discordant items favor new against current, 40 of 41 against control) treats the three questions of one reply as independent. They are not, so read the per-question rows.

On Q1 and Q2 the new text beats both the current text and the length-matched control. Q3 is near saturation in every arm and does not discriminate.

### Judge agreement

[`2026-11-20-current-codex-judge.json`](2026-11-20-current-codex-judge.json) scores the same 30 current-arm replies with `gpt-6.2-astra` through `codex exec`. Codex accounts ran out of room before the other two arms, so the run switched judges.

The two judges agree on 83 of 90 question verdicts (92%):

| Question | Agreement |
|---|---|
| Q1 | 28/30 |
| Q2 | 28/30 |
| Q3 | 27/30 |

### Where the new text still misses

Q1 fails in 14 of 30 new-arm replies.

- **Not named yet (most misses).** The agent promises to find the best published result ("I'll look for published results", "I won't state one until I've read it") instead of naming one. The skill says an invented result is not an answer. This probe gives the agent no tools, so it cannot search.
- **Named without a source.** The rest give a typical figure with no source, such as "suites of comparable size usually run in roughly 10 to 15 minutes".

| Skill | Q1 YES |
|---|---|
| evolve | 2/8 |
| eval-engineering | 1/4 |
| diagnose | 1/4 |

Next measurement: rerun with search tools enabled before tuning the text again. The scenarios are this probe's decision cases, so editing the skill text against them would fit the test set.

## 2026-11-20, second run: search tools, held-out scenarios and the evolve fix

The first run gave the agent no tools, so most Q1 misses were promises to look a result up. This run adds `--agent-tools search`: web search, web fetch and read-only file tools, in a snapshot of the arm's revision of this repository without `_probes/`. It also adds ten held-out scenarios (H01 to H10, four for evolve), committed before any text was tuned, and changes evolve's text against the original fifteen only.

The base for the current arm is `99143a9` in every file, as in the first run. The agent is `claude-opus-5-5`; with tools, `claude-haiku-5-5` also serves the web-fetch summaries. The judge is `grok-4.7-build`, the first run's judge, with 2 samples per scenario.

| File | Tools | New-arm text | Scenarios | Arms |
|---|---|---|---|---|
| [`2026-11-20-tools-prefix.json`](2026-11-20-tools-prefix.json) | search | `78f1746` (head `e9f6840` changed only the probe) | tuned | all three |
| [`2026-11-20-evolve-tuning-none.json`](2026-11-20-evolve-tuning-none.json), [`-tools`](2026-11-20-evolve-tuning-tools.json) | none, search | `2fa6b6e` (evolve fix) | A01 to A04 | new |
| [`2026-11-20-tools.json`](2026-11-20-tools.json) | search | `2fa6b6e` | tuned and held-out | all three |
| [`2026-11-20-none-fixed.json`](2026-11-20-none-fixed.json) | none | `2fa6b6e` | tuned and held-out | all three |
| [`2026-11-20-heldout-evolve-prefix-none.json`](2026-11-20-heldout-evolve-prefix-none.json), [`-tools`](2026-11-20-heldout-evolve-prefix-tools.json) | none, search | `78f1746` | H01 to H04 | new |

### With search tools, final text (`2026-11-20-tools.json`)

Tuned, the 15 original scenarios:

| Arm | n | Q1 best known result | Q2 target above our number | Q3 mechanism change | All three |
|---|---|---|---|---|---|
| current | 30 | 7/30 (23%) | 12/30 (40%) | 26/30 (87%) | 4/30 (13%) |
| new | 30 | 28/30 (93%) | 25/30 (83%) | 29/30 (97%) | 22/30 (73%) |
| control | 30 | 18/30 (60%) | 17/30 (57%) | 30/30 (100%) | 13/30 (43%) |

Held-out, the 10 new scenarios, never used to edit text:

| Arm | n | Q1 best known result | Q2 target above our number | Q3 mechanism change | All three |
|---|---|---|---|---|---|
| current | 20 | 4/20 (20%) | 4/20 (20%) | 17/20 (85%) | 0/20 (0%) |
| new | 20 | 18/20 (90%) | 17/20 (85%) | 20/20 (100%) | 15/20 (75%) |
| control | 20 | 13/20 (65%) | 10/20 (50%) | 19/20 (95%) | 9/20 (45%) |

Paired by scenario and sample, with McNemar's exact two-sided p:

| Split | Question | New YES, current NO | Current YES, new NO | p | New YES, control NO | Control YES, new NO | p |
|---|---|---|---|---|---|---|---|
| tuned | Q1 | 21 | 0 | 9.5e-07 | 11 | 1 | 0.0064 |
| tuned | Q2 | 14 | 1 | 0.00098 | 10 | 2 | 0.039 |
| tuned | Q3 | 3 | 0 | 0.25 | 0 | 1 | 1.0 |
| held-out | Q1 | 14 | 0 | 0.00012 | 5 | 0 | 0.063 |
| held-out | Q2 | 14 | 1 | 0.00098 | 8 | 1 | 0.039 |
| held-out | Q3 | 3 | 0 | 0.25 | 1 | 0 | 1.0 |

With tools, Q1 follows search. Every new-arm Q1 YES came from a reply that ran a web search: 28 of the 29 tuned replies that searched, and 18 of 18 held-out. The new arm searched in 29 of 30 tuned replies, the current arm in 3 and the control in 15. Every control reply that searched also scored Q1 YES. The tools prompt is the same in every arm, so the control can search too; that is why the control rose from 0/30 without tools to 18/30. The new text still beats it on Q1 and Q2 on the tuned set. On the held-out set it beats it on Q2, and on Q1 by 5 to 0 (p = 0.063).

The same text without tools, from [`2026-11-20-none-fixed.json`](2026-11-20-none-fixed.json):

| Split | Arm | Q1 | Q2 | Q3 | All three |
|---|---|---|---|---|---|
| tuned | current | 6/30 | 5/30 | 27/30 | 1/30 |
| tuned | new | 21/30 | 26/30 | 29/30 | 20/30 |
| tuned | control | 0/30 | 5/30 | 26/30 | 0/30 |
| held-out | current | 4/20 | 4/20 | 19/20 | 0/20 |
| held-out | new | 17/20 | 17/20 | 20/20 | 15/20 |
| held-out | control | 0/20 | 3/20 | 17/20 | 0/20 |

The tuned no-tools rows reuse the first run's cached replies wherever the text is unchanged, so only evolve's rows differ from the first run.

### Evolve

**Why it missed.** In the first run's evolve replies, Q1 failed in 6 of 8:

- Four deferred the result: "I'll look for published results … I won't state one until I've read it" (A02, A04).
- Two said an internal set has no published state of the art and used an oracle-retrieval ceiling instead (A01).

With tools and unchanged text (`2026-11-20-tools-prefix.json`), all 8 named one. Six searched, and both A01 replies read the linked `be-ambitious` skill and then named a published retrieval result. Evolve's own step 1 named neither the kinds of source nor what to do without search; that detail sat behind the link.

**Fix** (`2fa6b6e`, tuned on A01 to A04 only). Step 1 now lists the sources: the nearest public benchmark's leader, a paper's number, a rival system's result. It says an internal set still has that outside bar, and that an oracle or human-agreement ceiling is our limit, not the bar. It also says to search first, or, without search, to write the strongest known result with its source, marked to verify.

| Evolve replies (new arm) | Q1 before → after | All three before → after |
|---|---|---|
| Tuned, no tools | 2/8 → 7/8 (5 vs 0 discordant, p = 0.063) | 2/8 → 7/8 |
| Tuned, tools | 8/8 → 8/8 | 8/8 → 7/8 (one Q2 miss, A04) |
| Held-out, no tools | 6/8 → 8/8 (2 vs 0) | 5/8 → 8/8 |
| Held-out, tools | 8/8 → 8/8 | 7/8 → 7/8 |

The fix matters when the agent cannot search. With search, evolve was already at the ceiling on Q1. The held-out misses before the fix were the same deferral ("I won't quote figures from memory", H02; "I'll look up published product-search results", H04).

### Noise and what still misses

Between the two tools files, the 22 non-evolve new-arm replies have byte-identical skill text but were sampled again, because the snapshot changed. Q1 went from 21/22 to 20/22 and all three from 18/22 to 15/22. Read a difference of about 3 in 22 as sampling noise.

In the final tools file, the new arm still misses in two places:

- **Q2 in eval-engineering, 6 of 6 replies (A07, A08, H05).** The replies set targets on the evaluation's own agreement or false-pass rate, not on the product number the task states, and the rubric's Q2 counts only the stated number. This is a rubric question for evaluation-building tasks. It is not changed here.
- **Q1 in diagnose, 3 of 6 (A13 sample 0, both H06 replies).** The tasks concern a pipeline's on-time rate and a CI suite's duration, and the agents found no public benchmark for either. A13 sample 0 also deferred.

### Judge

All verdicts are from `grok-4.7-build`, the judge of the first run. No sample was rescored by a second family: `codex exec` had no account capacity, and the `gemini` CLI is not authenticated here. On nine calls the judge stopped with "max turns reached"; those calls were retried from the cache until every reply had a verdict.
