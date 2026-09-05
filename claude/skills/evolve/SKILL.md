---
name: evolve
description: Improve a measured target through diagnosis, experiments, verification, and retained results.
---

# Evolve

Emit an **experiment ledger**, not a narrative. Every experiment row carries `before / after / Δ / n` and a `promote | keep | iterate | reject | abandon` decision that names the numeric rule which decided it. A row without a number is not a result; a decision without its threshold is an opinion.

Use when a metric exists (or can be built) and iterated changes can move it. Do not use for vague quality polish, red CI, or one-off analysis.

## Flow

1. **Read state first** — `.agent/current.json`, `.agent/progress.md`, tail of `.agent/experiments.jsonl`, `docs/EVOLVE-SPEC.md`. Carry forward every open hypothesis and every recorded dead end; a dead end costs its compute once, never twice.
2. **Write the product-value claim** — one sentence per metric: "if this number moves, which user-visible outcome moves with it?" Cannot write it → the metric is wrong, stop. Store at `metricClaims[<metric>]`.
3. **Audit the measurement before trusting it** (10–15 min): read the eval/test runner, call the endpoints, check response shapes, confirm it is not emitting defaults or cached numbers.
4. **Baseline on the real path** — median of ≥3 reps (5 if CV > 20%), before any change, plus the run-to-run noise floor (population stddev of those reps).
5. **Diagnose → exactly 1 hypothesis**, ranked bug-fix > architectural > efficiency > parameter-tuning. If several levers remain, rank them by evidence and information value before selecting one.
6. **Smallest change → prove it is live → measure → compare.** All 3 deployment checks must pass before a score is read (`references/full-reference.md:159-165`); an unverified deploy is the documented failure mode #1.
7. **Decide by the registered comparison rule** — use tested project statistics and the procedure in `references/STATS.md`.
8. **Persist** the row to `.agent/experiments.jsonl` (`schema.md:9-24`), update `current.json` + `progress.md` + `scorecard.json`.
9. **Continue while the target remains unmet and a testable hypothesis remains.** Change the approach after a rejection; never replay an unchanged failure.
10. **Checkpoint before context replacement**, then resume the same active goal from the persisted state.
11. **Self-gate (9 checks), then emit.** State which checks failed.

## Hard rules

