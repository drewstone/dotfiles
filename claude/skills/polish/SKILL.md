---
name: polish
description: Apply a fixed quality rubric and fix gaps in behavior, design, tests, and public APIs.
---

# Polish

Fixed-rubric hardening pass on work that already exists and already runs. The output is a rubric table with `PASS`/`FAIL` per criterion and the exact check that decided it, plus gaps ranked by user-visible impact. A criterion with no command run is `FAIL — unchecked`, never `PASS`.

Not this skill: a number to move → `/evolve`. Red suite → `/converge`. Behavior not built yet → `/pursue`.

## Flow

1. **Gate entry.** Run the suite. ≥1 failing test → stop, dispatch `/converge`. <100% of the described behavior implemented → `/pursue`.
2. **Run ≥1 check per criterion** across the 5 below (check catalog + prose mappings: `references/RUBRIC.md`). Record the literal command and its output.
3. **List gaps ranked by user-visible impact** = callers/users hit (`n=`) × severity. Never ranked by fix effort.
4. **Fix in rank order**, ≤5 rounds. Parallel subagents for independent gaps; the operator re-runs every check itself.
5. **Re-run all 5 checks.** A regression you introduced outranks every open gap.
6. **Self-gate (8 items), then emit**, naming which items failed.

The 5 criteria: **Correctness** (breaks on which input?) · **Design** (which abstraction is unjustified?) · **Robustness** (which failure is silent?) · **Tests** (which regression would slip through?) · **API surface** (what must a caller know that they shouldn't?).

## Hard rules

| Rule | Why |
|---|---|
| **`PASS`/`FAIL` only — no 1–10 score, no target score.** | The prior round template emitted 5 scores and 0 commands (`git log -p -- skills/polish/`); a 7-vs-8 carries ~0 bits and cannot be wrong. |
| **Every `PASS` names the command + its output.** No command → `FAIL — unchecked`. | "Tests pass" is unfalsifiable; `vitest run pkg → 41/41, 0 skipped` is a claim. |
| **`k of n` or `n=` on every quantity.** Banned as claims: several, many, most, often, repeated, significant, substantial, strong, meaningful, all cases. | The prior file made 3 quantity claims ("all cases", "every issue", "most code starts at 5-7") with 0 denominators. |
| **`measured \| inferred \| hypothesis` on every gap row**, with the exact check for `measured`. `hypothesis` rows are banned from the Verdict and from the top-3 fix queue. | An unlabeled gap gets fixed at the same priority as a guess. |
| **Cost both sides, same unit:** cost incurred now (failures/week, caller-minutes, reruns, $) + saving if fixed, assumption stated. `unmeasured (<reason>)` is allowed; dropping the column is not. | Without it "ranked by impact" is ranked by taste. |
| **Evidence is a pointer:** `path:line`, PR#, run id, or command + its output. A prose summary of evidence is a defect. | — |
| **≤450 words outside tables.** No paragraph >3 lines — if it is longer, it is a table. | Round reports grow into essays; the decision is 5 cells wide. |
| **No fluff fix:** comments restating code, docstrings on private helpers, cosmetic renames. Every fix names the behavior it changes or the reader-cost it removes. | — |
| **≤5 rounds.** Round 6 does not exist: emit `HOLD` naming the blocking criterion. **Broken test stops everything** until fixed. | — |

## Output template

Emit exactly this. Omit a section only where its rule says so.

```markdown
# Polish: <target> — round <r>/5 — <k>/5 PASS

**Verdict:** SHIP | HOLD — <k>/5 criteria PASS, <g> open gaps, top gap costs <number + unit>.
**Blocking:** <criterion> — <gap in one line> (<path:line>)
**Next:** /<skill> targeting <X>

## Rubric
| # | Criterion | Verdict | Check run (command or path:line) | Result | Status |
|---:|---|---|---|---|---|
| 1 | Correctness | | | | measured |
| 2 | Design | | | | |
| 3 | Robustness | | | | |
| 4 | Tests | | | | |
| 5 | API surface | | | | |

## Gaps — top <k> of <total>, ranked by user-visible impact
| # | Gap | Criterion | Who it hits | Cost incurred | Saving if fixed | Status | Evidence | Fix | Round |
|---:|---|---|---:|---:|---:|---|---|---|---:|

<total−k> gaps below the impact bar: <name them in one line>.

## Fixed this round
| Gap # | Change (path:line) | Check proving it | Before → After |
|---:|---|---|---|

## Regressions
| Test | Was | Now | Fixed in |
|---|---|---|---|

Omit if green; instead one line: `<cmd> → <p>/<t> pass, 0 new failures`.

## Self-gate
<k>/8 passed — failed: <list, or "none">.
1 PASS/FAIL only, no scores · 2 every PASS carries command+output · 3 k-of-n on every quantity · 4 status label on every gap row · 5 cost both sides · 6 evidence is a pointer · 7 ranked by user-visible impact not effort · 8 words <N> ≤ 450.
```

## Calibration

- **0/10** — `Round 2 — Score: 8/10 · Correctness: 8/10 — solid, edge cases mostly handled.` 5 scores, 0 commands, 0 pointers, 0 denominators; nothing here can be wrong.
- **10/10** — `Tests | FAIL | vitest run sdk/tests/retry.test.ts → 12/12 pass | 0 of 12 assert the timeout path; deleting the timeout branch keeps 12/12 green | measured`. One row, one command, one falsifiable claim, one named regression it fails to catch.

## Dispatch

| Condition (threshold) | Next skill | Pass it |
|---|---|---|
| 5/5 PASS, 0 open gaps above the bar | `/ship` | rubric table + the green suite command |
| ≥1 FAIL after round 5 | `/pursue` | blocking criterion + ranked gap rows |
| ≥1 failing test at entry or after any round | `/converge` | failing test names + the exact command |
| Gap needs a number moved, baseline + target stated | `/evolve` | metric, baseline value, target value |
| ≥2 gaps in one file are duplication or dead code | `/deep-clean` | file list + the duplicate pairs (`path:line`) |
| ≥1 gap on an auth, crypto, or input-parsing path | `/harden` | `path:line` + the untrusted input it accepts |
| ≥1 gap is on visible UI | `/product-design-audit` | route + screenshot path |
| The 5 criteria caught 0 of the domain's known failure modes | `/eval-agent` | 3 reference artifacts + the missed failure mode |

## Log the run

```bash
skill-run-log /polish --target "<target> <k>/5 PASS" --verdict <VERDICT> --next /<skill-or-stop>
```

The log line is provenance, not evidence: a `PASS` is supported only by the command it cites.
