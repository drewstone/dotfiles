# Deep Clean — worked examples

Not normative. `../SKILL.md` is the contract (flow, hard rules, output template, dispatch); where these differ, SKILL.md wins. These are filled-in examples of rows SKILL.md requires.

## Worked example 1 — a deletion row with both proofs

Two SSE parsers existed; `sdk-core`'s is canonical. Before deleting `legacySseParse`:

```bash
grep -rn "legacySseParse\|legacy-sse" src tests scripts *.json → 0 hits (after 4 callers migrated)
grep -rn "legacySseParse" --include=*.ts -e 'import(' src → 0            # dynamic import check
node -e "console.log(require('./package.json').exports)" | grep -c legacy → 0  # not public API
npx vitest run apps/sidecar/tests/sse.test.ts → 12/12 passed
```

| # | path:line | What | LOC | Bytes | Dead-proof (command → count) | Capability proof (gate → k/n) | Carrying cost (LOC) | Saving realized (LOC) | Status |
|---:|---|---|---:|---:|---|---|---:|---:|---|
| 1 | `src/sse/legacy-sse.ts:1-186` | 2nd SSE parser | 186 | 6,402 | `grep -rn "legacySseParse" src tests scripts → 0` | `tests/sse.test.ts → 12/12` | 558 (186×3 sync sites) | 186 + 1.4s tsc | measured |

The carrying cost is 3 sync sites because every framing fix had to be applied to both parsers plus the shared fixture.

## Worked example 2 — a Kept-on-purpose row

knip reported `src/cli/doctor.ts` as an unused file. It is the `bin.doctor` entry in `package.json:14` — knip's default config does not read that field.

| path:line | Looked dead because | Kept because | Status |
|---|---|---|---|
| `src/cli/doctor.ts:1` | knip `unused files` → 1 hit | `package.json:14` declares `bin.doctor`; `npx doctor --help` → exit 0 | measured |

## Worked example 3 — breaking a cycle (Phase 1)

`madge --circular src/` → 3 cycles, all through `src/config/index.ts` re-exporting types from `src/client.ts`.

Fix: move the 4 shared interfaces to a leaf module `src/types.ts`; both sides import the leaf. Re-run: `npx madge --circular src/ → 0`. Gate: `npx tsc --noEmit → 0 errors`, `vitest run → 218/218`.

Ordering matters: doing this in Phase 2 would have meant knip re-scanned a graph that later changed, invalidating its dead-export list.

## Worked example 4 — triage tables

Weak types, 34 `any` at Phase 0 → 6 at Phase 4:

| Case | Count | Action taken |
|---|---:|---|
| external boundary (`fetch` JSON, 3rd-party return) | 11 | real type + zod validation at the boundary |
| internal laziness | 17 | traced the value, wrote the type |
| genuinely un-typeable (vm context, dynamic plugin) | 6 | kept + 1 comment naming why |

Error handling, 22 `try/catch` reviewed:

| Case | Count | Action taken |
|---|---:|---|
| external error (network, FS, subprocess) | 13 | kept, error typed |
| "shouldn't happen" internal | 5 | catch removed, root cause fixed |
| `catch {}` silent swallow | 3 | treated as a bug; error propagates |
| fallback hiding a real failure | 1 | removed; now throws with what is missing |

## Worked example 5 — filled Baseline-vs-after table

| Metric | Before | After | Δ | Command | Status |
|---|---:|---:|---:|---|---|
| type errors | 34 | 0 | −34 | `npx tsc --noEmit` | measured |
| circular deps | 3 | 0 | −3 | `npx madge --circular src/` | measured |
| duplication % | 6.1 | 1.8 | −4.3 | `npx jscpd --min-lines 6 --min-tokens 50 src/` | measured |
| unused exports | 41 | 2 | −39 | `npx knip --reporter json` | measured |
| `as any` / `: any` | 34 | 6 | −28 | `grep -rEn "as any\|: any" src/ \| wc -l` | measured |
| tests passing | 218/218 | 231/231 | +13 | `npx vitest run` | measured |
| typecheck wall time | 9.6s | 8.2s | −1.4s | `time npx tsc --noEmit`, n=3 median | measured |

## Worked example 6 — what a failed self-gate looks like

`6/8 passed — failed: 2 (capability proof), 5 (cost both sides).`
Two deletions in `src/util/` cite `grep → 0` but name no covering test; carrying cost is `unmeasured (no per-file typecheck timing available)` on 4 rows. Both are reported, not hidden — an unreported gate failure is worse than a failed gate.
