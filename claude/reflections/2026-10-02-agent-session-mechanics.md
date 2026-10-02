# Agent session mechanics — retained corrections (2026-10-02)

From the 2026-10-01/02 Tangle trio session (~22h, 3 repos, 20+ merged PRs). Personal operating habits, not repo guidance. Evidence counts in the canonical reflection: agent-dev-container/.agent/reflections/2026-10-02-180852.md.

## Hard rules

1. **`cd` does not persist between tool calls.** Every command that targets a specific tree states its own `cd <path> &&` prefix — no exceptions, even for the "quick" follow-up. (≥5 wrong-checkout executions this session.)
2. **`rg -rn` is replace, not recursive.** Use `rg -n`. If output shows suspiciously short tokens (`pub trait n`), a replace flag slipped in — re-run before interpreting anything. (≥4 mangled outputs.)
3. **Full SHAs are copy-pasted, never typed or "extended."** A short SHA plus invented digits produced 34 bogus pins and one full debug cycle. `git rev-parse` into a variable or clipboard, always.
4. **Fixtures and expected-values are machine-generated from the source of truth**, never hand-transcribed. Hand-typing hex constants produced 2 errors; the generated-fixture tests caught both immediately. Generator command goes in the test header so regeneration is one command.
5. **Snapshot before any destructive git op on a shared checkout**: `git diff > /tmp/snapshot-$(date +%s).patch` BEFORE `checkout -- .`, `reset --hard`, `stash`, or `clean`. Shared trees hold other agents' uncommitted work; this session's `git checkout -- .` nearly destroyed 97 files and was saved only by an earlier snapshot. Prefer an isolated worktree over editing any shared main checkout at all.

## Check-first rules

6. **Verify APIs against the *pinned* revision, not main**: `git show <rev>:<path>` before using any dependency API. "It exists on main" cost 2 CI rounds this session (`sole_local`, `keepers` gate). Remember hidden `#[cfg(feature)]` gates can make a module compile to nothing — if a test filter matches 0 with "N filtered", suspect a feature gate before suspecting the filter.
7. **Inspect the lines above an insertion anchor** for attributes and macros before inserting a function or block. An inserted helper silently captured `#[tokio::main]` and produced a misleading "not a future" error 1 CI round later.
8. **Before claiming what CI/workflows will do, grep the wiring.** `rg -n <script> .github/workflows/` takes seconds; assuming a script is invoked was the 8th raise of claim-without-checking (publicly corrected). The complementary wins — discovering `JobsRFQ` and the secrets endpoint already existed — came from the same grep-first instinct applied before designing.

## Retained practices (worked; keep doing)

- Byte-exact machine-generated fixtures pinning cross-language contracts (caught 3+ real defects at ~zero cost).
- Follow invariant-checker remediation text verbatim when it prints the fix.
- Isolated worktrees (`adc-wt`/`git worktree`) for all editing on multi-agent repos.
