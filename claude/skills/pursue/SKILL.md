---
name: pursue
description: Replace a plateaued approach with a coherent architecture; build, test, compare, and hand off.
---

# Pursue

Ship a working generation with a measured baseline-vs-new table. Not a proposal, not a refactor. If the plateau metric has no number before and after, the pursuit did not happen.

Use after a measured approach plateaus at ≤2% improvement across ≥2 cycles.
Do not use for the first metric improvement, a target change, or fixed-rubric cleanup.

## Flow

1. **Read state before code.** `.agent/current.json`, `.agent/progress.md`, newest `.agent/pursuits/*.md`, tail `.agent/experiments.jsonl`. Resume any non-terminal generation; age does not make it stale. Never open a second generation in flight.
2. **Re-seed the baseline.** Median of ≥3 runs of the plateau metric. >10% drift vs recorded → re-measure before designing; a generation built on a stale baseline regresses on re-measurement, not on merit. Spread >10% of mean → 5 more runs, or declare the metric too noisy and fix measurement first.
3. **Write the product-value claim.** One sentence: if this number moves, which user-visible outcome moves with it. Can't write it → the metric is wrong; rescope and stop.
4. **Run a tournament, ≥2 architectures.** Use any recorded candidate portfolio. Argue candidates against each other, select by predicted leverage, and graft from runners-up. Record one 10× candidate as adopted or rejected with a reason.
5. **Match the codebase before writing.** For each API touched, read 3 existing callsites and match imports, auth wrapper, error handling, logging, file layout. `bash ${SKILL_DIR}/preflight.sh <pattern1> <pattern2>`
6. **Review gate — blocking if any of 6 fire:** touches auth/crypto/TLS/trust boundary · billing/credits/payments · lifecycle create/delete/provision · new or changed external endpoint · new concurrency, locking, or shared mutable state · diff >5 files or >300 lines. All-no → record `Review gate: passed (all-no)`. Blocking → adversarial review in parallel (security, reliability, performance, red team), each returning verdict + severities + would-block; pick the plan with no hole (8/8/8/8 beats 9/9/9/3).
7. **Build the whole generation, then test.** 5–20 coordinated changes, ≥1 architectural. No A/B on coupled changes. No TODO on a critical path — 2 of 3 files built is debt, not a generation.
8. **Diff-audit before evaluation.** Run `bash ${SKILL_DIR}/diff-audit.sh`. Fix every CRITICAL and HIGH; skip only for a one-file reversible change.
9. **Measure new vs baseline on the same harness**, n≥3 runs each side, then persist: artifact to `.agent/pursuits/<date>-<slug>.md`, append `.agent/experiments.jsonl`, update baselines, set `.agent/current.json` `{mode:"evolve", generation:N, activePursuit:null}`.
10. **Self-gate (10 checks), then emit the template.** Report which checks failed.

## Hard rules

| Rule | Why (measured: n=3,671 pursuit artifacts, n=760 run rows) |
|---|---|
| **≤700 words outside tables.** No paragraph >3 lines — if it is longer, it is a table. | Median 638 words, max 8,435; 1,411/3,671 (38%) contained 0 table rows. |
| **Baseline-vs-new table is the deliverable.** The metric that defined the plateau, before, after, Δ, n each side, same harness. No table → no pursuit. | Only 738/3,671 (20%) carried a Δ inside a table; 2/760 run rows (0.3%) logged any machine-readable baseline key. |
| **`k of n` or `n=` on every quantity.** Banned as claims: significant, substantial, several, many, most, often, repeated, strong, meaningful. | 676/3,671 (18%) used one of those 9 words in place of a count. |
| **`measured \| inferred \| hypothesis` on every row**, with the exact check (command, `path:line`, run id). `hypothesis` rows are banned from Verdict and Dispatch. | 696/3,671 (19%) carried any status label. |
| **Cost both sides:** build cost (turns, hours, files, net lines, $) + saving if it ships, same unit, assumption stated. `unmeasured (<reason>)` is allowed; dropping the column is not. | 1,750/3,671 (48%) mention cost at all; 0/3,671 state both sides. |
| **Evidence is a pointer**, never a summary: `path:line`, PR#, run id, or the literal command + its output. "Tests passed" is a defect; `vitest run pkg → 1,478/1,484` is a claim. | — |
| **Kill condition + rollback named before Build**, as a number and a command. | 505/3,671 (14%) named either one. |
| **≥2 architectures in contention**, losers recorded with the reason they lost. | 785/3,671 (21%) recorded any alternative; one candidate is parameter tuning, not architecture selection. |
| **Show every regression.** Any metric that moved the wrong way appears in the same table as the wins. | — |
| **Don't collapse ambition on a marginal 1st measurement**; don't ship partial scaffolding as a generation; delete obsolete paths instead of adding compat layers in greenfield code. **No ceremony:** no self-grade on an unanchored scale, no "None this session" placeholder section, no restating the task back. | — |

