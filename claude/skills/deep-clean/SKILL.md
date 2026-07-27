---
name: deep-clean
description: Remove dead code, cycles, weak types, duplication, obsolete paths, and needless complexity.
---

# Deep Clean

Delete weight; prove nothing broke. Every deletion ships with the grep that proved it dead (command + `0` count) and the gate that proved the capability survived (`file::test → k/n`). A deletion missing either is a defect, not a cleanup. Output is the table below, not a narrative.

## Flow — 5 phases, strictly serial

| # | Phase | Work | Gate before the next phase |
|---:|---|---|---|
| 0 | Measure | run the command table, write `.agent/deep-clean-baseline.json` | every metric has a number; 0 metrics estimated |
| 1 | Structure | cycles, one canonical module per capability, import direction | `madge --circular` → 0; tests + `tsc --noEmit` → 0 errors |
| 2 | Strengthen | weak types, dead code, test integrity, error paths | tests + types + build |
| 3 | Polish | AI slop, deprecated paths, the project's own formatter | tests + types + build + lint |
| 4 | Re-measure | re-run all Phase-0 commands, emit the template | pass rate ≥ Phase-0 pass rate; build green |

Parallel subagents inside 1 phase (non-conflicting files) are fine. Across phases never: Phase 1 rewrites the import graph Phase 2 reads; Phase 2 removes code Phase 3 reads.

## Phase 0 commands — record exact output, never a summary

| Metric | TypeScript | Python | Rust |
|---|---|---|---|
| type errors | `npx tsc --noEmit` | `mypy .` | `cargo check` |
| dead exports/files/deps | `npx knip --reporter json` | `vulture .` | `cargo +nightly udeps` |
| cycles | `npx madge --circular src/` | `pydeps --show-cycles` | — |
| duplication | `npx jscpd --min-lines 6 --min-tokens 50 src/` | `jscpd` | `jscpd` |
| escape hatches | `grep -rEn "as any\|: any\|@ts-(ignore\|expect-error)" src/ \| wc -l` | `# type: ignore` | `unsafe\|unwrap()` |
| debt markers | `grep -rEn "TODO\|FIXME\|HACK\|XXX" src/ \| wc -l` | same | same |

Then read, don't scan: `tsconfig.json` strict flags that are off, `knip.json` ignores whose stated reason expired, and the top-10 churn files (`git log --format= --name-only | sort | uniq -c | sort -rn | head -10`). Tools find mechanical rot; only reading finds a 600-line function, 1 capability implemented 3 ways, or a test with 0 real assertions.

## Hard rules

| Rule | Why |
|---|---|
| **Dead-proof per deletion**: the literal grep over src + tests + configs + dynamic-import strings, with its `0` count. A knip JSON row alone is not proof. | knip misses `import()` by variable, `bin` entries, string-keyed registries, and test-only utilities. |
| **Capability proof per deletion**: the gate exercising the surviving path, as `path::test → k/n passed`. "tests pass" is a defect. | A deletion that silently drops the only coverage of a path reads green and ships a regression. |
| **`k of n` or `n=` on every quantity.** Banned as claims: several, many, most, significant, substantial, strong, often, repeated, a lot, much cleaner, simpler. | "removed a lot of dead code" is unfalsifiable; `1,204 LOC across 17 files` is checkable. |
| **`measured \| inferred \| hypothesis` on every row.** `measured` requires command+output, `path:line`, or run id. `hypothesis` rows are banned from the Verdict and from any deletion actually performed. | Deleting on a hypothesis is how load-bearing code disappears. |
| **Cost both sides, unit = LOC.** Carrying cost = LOC × sync sites the duplicate forced (40 LOC at 3 call sites = 120). Saving realized = LOC removed + Δ typecheck seconds. Unmeasurable → `unmeasured (<reason>)`; dropping the column is banned. | Without carrying cost, a 4-LOC delete and a 400-LOC delete rank equally. |
| **≤500 words outside tables and fenced blocks.** No paragraph >3 lines — if longer, it is a table. | |
| **Canonicalize at N=2 when both instances name the same concept** (`PLATFORM_URL` vs `PLATFORM_API_URL`, 2 session-getters). Extract coincidental shape only at N=3 with ≥80% token overlap. | Named drift is the bug; premature abstraction of matching shape is a different bug. |
| **Never delete what you can't explain.** Unexplained try/catch, opaque module → leave it, note it in Kept-on-purpose, move on. | |
| **Cleanup only removes.** A new `Manager` class, or a working callback rewritten to async/await, is risk — not cleanup. `var`→`const` is. | |
| **Published-package public API: flag, never delete.** Needs a version bump and a consumer check. | 0 external consumers is a claim requiring a registry/grep check, not an assumption. |
| **Phase gate red → revert that phase.** Never carry a failing gate into the next phase. | |