| Rule | Why — source |
|---|---|
| **`n=` or `k of n` on every quantity.** Banned as claims: several, many, most, often, repeated, significant, substantial, strong, meaningful, better. | A delta with no `n` cannot be separated from run-to-run noise. |
| **Median of ≥3 reps, 5 if CV > 20%.** Report median + 95% CI, never a bare mean. A target scoring 51/84/84 has median 84, not mean 73. | `references/full-reference.md:212-219` |
| **Keep guard: Δ ≥ 2× the noise floor.** Inside the floor → re-measure once and recompute before believing it. | `references/deterministic-loop.md:55-62` |
| **Compute the experiment decision** using the registered test, useful-effect threshold, and regression limits. Report uncertainty; label unavailable statistics with their reason. | [Comparison procedure](references/STATS.md) |
| **Shipping a winner needs evidence of improvement**, a useful effect, and passing regression limits. Register any allowed quality loss for an efficiency gain in explicit metric units before measuring. | [Promotion decision](references/STATS.md) |
| **`measured \| inferred \| hypothesis` on every row**, with the exact check (command, `path:line`, run id, commit sha) for anything measured. `hypothesis` rows are banned from the Verdict and from any promote decision. | An unverified deploy makes a measured-looking number fiction. |
| **Cost both sides, mandatory:** cost incurred (reps × $ or wall-minutes) + saving if kept (same unit, or the metric's user-facing unit), assumption stated. Unmeasurable → `unmeasured (<reason>)`, never a dropped column. | Reps × targets × per-run cost is knowable before the run (`references/full-reference.md:128-132`). |
| **Evidence is a pointer:** `path:line`, commit sha, run id, or the literal command + its output. "Scores improved" is a defect; `pnpm eval:run → 0.63→0.78 median n=5` is a claim. | — |
| **≤500 words outside tables.** No paragraph >3 lines — if it is longer, it is a table. Delete any ≥24-word sentence containing zero digits. | — |
| **No metric gaming.** If the number moves and the experience feels worse, the metric is wrong — fix the metric, log it as the experiment. Never tune to specific test cases; validate on held-out cases when they exist. | `references/full-reference.md:142-146` |
| **No ceremony.** No self-grade, no "None this round" placeholder sections, no restating the task. Omit an empty section entirely. | — |
| **No fixed round or wall-clock limit.** Stop only at the target, an explicit resource limit, cancellation, or a demonstrated dead end. Silence and context replacement are not stop conditions. | A research loop should stop from evidence or authority, not elapsed time. |

## Output template

Emit exactly this. Omit a section only where its rule says so.

```markdown
# Evolve: <target> — round <r> — <YYYY-MM-DD>

**Verdict:** <metric> <before> → <after> (Δ <x>, n=<reps>) — <k> promoted, <j> reverted. measured|inferred
**Decided by:** <the exact rule, e.g. "bootstrap ciLow=+0.04 > 0 → promote">
**Next:** /<skill> targeting <X> with baseline <Y>

## Target
| Field | Value |
|---|---|
| Metric + direction | <name>, higher\|lower is better |
| Product-value claim | <one sentence: which user-visible outcome moves> |
| Baseline (median, n) | <v> [<ci_low>, <ci_high>], n=<reps>, noise floor <sd> |
| Threshold for done | <v> · gap <Δ> |
| Measurement command | `<exact command>` → `<path>` |

## Experiments — <k> of <queued> run, ranked by Δ; <queued−k> not run: <reason>
| # | Hypothesis → lever | Before | After | Δ | n | Effect / 95% CI | Decision | Rule that decided | Status | Evidence |
|---:|---|---:|---:|---:|---:|---|---|---|---|---|

## Cost ledger
| # | Cost incurred | Saving if kept | Same-unit? | Assumption |
|---:|---:|---:|---|---|

## Deployment verification — every measured row
| # | Change is live (proof) | Measured against changed version | Result structurally valid |
|---:|---|---|---|

## Regressions checked
| Guard | Before | After | Δ | Verdict |
|---|---:|---:|---:|---|

## Not measured
| What | Why | What it would take | Persisted to |
|---|---|---|---|

## Self-gate
<k>/9 passed — failed: <list, or "none">.
1 n= on every quantity · 2 median-of-≥3 · 3 Δ ≥ 2× noise floor on every keep · 4 registered decision rule computed · 5 promotion criteria met · 6 status label per row · 7 cost both sides · 8 evidence is a pointer · 9 words <N> ≤ 500.
```

## Calibration

- **0/10** — "Tried a few prompt tweaks, scores look better, keeping them." 0 numbers, 0 reps, no deploy proof, no revert rule.
- **10/10** — `safety 0.50 → 1.00, Δ+0.50, n=3, d=4.1, p=0.002, bootstrap ciLow=+0.31 → promote (ciLow>0); cost 3 reps × $0.09 = $0.27; saving: 0 compliance flags on the regulated flow; evidence commit a3f9c21 + .agent/runs/evolve-20260320/`.

## Worked examples (non-normative)

| File | What it gives you |
|---|---|
| `references/full-reference.md` | Decompose, audit, diagnose, experiment-design and anti-overfitting long form |
| `references/STATS.md` | Statistical comparison and promotion procedure using tested project tools |
| `references/deterministic-loop.md` | `measure.sh` / `decide.sh` / `playbook.md` harness for unattended runs of 100s of candidates |
| `schema.md` | `experiments.jsonl` fields and examples |

## Log the run

```bash
skill-run-log /evolve --target "<metric> <before>→<after> n=<reps>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

The row is provenance, not evidence: an experiment is supported only by the artifact and commit it cites.

## Then consider

| Condition (numeric) | Next skill | What to pass it |
|---|---|---|
| Primary metric moved < 0.02 (2%) for 2 consecutive rounds and the remaining gap is architectural | `/pursue` | baseline, the 2 flat rounds' Δ, levers already tried |
| `ideas.md` is empty, or ≥3 consecutive hypotheses fall below the registered useful-effect threshold | `/hypothesize` | metric, baseline, and the rejected hypotheses with reasons |
| A result exceeds 3× the noise floor, or a null follows a predicted Δ ≥ 5pp | `/autopsy` | raw per-rep values, measure command, run id |
| ≥5 failure clusters, or >20 failing cases need impact ranking | `/diagnose` | per-cluster failure counts and current baseline |
| CV > 20% at n=5 reps, or the judge separates <2 known-good/known-bad pairs | `/calibrate-before-measure` | metric definition, the 5 rep values, computed CV |
| 0 scored dimensions exist for a subjective target | `/eval-agent` | target, reference material, and ≥5 candidate dimensions |
| ≥3 plateaued rounds and ≥2 candidate architectures merit equal-compute comparison | `/meta-harness` | plateau baseline, the architectures, compute budget |
| ≥1 experiment promoted (`ciLow > 0`) and gap to threshold ≤ 0 | `/finalize`, then `/ship` | promoted commits, before/after numbers, deploy proof |
