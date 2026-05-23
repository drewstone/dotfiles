---
name: deep-clean
description: "Codebase cleanup with measurement, real tooling (knip, madge, tsc --strict, jscpd), dependency-ordered phases, verification gates. Chains to /harden on Phase 4. Triggers (reactive): 'clean up the codebase', 'remove dead code', 'fix all the types', 'reduce complexity', 'technical debt'. Triggers (proactive — fire 10x more often): 'after a big merge', 'after migration X lands', 'proactive sweep of area Y', 'audit and canonicalize'."
---

# Deep Clean — Measured Codebase Cleanup

Thorough quality sweep: run real static analysis, measure before/after, change code in dependency-safe order, verify after every phase.

Measure → three ordered work phases → measure again. Within a phase, parallel subagents are fine (non-conflicting files). Across phases, never — each phase reads the previous phase's output.

```
Phase 0  Measure        establish ground truth
Phase 1  Structure      circular deps, canonicalization     → verify: tests + types
Phase 2  Strengthen     weak types, dead code, tests, errors → verify: tests + types + build
Phase 3  Polish         AI slop, deprecated paths, format    → verify: tests + types + build + lint
Phase 4  Measure again  prove the numbers moved
```

Phase 1 rewrites the import graph → Phase 2 reads it. Phase 2 removes code → Phase 3 reads what's left. Parallelizing across phases corrupts that ordering.

## Scope calibration

The default failure mode is stopping too early. Tools surface mechanical rot; they do not surface a God module, a capability implemented three ways, or a test that asserts nothing. After the tool-driven passes, the bar is: **could a staff engineer reading this diff still find dead weight, a duplicated path, or an untested branch?** If yes, you are not done. Cleanup is finished when a fresh pass finds nothing — not when the first pass finishes.

## Phase 0 — Measure

Run every available tool. Record the numbers — they are the before/after baseline. If you can't measure it, you can't prove the cleanup helped.

```bash
# TypeScript (primary)
npx tsc --noEmit 2>&1 | tail -5
npx knip --reporter json 2>/dev/null              # unused exports / deps / files
npx madge --circular src/ 2>&1                     # circular deps
npx jscpd --min-lines 6 --reporters json src/      # duplication
grep -rEn "as any|: any|: unknown|@ts-(ignore|expect-error)" src/ | wc -l
grep -rEn "TODO|FIXME|HACK|XXX" src/ | wc -l
```
Python: `ruff check . --statistics`, `mypy .`, `vulture .`. Rust: `cargo clippy -- -W clippy::all`, `cargo +nightly udeps`.

Read the configs — they are the codebase's own quality opinion: `tsconfig.json` (which strict flags are off?), `eslint.config.*` / `biome.json`, `knip.json` (what's ignored, and is the reason still true?).

Then **read, don't just scan**. Open the largest and highest-churn files (`git log --format= --name-only | sort | uniq -c | sort -rn | head`). Tools miss design smells — a 600-line function, a module everything imports, an abstraction with one caller. Add what you find to the work list.

Write every metric to `.evolve/deep-clean-baseline.json`.

## Phase 1 — Structure

Graph-level changes. Do them first; every later phase reads the graph.

### 1a. Untangle circular dependencies
For each cycle: read every file in it, understand why they reference each other, then break it — extract shared types to a leaf module, extract shared utils to a leaf, inject instead of import, or split a God module. Verify `madge --circular` returns 0.

### 1b. Canonicalize — one path per capability
The goal is not just DRY; it is a single canonical implementation per capability, so the weaker copy can't win later.
- Duplicate type shapes (`grep -rEn "^export (type|interface)" src/`) → one shared definition, used at 3+ sites.
- Same logic implemented twice (`jscpd --min-lines 6 --min-tokens 50`) → if >80% token overlap and shared intent, extract. If coincidental (same shape, different intent), leave it.
- Same capability with two entrypoints (two HTTP clients, two SSE parsers, two config loaders) → pick the canonical one, migrate callers, delete the other.
- **Three is a pattern, two is a coincidence — EXCEPT for drift of the same concept.** Two spellings of the same env var (`PLATFORM_URL` vs `PLATFORM_API_URL`), two session-getters, two `agentSessionId` formats: drift IS the bug. Canonicalize at N=2 whenever the two instances name the same concept. Premature abstraction of coincidental shape is bad; tolerating named drift is worse.

