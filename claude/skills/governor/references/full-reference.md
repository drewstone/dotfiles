---
name: governor-worked-examples
description: "Non-normative worked examples for /governor. SKILL.md is the single normative contract; nothing here overrides it."
---

# Governor — worked examples

`SKILL.md` holds every rule, the dispatch table, and the output template. This file only shows filled-in instances of them.

## Example: a 10/10 emitted artifact

```markdown
Next: /pursue — row 12: 3 Δs of 0.008 / 0.012 / 0.004, each < 1% threshold. Target: `src/lib/prompt-planner.ts` capability inference. First check: `tail -3 .agent/experiments.jsonl`.

## State read
| Source | Rows / mtime | Signal extracted |
|---|--:|---|
| `.agent/experiments.jsonl` | 47 rows, 2026-07-26 | last 3 Δ: 0.008, 0.012, 0.004 |
| `.agent/governor.jsonl` | 12 rows | priorChain /evolve → /evolve → /evolve |
| `.agent/reflections/` | 1 file, 4 runs ago | row 9 at 4 < 5, does not fire |
| `gh pr checks` | 7 checks, 0 failing | row 1 does not fire |

## Signals
| Row | Signal | Measured | Threshold | Fires | Status | Check |
|--:|---|--:|--:|:-:|---|---|
| 1 | CI red | 0 of 7 failing | ≥1 | no | measured | `gh pr checks` |
| 9 | Reflection due | 4 runs | ≥5 | no | measured | `wc -l .agent/skill-runs.jsonl` |
| 12 | Plateau | max Δ 1.2% over 3 | <1% each | no→see note | measured | `tail -3 .agent/experiments.jsonl` |
| 17 | Exploit | 0 KEEP in last 2 | ≥3% ×2 | no | measured | same tail |

Note: row 12 fires on the 2 sub-1% runs plus a 1.2% outlier inside CV 18% → treated as plateau, stated as inferred.

## Rejected — top 2
| Skill | Measured | Threshold | Why it lost |
|---|--:|--:|---|
| `/evolve` | 0 KEEP in last 2 | ≥3% ×2 | row 17 needs 2 KEEPs; last 2 are ITERATE |
| `/meta-harness` | 0 pursue rounds | ≥3 | row 14 needs 3 prior `/pursue` rounds |

## Brief for /pursue
| Field | Value |
|---|---|
| Reason | row 12: 3 Δs < 1% on accuracy |
| Prior chain | /evolve → /evolve → /evolve (oscillating: no) |
| Scope | `src/lib/prompt-planner.ts` |
| Cost | spends ~25 turns · saves ~40 turns of further sub-1% evolve rounds · assumption: 8 turns/evolve round, measured on 5 prior rounds |
| First check | `tail -3 .agent/experiments.jsonl` |
| Ends with | its own dispatch line |

## Self-gate
8/8 passed — failed: none.
```

## Example: the 0/10 it replaces

`{"decision":"pursue_then_evolve","reason":"<1,200 chars of prose, 0 digits>"}` — two skills in one token, no `priorChain`, no cost, no threshold. 939 of 1,705 logged decisions looked like this.

## Example: repo-shape adapters

When a repo already tracks state elsewhere, record the mapping once in `.agent/governor-config.json` so following skills read the same paths.

| Repo has | Read that instead of `.agent/` |
|---|---|
| `docs/decisions/` (ADRs) | reflections as ADRs there |
| `.bench/baseline.json` | as the scorecard; skip `.agent/scorecard.json` |
| GitHub Project / Linear | as the goal source; decisions written back as tasks |
| CI-green as the only metric | rows 1 and 5 only until a quality dimension exists |

## Example: dispatch brief prose form

> Dispatched by `/governor`, row 12. Last 3 `/evolve` rounds on the capability-hit metric returned 0.008, 0.012, 0.004 — under the 1% plateau threshold, so keyword matching is exhausted. Prior chain: /evolve ×3. Scope: `src/lib/prompt-planner.ts`. End with your own dispatch line.
