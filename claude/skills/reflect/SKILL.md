---
name: reflect
description: Turn work already done into a quantified findings artifact with costs, repeat-checks, and dispatchable actions.
---

# Reflect

Produce an analyst artifact, not an essay. Every finding carries a count, a cost, and a fix with an owner. If a claim has no number, it is not a claim.

Scopes: **session** (this conversation + its artifacts) · **project** (one repo's history, PRs, gates, outcomes) · **portfolio** (many repos; see `references/full-reference.md`).

## Flow

1. **Read the past first.** `~/.claude/reflections/INDEX.md` + the last 3 reflections for this scope. Carry forward every open action. Skipping this is why 38 of 74 past reflections re-raised the same 3 projects.
2. **Collect ground truth.** Transcripts, `git log`, PRs (`gh-drew`), test/gate output, release state, operator corrections. Record what you did NOT inspect.
3. **Separate** observed fact · repository history · interpretation. Label every row `measured | inferred | hypothesis`.
4. **Rank findings by cost × occurrences.** Report the top k; state how many you dropped.
5. **Check reuse before writing any durable note** — grep repo `CLAUDE.md`, `AGENTS.md`, and the memory dir. If the rule already exists, cite `file:line` and write nothing.
6. **Self-gate, then emit.** All 8 checks below; the artifact states which failed.

## Hard rules

| Rule | Why (measured over 96 past reflections) |
|---|---|
| **≤600 words** outside tables (session) / ≤1,200 (portfolio). No paragraph >3 lines — if longer, it is a table. | Median 937 words, max 5,174; the best artifact clears the bar in 394. |
| **`k of n` or `n=` on every quantity.** Banned as claims: repeated, often, several, many, most, significant, meaningful, substantial, strong. | Only 38/96 carried any percentage; 13/96 any `n=`. |
| **`measured \| inferred \| hypothesis` on every row**, with the exact check (command, `path:line`, session id) for anything measured. `hypothesis` rows are banned from Verdict and Ranked actions. | 63/100 stated no measurement status at all. |
| **Cost, both sides, mandatory:** cost incurred (hours, turns, reruns, reverted PRs, $) + saving if fixed, same unit, assumption stated. Unmeasurable → `unmeasured (<reason>)`, never dropped. | `cost`/`hour`/`n=`/`median` appeared 0 times in the old skill. |
| **Evidence is a pointer, not a summary.** `path:line`, PR#, session id, or the literal command + its output. "The tests passed" is a defect; `vitest run pkg → 41/41` is a claim. | — |
| **No self-grade.** | 76 logged grades: median 7.5, 72% inside 7.0–8.5 → ~0 bits, 16.2% of words. |
| **Banned sections:** Run Grade, Dimension\|Score\|Evidence rubric, Session Flow Analysis, Project Health, Cross-Project Patterns, Product Signals, Skill Effectiveness, Proposed Automations, Operator Taste, Recursive Note. | Six of these = 25.7% of corpus words; Session Flow Analysis appeared in 69/100 files. |
| **No placeholders.** Omit any section that would read "None from this session". Delete any ≥24-word sentence containing zero digits. | 40 such sentences existed, all inside banned sections. |
| **New skill only at ≥5 independent sessions** with the same outcome-defined failure, no existing skill covering it, and a measurable comparison. | — |

## Output template

Emit exactly this. Omit a section only where its rule says so.

```markdown
# Reflect: <scope> — <YYYY-MM-DD> — n=<sessions inspected>

**Verdict:** <what is true now + the single decision-relevant number + measured|inferred>
**Biggest cost this period:** <number + unit> to finding #<k>.
**Next:** /<skill> targeting <X> with baseline <Y>

## Corpus
| Field | Value |
|---|---|
| Sessions inspected | n=<N>, <start>–<end> |
| Sources | <exact paths / git range / PR#s> |
| Prior reflections read | <k>: <paths> |
| Not inspected | <what, why> |

## Findings — top <k> of <total>, ranked by cost × occurrences
| # | Finding | Occurs | Cost incurred | Saving if fixed | Status | Evidence | Fix | Owner |
|---:|---|---:|---:|---:|---|---|---|---|

<total−k> findings dropped below the cost×occurrence bar.

## Repeat check — vs the last 3 reflections
| Finding | First seen | Times raised | Prior fix | Why it did not hold | Escalate? |
|---|---|---:|---|---|---|

If none: "0 repeats across the 3 paths listed above." Anything at ≥3 unresolved raises belongs in the Verdict as a systemic failure.

## Measurements
| Metric | Before | After | Δ | n | Status | Source |
|---|---:|---:|---:|---:|---|---|

## Keep doing
| Practice | Evidence it worked | Number |
|---|---|---:|

Omit entirely if no row carries a number.

## Ranked actions
| # | Action | Lever it moves | Expected Δ | Effort | By when | Owner | Verification |
|---:|---|---|---:|---|---|---|---|

## Durable notes written
Reuse check: "extended <path>" | "checked: no existing note (grep'd '<pattern>' over <dir>)"

| Path | Claim (≤120 chars) | Supersedes |
|---|---|---|

## Self-gate
<k>/8 passed — failed: <list, or "none">.
k-of-n · cost both sides · status label · repeat check · Verdict names one number + one dispatch · actions name lever+target+owner+verification · zero adjectives standing in for counts · words <N> ≤ cap.
```

## Calibration

- **0/10** — `skills/.evolve/reflections/2026-06-01-093016-tangle-skills-trace-mining.md`: 5,174 words, 0 tables, 1 ratio, 0 percentages, 74% digit-free sentences, self-scored 8.6/10.
- **10/10** — `starter-foundry-canary/.evolve/reflections/2026-04-02.md`: 394 words, `Metric|Value` table, ranked `Priority|Action|Why` table, 9 ratios, 5 percentages.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A per-skill `operatorOverride` rate exceeds 30% over n ≥ 10 runs | `/governor` | the skill name, its override rows, and the SKILL.md path to edit |
| ≥2 candidate next actions and no clear winner | `/governor` | the findings artifact + the objective to route against |
| A measurable process metric has a named lever | `/evolve` | the metric, its baseline, and the lever |
| ≥5 findings share one root cause | `/diagnose` | the finding list + the shared symptom |
| The top action needs ≥3 heterogeneous skills wired into one plan | `/orchestrate` | the action, its stages, and the verification barrier between them |
| ≥1 finding is an unproven claim | `/verify` | the claim + the command that would prove it |
| Findings are recorded and the session ends | `/handoff` | the reflection path + the open loops with next actions |

## Log the run

```bash
skill-run-log /reflect --target "<scope> n=<N>" --verdict <VERDICT> --next /<skill-or-stop>
```

The row is provenance, not evidence: a finding is supported only by the artifact it cites.
