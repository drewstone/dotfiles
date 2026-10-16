# Native addon guard proof — #10198

The original six-case experiment below covered the first proposal and missed two real review defects. It is historical evidence, not acceptance of that proposal. Review found descendant processes could survive and an incidental native dependency could mask a missing package binding. Both findings and the current nine-case raw result are retained in [PR500](https://github.com/drewstone/dotfiles/pull/500).

The correction accepts only an actually loaded native module owned by a declared same-family optional platform provider whose operating system, CPU and Linux libc metadata match this Node runtime. It retains the entrypoint dependency-graph check and actual Node ABI validation. Incidental direct optional native modules remain stale.

The scanner inherits the existing gate run token; the existing reaper runs after each scan, including scan errors, before proceeding. File-backed probe stdout prevents a timed-out Node's descendant from keeping a captured pipe open. No new cleanup authority, provider exception, build flag, CLI, CI gate or unit/mock maintenance is introduced.

[Current historical reference](probe-review.py.raw.txt) runs the exact before/after guard bodies and live first-scan cleanup boundary against isolated real package copies and actual processes. It includes the original six cases plus an incidental direct optional native dependency with a failing deferred own binding, a detached helper after successful entrypoint return, and a detached helper inheriting stdout across timeout. Deliberately leaked control processes are identified by a unique fixture nonce and stopped before the proof ends. Current raw output/source identity and exact gate receipts are in PR500; the original consumer gate remains failed until actual installed-source recovery.

The files and text below preserve the initial experiment verbatim for provenance.

---

# Optional native addon guard proof — #10198

The gate previously rejected `@parcel/watcher` after a successful frozen install because it searched only beneath the package containing `binding.gyp`. This package selects a platform/libc optional dependency through its real entrypoint. The original installed entrypoint loaded its native binding and delivered a real filesystem create event under the failing consumer's Node runtime.

Tested executable source: `cc3cd08055d3454f44805b8cb699cc2c84f30cae`, compared with default-base source `53c31d243b540875d0f2f9374ef70bd62fd81604`. The positive load used the original Blueprint gate's Node22.23.3 / ABI127 and published watcher2.6.0. These identities describe this immutable experiment, not a future runtime/version policy.

The guard now checks an allowed package's entrypoint when its own addon is absent. The actual Node loader validates the selected binary. A reachable loaded `.node` module must appear in that entrypoint's dependency graph; an unrelated preload cannot satisfy it. Load errors, an empty native graph and a timed-out entrypoint remain stale. Existing build policy, local-build ABI scanning and rebuild behavior are unchanged.

[Raw six-case comparison](guard-proof.json) and [historical reference script](probe.py.raw.txt) retain every outcome. The script is a one-time real-boundary proof, not a maintained unit test, product command or CI gate. It runs the exact before/after guard bodies in isolated copies of the installed dependency closure. No production package is modified.

| Case | Before stale | After stale | Actual boundary |
| --- | ---: | ---: | --- |
| Valid external native binding | 1 | 0 | Real package load and filesystem create event pass |
| Missing external binary | 1 | 1 | Real entrypoint fails to load |
| External binary built for another ABI | 1 | 1 | Real Node loader rejects ABI137 binary under ABI127 |
| Valid local N-API fallback | 0 | 0 | Real package load and filesystem create event pass |
| Unrelated valid native preload, JavaScript-only entrypoint | 1 | 1 | Preloaded native module is excluded from this entrypoint graph |
| Entrypoint keeps a live timer | 1 | 1 | Bounded probe times out and remains stale |

The wrong-ABI control uses a real already-installed native addon, substituted only inside an isolated fixture. The preload control uses the valid original N-API binary. No mocked Node loader, fake binary or unit/mock changes were used.

Normal maintained gate `beelink1-a38b822b81fa3ae4b9e342b86f604a43` returned actual job0 / attach0 / exact receipt: run34s / wait1s, Bash syntax and all six real controls pass. Original entrypoint/event gate `beelink1-b1e1355bf34ddc4f9254411fefefa9ff` returned0 / run26s / wait1s. Original consumer failure `beelink1-435930b915aab5ac77751c88a8aaa7ff` is retained by #10198; its intended command never ran. This proof does not relabel that consumer failure as a passing build.

Normal merge and `tangle-tools-deploy dotfiles` must install the checked revision before a changed-input consumer gate can prove recovery. No installed script was hand-copied. Full repository suite and consumer build remain outside this scoped proof.

The first nine-case run at `43eb8d9` returned FAIL because the timeout control additionally expected the initial proposal to exceed its outer deadline. Its actual row instead returned after 10.086s with a live detached helper; the correction returned after 12.123s with none. That failed result is retained. The reference now requires both actual probe timeout durations and preserves the old-live/new-none descendant boundary; it does not require an unsupported outer-deadline outcome. Only this affected real control needs a changed-input rerun; executable bytes and the other eight controls are unchanged.
