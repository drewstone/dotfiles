# Real-integration discipline (2026-10-04)

From the traces/cli-bridge issue-finish wave. Evidence-linked corrections to my own
working discipline; none of this is repo policy.

1. **Prove the merge, not the PR state.** A PR can merge with a subset of its
   commits while follow-ups keep landing on its branch. Before calling work done:
   `git log origin/main..<branch>` must be empty. (3/3 PRs partially merged; a
   correctness hole rode main ~20h.)
2. **Never gate on a piped command.** `cmd | tail && echo OK` echoes
   unconditionally. Run the gate, check `$?` directly; treat CI as the second gate.
   (CI's first enabled run caught what my theater passed.)
3. **"Can't run here" is usually an inventory failure.** Enumerate credentials,
   toolchain, and *per-endpoint funding states* before declaring an environment
   incapable. (Every key on the box was unfunded on general endpoints; the coding
   -plan baseUrl + source-built fork were fully funded.)
4. **One real run early, doubles for branches after.** Crossing a process/network
   boundary, injected doubles hide whole failure classes (truncation; event-loop
   starvation) that a single live run surfaces in minutes.
5. **Spawned children that call back into the test process require async spawn.**
   spawnSync starves in-process servers; the symptom (accepted-but-unserved
   connection) mimics a product hang.
6. **Get the real artifact shape before fixing.** Minimal-shape fixes pass
   minimal-shape tests and fail on the third copy in production data.

Full reflection: /Users/drew/code/traces/.agent/reflections/2026-10-04-054500.md