Verify: tests + types pass.

## Phase 2 — Strengthen

### 2a. Weak types
For each `any` / `unknown` / assertion:
- External boundary (fetch, third-party return) → real type + runtime validation. `unknown` + narrowing is correct here; keep it.
- Internal laziness → trace the value, write the real type.
- Genuinely un-typeable → keep it, add a comment saying why. A documented assertion is acceptable; an undocumented one is not.

### 2b. Dead code
`knip` / `vulture` / `cargo udeps`. Verify each finding is truly unused — tools miss dynamic imports, CLI entrypoints, test utilities. Unused exports in a published package may be public API; don't delete those. Unused files → `git rm`. Unused deps → drop and rebuild.

### 2c. Test integrity
Cleanup that silently drops coverage is not cleanup.
- When you delete code, delete the tests bound only to it.
- When you keep a path, confirm a test exercises it — if not, that gap is a finding to hand to `/harden`.
- Flag assertion-free tests (`toBeTruthy`, `toBeDefined`, `not.toThrow` as the only assertion) and `.skip` with no reason. Fix or delete — a test that cannot fail is dead weight.

### 2d. Error handling
Do NOT blind-remove try-catch. For each block, name the specific error it handles:
- External error (network, FS, input) → keep, type it properly.
- Internal "shouldn't happen" → remove the catch, fix the root cause.
- Silent swallow (`catch {}`) → a bug. Handle the error or let it propagate.
- Fallback/default that hides a real failure → remove. Named, opted-in fallbacks are fine; silent ones are not.
If you can't name the error, you don't understand the catch — leave it, add a comment, move on.

Verify: tests + types + build pass.

## Phase 3 — Polish

### 3a. AI slop & stubs
`grep -rEn "stub|placeholder|This (function|method|class)|comprehensive|robust|leverage|utilize" src/`. Stubs (`throw new Error('not implemented')`) → implement or delete the function. JSDoc that restates the code → delete. Motion comments ("replaced X", "previously did Y") → delete; git history owns that. WHY comments → keep, tighten.

### 3b. Deprecated / legacy paths
`grep -rEn "@deprecated|DEPRECATED|legacy|backward.?compat|compat shim" src/`. Caller exists → migrate it, then delete the old path. No caller → delete. Public API with external consumers → flag; it needs a version bump.

### 3c. Format
Run the project's own formatter only (`biome`, `prettier`, `rustfmt`, `ruff format`). Don't introduce a formatter the project doesn't use. Don't reformat files you didn't otherwise touch.

Verify: tests + types + build + lint pass.

## Phase 4 — Measure again

Re-run every Phase 0 tool. Tabulate before / after / Δ for every metric, plus test pass rate and build status. Write `.evolve/deep-clean-result.json`, append `.evolve/progress.md`, append one line to `.evolve/skill-runs.jsonl`.

**If test pass rate dropped or the build broke: revert the last phase and investigate.** A cleanup that breaks things is worse than no cleanup.

## What NOT to do

- **Don't add complexity.** Cleanup removes. A new `Manager` class is not cleanup; `var`→`const` is. Rewriting a working callback to async/await is risk, not cleanup.
- **Don't touch what you can't explain.** Unexplained try-catch, weird-looking module — leave it, add a TODO comment, move on.
- **Don't break external contracts.** Public API signatures stay stable. Don't impose a formatter the project lacks. Don't reformat files you didn't otherwise touch.
- **Don't delete load-bearing tests.** Assertion-free / `.skip`-no-reason tests yes; coverage you're keeping no.

## Handoff

**`/harden` is mandatory after Phase 4, not optional.** Cleanup changes the attack surface — re-validate it. Fan out the standard harden scans (residual-pattern, security-regression, race, credential, harness-coverage) against the now-cleaned state before declaring done.

Optional follow-ups:
- Codebase has an agent/harness worth evolving → `/meta-harness`.
- Metric-driven improvement loop → `/evolve`.