Weak-type triage: external boundary → real type + runtime validation (`unknown` + narrowing is correct, keep it); internal laziness → trace the value, write the type; genuinely un-typeable → keep + 1 comment saying why. Error triage: external error → keep and type it; "shouldn't happen" → remove the catch, fix the root cause; `catch {}` → a bug; silent fallback hiding failure → remove.

## Output template

Emit exactly this. Omit a section only when its own rule says so.

```markdown
# Deep Clean: <scope> — <YYYY-MM-DD> — <N> files, <L> LOC / <B> bytes removed

**Verdict:** <L LOC removed across N files; gates green|red> — measured
**Biggest single win:** <item> at <LOC> LOC (<carrying cost> LOC of sync surface).
**Next:** /<skill> targeting <surface> with baseline <metric=value>

## Baseline vs after
| Metric | Before | After | Δ | Command | Status |
|---|---:|---:|---:|---|---|

## Deletions — top <k> of <total>, ranked by carrying cost
| # | path:line | What | LOC | Bytes | Dead-proof (command → count) | Capability proof (gate → k/n) | Carrying cost (LOC) | Saving realized (LOC) | Status |
|---:|---|---|---:|---:|---|---|---:|---:|---|

<total−k> deletions under <T> LOC are folded into the Δ row above.

## Kept on purpose
| path:line | Looked dead because | Kept because (caller / dynamic ref / public API) | Status |
|---|---|---|---|

## Deferred
| Item | Est. LOC | Why deferred | Owner | Trigger to revisit |
|---|---:|---|---|---|

## Gates
| Gate | Command | Before | After |
|---|---|---|---|

## Self-gate
<k>/8 passed — failed: <list, or "none">.
1 dead-proof command+count on every deletion · 2 capability proof on every deletion · 3 k-of-n on every quantity · 4 status label on every row · 5 cost both sides in LOC · 6 evidence is path:line / command+output / run id, never prose · 7 Verdict names 1 number + 1 dispatch · 8 words ≤500.
```

## Calibration

- **0/10** — "Cleaned up the codebase, removed a bunch of dead code and simplified several modules. Tests pass." 0 numbers, 0 pointers, 0 dead-proofs, 3 banned adjectives.
- **10/10** — `1,204 LOC / 41,880 bytes removed across 17 files`; every row carries `grep -rn "legacySseParse" src tests → 0`, `apps/sidecar/tests/sse.test.ts → 12/12`, carrying cost `120 LOC`, status `measured`; `tsc` errors 34→0, cycles 3→0, jscpd 6.1%→1.8%.

`references/full-reference.md` holds worked examples only. This file is the normative contract; where they differ, this file wins.

## Dispatch

| Condition (threshold) | Next skill | What to pass it |
|---|---|---|
| ≥1 touched file sits on auth, secrets, input parsing, subprocess, or FS-path code | `/harden` | the deletion rows for those files + the gate names that covered them |
| ≥1 failing test or build error after Phase 4 | `/converge` | the failing command + its output + the phase that introduced it |
| jscpd duplication ≥3% of lines after Phase 3, or ≥2 competing entrypoints left for 1 capability | `/simplify` | the jscpd JSON + both entrypoint paths |
| ≥5 kept paths have 0 covering test (Phase 2c gap list) | `/polish` | the uncovered `path:line` list + the gate that would prove each |
| Deferred table ≥3 rows totalling ≥500 est. LOC | `/reflect` | the Deferred table verbatim, scope=project |
| Δ LOC = 0 and Δ type errors = 0 after Phase 4 | stop | log the run; there was nothing to clean |

## Log the run

```bash
skill-run-log /deep-clean --target "<scope>: <N> files" --verdict <VERDICT> --next /<skill-or-stop>
```