## Output template

Emit exactly this. Omit a section only where its own rule says so.

```markdown
# Pursue: <goal> — Gen <N> — <YYYY-MM-DD>

**Verdict:** ADVANCE | PARTIAL | REVERT — <plateau metric> <before> → <after> (Δ <±x%>, n=<k> runs each side, measured)
**Cost:** <build cost + unit> · **Saving if shipped:** <same unit> (assumption: <one line>)
**Next:** /<skill> targeting <X> against baseline <Y>

## Plateau → generation
| Field | Value |
|---|---|
| Plateau metric | <name> — product value: <one sentence> |
| Plateau evidence | <k> measured cycles, best Δ +<x>%, <run ids / paths> |
| Baseline (re-seeded) | median <v>, n=<k> runs, spread ±<x>%, <command> |
| Thesis | <one sentence: why Gen N is structurally different> |
| Moonshot | <10× idea> — adopted / rejected: <reason> |
| Kill condition | <number that ends this generation> · rollback: <command or commit> |

## Tournament — <k> architectures
| # | Architecture | Predicted leverage | Chosen | Why it lost / what was grafted |
|---:|---|---:|---|---|

## Changes — <k> shipped, <j> architectural
| # | Change | Files | Net lines | Coupled to | Status |
|---:|---|---:|---:|---|---|

## Baseline vs new
| Metric | Baseline | Gen <N> | Δ | n each | Status | Evidence |
|---|---:|---:|---:|---:|---|---|

## Gates
| Gate | Result | Evidence |
|---|---|---|
| Review gate | blocking (<which of 6>) / passed (all-no) | <path:line> |
| Adversarial review | <k> concerns, <j> would-block, <m> closed | <path> |
| Diff audit | CRIT <k> / HIGH <j>, all fixed | <path or run id> |
| Tests · typecheck · build | <pass>/<total> | <command → output> |

## Not measured
| What | Why | Risk if the assumption is wrong |
|---|---|---|

## Self-gate
<k>/10 passed — failed: <list, or "none">.
1 BLUF names metric+Δ+n · 2 baseline re-seeded n≥3 · 3 product-value claim written · 4 ≥2 architectures · 5 k-of-n on every quantity · 6 status label on every row · 7 cost both sides · 8 evidence is a pointer · 9 regressions shown · 10 ≤700 words.

## Next action
/<skill> — triggered by <condition + its number> — passing <artifact>
```

## Calibration

- **0/10** — `.evolve/pursuits/2026-07-15-infrastructure-intent-and-reliability-audit.md`: 3,809 words (5.4× cap), 0 table rows, no baseline-vs-new, no Δ, no kill condition.
- **10/10** — `.evolve/pursuits/2026-06-27-appworld-spotify-route-audit-r93.md`: 343 words, 11 table rows, 2.25 numerals/line, evidence as run ids.

## Log the run

```bash
skill-run-log /pursue --target "<goal> gen <N>" --verdict <ADVANCE|PARTIAL|REVERT> --next /<skill-or-stop>
```

267/760 past rows (35%) logged no verdict and 746/760 (98%) had no `--next`, so automatic chaining could not read them. Both flags are required; the row is provenance, not evidence.

Worked examples, non-normative: `references/full-reference.md`.

## Then consider

| Condition (numeric) | Next skill | What to pass it |
|---|---|---|
| Δ ≥ +5% on the plateau metric and it is still moving | `/evolve` | new baseline and the ≤3 tunable knobs left |
| Δ < +2% and this is pursue cycle ≥3 on the same metric | `/breakout` | the mechanism behind the ceiling and all 3 Δs |
| Tournament field <2 architectures at step 4 | `/hypothesize` | the binding constraint and candidates already rejected |
| ≥2 surviving architectures share 0 files | `/multi-pursue` | 1 track specification each and the shared measurement command |
| Δ ≤ 0 and n < 3 per side, or the CI spans 0 | `/autopsy` | raw per-run rows and the exact measurement command |
| Δ ≤ 0 at n ≥ 3 but the design ran below its assumed scale | `/dont-collapse-the-architecture` | the assumed regime and the tested regime |
| Diff audit CRIT+HIGH > 0 unfixed | `/critical-audit` | `--diff-only` and the branch name |
| Verdict ADVANCE and ≥1 rubric dimension fails | `/polish` | the rubric and failing dimensions |
| Subjective plateau metric has 0 judges | `/eval-agent` | the product-value claim and 10 rated examples |
