---
name: deep-clean
description: "Codebase cleanup with measurement, real tooling (knip, madge, tsc --strict, jscpd), dependency-ordered phases, verification gates. Triggers: 'clean up the codebase', 'remove dead code', 'fix all the types', 'reduce complexity', 'technical debt'."
---

# Deep Clean — Measured Codebase Cleanup

Thorough codebase quality sweep. Runs real static analysis tools, measures before/after, implements changes in dependency-safe order, verifies after every phase. Not 8 blind agents — 4 ordered phases with verification gates.

Shared conventions in `_common.md`.

## Why phases, not parallel agents

Cleanup concerns have dependencies:

```
Phase 1: Measure + Audit (tools run, ground truth established)
    ↓
Phase 2: Structure (circular deps, consolidation, shared types)
    ↓ verify: tests pass, types check
Phase 3: Strengthen (remove any/unknown, remove dead code, remove defensive noise)
    ↓ verify: tests pass, types check, build succeeds
Phase 4: Polish (AI slop, stale comments, deprecated paths, formatting)
    ↓ verify: full test suite, build, lint
```

Phase 2 changes import graphs → Phase 3 must run after. Phase 3 removes code → Phase 4 must run after. Parallel agents doing these simultaneously will conflict.

WITHIN each phase, subagents can run in parallel (they touch different concerns that don't interact).

## Phase 0: Measure — Ground Truth Before Touching Anything

Run every available static analysis tool. Record the numbers. These are the baseline.

```bash
# TypeScript / JavaScript
npx tsc --noEmit 2>&1 | tail -5                    # type errors
npx knip --reporter json 2>/dev/null | head -50      # unused exports, deps, files
npx madge --circular --warning src/ 2>&1             # circular dependencies
npx jscpd --min-lines 6 --reporters json src/        # code duplication
grep -rn "as any\|: any\|: unknown" src/ | wc -l     # weak types count
grep -rn "catch\s*(" src/ | wc -l                    # try-catch count
grep -rn "TODO\|FIXME\|HACK\|XXX" src/ | wc -l      # debt markers
npx eslint src/ --format json 2>/dev/null | head -20  # lint violations

# Python
ruff check . --statistics 2>&1                       # lint violations
mypy . --no-error-summary 2>&1 | tail -5             # type errors
vulture . 2>&1 | wc -l                               # dead code
grep -rn "Any\|# type: ignore" . --include="*.py" | wc -l  # weak types

# Rust
cargo clippy -- -W clippy::all 2>&1 | grep "warning" | wc -l
cargo udeps 2>&1 | wc -l                             # unused deps
```

Read existing configs — they ARE the codebase's quality opinion:
- `tsconfig.json` — is `strict` enabled? Which strict flags are off?
- `.eslintrc` / `eslint.config.*` — what rules exist?
- `biome.json`, `.prettierrc`, `rustfmt.toml` — formatting
- `knip.json` / `knip.ts` — what's explicitly ignored and why?

Write baseline to `.evolve/deep-clean-baseline.json`:
```json
{
  "timestamp": "2026-04-16T00:00:00Z",
  "typeErrors": 47,
  "weakTypes": 183,
  "circularDeps": 12,
  "unusedExports": 94,
  "unusedFiles": 7,
  "unusedDeps": 3,
  "duplication": { "percentage": 4.2, "clones": 31 },
  "tryCatchBlocks": 67,
  "debtMarkers": 23,
  "lintViolations": 156
}
```

**Do NOT skip this phase.** Every number here is a before/after comparison point. If you can't measure it, you can't prove the cleanup helped.

## Phase 1: Structure — Fix the Graph Before Fixing the Nodes

Changes that affect the import/dependency graph. Do these first because every subsequent phase reads from the graph.

### 1a. Untangle circular dependencies

```bash
npx madge --circular --warning src/
# or: cargo +nightly udeps, or Python import-linter
```

For each cycle:
1. Read every file in the cycle. Understand WHY they reference each other.
2. Common fixes: extract shared types to a `types.ts`, extract shared utils to a leaf module, use dependency injection instead of direct imports, split a God module.
3. Verify: `npx madge --circular src/` returns 0 cycles.

### 1b. Consolidate shared types

Parallel with 1a (different files, non-conflicting).

1. Find all type definitions: `grep -rn "^export type\|^export interface\|^type " src/`
2. Identify duplicates: same shape, different names, different files.
3. Create shared type modules (`types/*.ts`) for types used in 3+ files.
4. Update all import sites.
5. Verify: `npx tsc --noEmit` passes.

### 1c. Deduplicate code (DRY)

```bash
npx jscpd --min-lines 6 --min-tokens 50 src/
```

For each clone group:
1. Read both copies. Are they identical? Almost identical? Coincidentally similar?
2. If identical or near-identical (>80% token overlap): extract to shared function/module.
3. If coincidentally similar (different intent, same shape): leave them. Premature DRY is worse than duplication.
4. **Three is a pattern, two is a coincidence.** Don't DRY two-instance duplication unless the intent is clearly shared.

Verify before next phase: tests + type check pass.

## Phase 2: Strengthen — Remove Weakness, Don't Add Fragility

Changes that tighten types, remove dead code, clean error handling.

### 2a. Remove weak types (`any`, `unknown`, type assertions)

```bash
grep -rn "as any\|: any\|: unknown\|@ts-ignore\|@ts-expect-error" src/
```

For EACH instance:
1. Read the surrounding code. Why is `any` here?
2. **External API boundary** (fetch response, third-party lib return) → add a proper type + runtime validation (zod, io-ts, or manual check). `unknown` + narrowing is correct here — don't remove it.
3. **Internal laziness** (someone didn't type a function) → trace the actual value flow, write the real type.
4. **Generic constraint** (`T extends any`) → replace with the actual constraint.
5. **Impossible to type** (complex metaprogramming, legacy interop) → add a comment explaining why, keep the assertion. Documented `any` is acceptable; undocumented `any` is not.

### 2b. Remove dead code

```bash
npx knip                    # TypeScript: unused exports, files, deps
vulture .                   # Python
cargo udeps                 # Rust
```

For each finding:
1. **Verify it's actually unused.** Knip can miss dynamic imports, test utilities, CLI entry points. Check before deleting.
2. **Unused exports** in library packages may be public API — don't delete unless the package is internal.
3. **Unused dependencies** → remove from package.json/Cargo.toml + verify build.
4. **Unused files** → `git rm`. Don't leave dead files.

### 2c. Clean error handling

**DO NOT blindly remove try-catch.** Audit each one:

1. **Catches external errors** (network, filesystem, user input) → KEEP. Add proper error types if missing.
2. **Catches internal errors that shouldn't happen** (type narrowing, assertion) → remove the try-catch, fix the root cause.
3. **Catches and silently swallows** (`catch {}`, `catch(e) { /* ignore */ }`) → this is a bug. Either handle the error or let it propagate.
4. **Catches and logs but continues** → if the continuation is safe, fine. If it masks a broken state, remove.
5. **Catches and returns a default/fallback** → is the fallback correct? Does the caller know they got a fallback? If the fallback hides a real failure, remove.

The test: **can you name the specific error this catch handles?** If yes, keep it. If no ("it might throw... something?"), remove it.

Verify before next phase: full test suite + type check + build pass.

## Phase 3: Polish — Cosmetic Cleanup After Structural Changes

### 3a. Remove AI slop and stubs

Patterns to find and remove:
```bash
grep -rn "TODO.*implement\|FIXME.*later\|stub\|placeholder\|LARP\|// eslint-disable" src/
grep -rn "This function\|This method\|This class" src/  # AI-generated JSDoc
grep -rn "comprehensive\|robust\|leverage\|utilize\|facilitate" src/  # AI vocabulary in comments
```

For each:
1. **Stubs** (`throw new Error('not implemented')`) → implement or delete the function entirely.
2. **AI-generated comments** that describe what the code already says → delete.
3. **Motion comments** ("replaced X with Y", "previously this did Z") → delete. Git history has this.
4. **Useful comments** explaining WHY (not what) → keep. If unclear, rewrite concisely.

### 3b. Remove deprecated/legacy/fallback paths

```bash
grep -rn "@deprecated\|DEPRECATED\|legacy\|Legacy\|fallback\|FALLBACK\|backward.compat\|compat shim" src/
```

For each:
1. Is there still a caller? If yes → is the caller migrated to the new path? Migrate it.
2. If no callers → delete.
3. If it's a public API with external consumers → can't delete without a major version bump. Document and flag.

### 3c. Formatting pass

Run the project's own formatter. Don't impose new style — match what exists:
```bash
npx prettier --write src/    # or biome format, or rustfmt, or ruff format
npx eslint --fix src/
```

Verify before final measurement: full test suite + type check + build + lint pass.

## Phase 4: Measure Again — Prove It Helped

Re-run every tool from Phase 0. Compare:

```
                        Before    After     Δ
Type errors:              47        12     -35
Weak types (any/unknown): 183       41    -142
Circular dependencies:     12        0     -12
Unused exports:            94       11     -83
Unused files:               7        0      -7
Duplication:              4.2%     1.8%   -2.4%
Try-catch blocks:          67       34     -33
Debt markers:              23        5     -18
Lint violations:          156       22    -134
Test pass rate:          100%     100%      0
Build:                   pass     pass      ✓
```

Write to `.evolve/deep-clean-result.json`. Append to `.evolve/progress.md`.

**If test pass rate decreased or build broke: REVERT the last phase and investigate.** A cleanup that breaks things is worse than no cleanup.

## Using subagents within phases

Within a phase, concerns that touch different files can run as parallel subagents:

- Phase 1: 1a (circular deps) + 1b (shared types) can run in parallel if they target different files
- Phase 2: 2a (weak types) + 2b (dead code) can run in parallel (different changes)
- Phase 2c (error handling) runs alone — it reads the output of 2a/2b
- Phase 3: 3a + 3b + 3c can all run in parallel (cosmetic, non-conflicting)

But NEVER parallelize across phases. Phase 2 reads Phase 1's output.

## What NOT to do

- **Don't remove error handling you don't understand.** If you can't explain why the catch is there, LEAVE IT and add a comment asking.
- **Don't DRY two-instance duplication.** Three is a pattern. Two is coincidence.
- **Don't add abstractions.** Cleanup removes complexity, never adds it. A new `ErrorHandler` class is not cleanup.
- **Don't change public API signatures.** Internal cleanup only. External contracts stay stable.
- **Don't reformat code the project doesn't format.** If there's no Prettier config, don't add one. Match existing style.
- **Don't delete tests.** Even bad tests. Flag them for rewrite but don't delete coverage.
- **Don't "modernize" working code.** `var` → `const` is fine. Rewriting a callback to async/await when the callback works is not cleanup — it's risk.

## Persist

```
.evolve/deep-clean-baseline.json   # Phase 0 measurements
.evolve/deep-clean-result.json     # Phase 4 measurements
.evolve/progress.md                # append cleanup summary
.evolve/skill-runs.jsonl           # one line on completion
```

After convergence, hand off to `/meta-harness` if the codebase has an agent/harness worth evolving, or to `/evolve` for metric-driven improvement.
