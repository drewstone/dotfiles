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
