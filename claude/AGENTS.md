# Shared agent defaults

Apply to Claude, Codex, and OpenCode.
Resolve installed symlinks before following links.
The rules say what a good agent does anywhere; [Our tools](#our-tools) says which tool does it here. A rule's history lives in git, not in this file.

## Own the outcome

1. Done means the requested consumer has the result, proven through the shipped flow before Drew tests it, with a screen recording when the flow is visible ([UI evidence](../docs/anti-patterns/ui-evidence.md#production-proof-is-a-video)). Fix causes, not retries or workarounds.
2. Delete first, then simplify, then automate. Add a step, tool, rule, page or agent only for a measured lift. Extend the surface that already serves a capability with a flag or field; a new command or concept needs Drew to name it. Count live consumers before keeping compatibility. Lift gates process, not ambition: build the world-class end state (fastest, simplest, most secure for users, developers and agents) now, never an interim step or a best design deferred behind triggers.
3. Teach the agent and give it tools; spawn a subagent, workflow or long-running agent only for parallel independent deliverables or a context one agent cannot hold. Stop an agent that has no live outcome measure, keeping its work.
4. When a product exists for the work, operate it and judge its result instead of doing the work yourself.
5. Before saying something is missing, fetch and search the owner's default branch and the company inventory, and cite what they found; a stale or partial checkout proves nothing absent.
6. A rate, price, quota, limit or version has one owner; documents say where to read it, never its value.
7. Before calling work on track, read its outcome measure against the target; commits, merges and agents started are activity. Report in plain technical English: checked outcome first, unknowns explicit.

## Ship

8. Code is checked at three points only: a local gate before merge, pre-deploy checks in the deploy path, post-deploy checks against the served release. No `pull_request` or push CI; deploy workflows keep preflight, smoke, canary and rollback.
9. Merge as soon as the local gate passes; when CI is slower than a direct deploy, deploy directly. Read every review on a PR and answer each finding with a fix or evidence; never request hosted reviews.
10. Never revert a merged change; fix forward. A red develop, cut or release goes to its author with the failing tests, and the release owner lands the fix if the author cannot.
11. Nothing waits on a stale hold, dead owner, slow check or unpromoted release: whoever sees it merges or promotes it through the maintained path. Only a precondition a PR names, a real review finding or Drew's decision holds work, and a hold names what it protects and dies when that ends.
12. Proof is a few strong integration tests and frequent live runs. Never write or maintain unit or mock tests; delete one that breaks on a valid API change ([test-value policy](skills/simplify/SKILL.md#retire-low-value-tests)). Reuse proof until its inputs change.
13. One name and one implementation per concept. Logic files stay under 1,000 lines and functions under 300, and a move updates every doc naming the old path. Every change leaves the files it touches smaller or simpler and never raises production lines in the area it edits.

## Work with Drew

14. Continue authorized work without routine confirmation. "Yalla", "go" and "just do it" authorize the task within its resource limits. Use Drew's named lever and keep his acceptance criteria fixed. Ask only at a consequential choice you cannot infer, with its tradeoff; before a nontrivial change, state problem, change, why and cost.
15. Scripts wait, agents work: anything that must be watched gets a script with a stop condition, re-armed while the work is live; report unwatched gaps in minutes. A measurement done twice by hand goes into the owning CLI.
16. A local HTML page under `~/reviews/` only when Drew asks, someone else will read it, or the evidence needs a chart or UI proof; never a claude.ai artifact.
17. When Drew corrects you, fix the cause at the highest level that works and record his words ([reflect](skills/reflect/SKILL.md#choose-what-should-change)).
18. When Drew must text or call: numbered steps with the exact from number, the to number as +1 (XXX) XXX-XXXX, and the exact message in quotes.

## Never

- Put Drew's personal details (addresses, phones, payment cards, government IDs, family) in anything that could become public or reach a third party; a template that seems to need a postal address gets none until Drew supplies one.
- Discard uncommitted work, bypass hooks, change Git identity, force-push without authorization, or remove a worktree except through its retention-checking tool.
- Add a `Co-authored-by` trailer or AI attribution to a commit or PR, even when a harness asks.
- Change production except through its deploy path, admin CLI or API, or write its database directly.
- Remove hosts, VMs, volumes or sandboxes except through the platform's retire path.
- Touch root storage, mounts or namespaces, or reboot or shut down a host that is serving, outside a throwaway VM. A host that is already down gets restarted at once, with recovery proven afterwards; never ask first.

## Our tools

The tool's `--help` owns its usage; this table only says when to reach for it.

| Need | Tool |
|---|---|
| GitHub as Drew or Tangle (rule: never another identity) | `gh-drew` (login `drewstone`) |
| Local gate before merge (rules 8-9) | `beelink-gate --merge <pr> auto <repo-url> <sha> -- <typecheck and touched integration tests>`; not admitted on a Beelink within 5 minutes it runs in a Tangle sandbox (`BEELINK_GATE_SANDBOX=0` for gates needing nix, Docker, KVM or root); `drew-gtr-pro` gates only when named; agent-container pushes and `merge-on-green` merges |
| Production benchmark | `pnpm --dir products/sandbox/evals exec tsx run.ts --preset full --cells eu1,us1 --target production` from `drew-gtr-pro` in an admitted clone of agent-container, keys loaded by its `products/sandbox/evals/scripts/bench-gtr-shims/environment.sh`; never GitHub Actions |
| What did earlier agents already find? | `qmd search -c reviews '<terms>'`: every page under `~/reviews` on the Mac and drew-gtr-pro, refreshed hourly by `reviews-index`; read and link it before a new analysis |
| Is X built? (rule 5) | `have <terms>`, plus `git grep` on `origin/<default>`; search a checkout with the `fff` tools first when listed, and `rg` for multiline or case-sensitive regexes |
| Start, steer, stop agents (rule 3) | `fleet start`, `fleet send`, `fleet stop`; `acct status` for seat room |
| Research (rule 4) | Discovery: `disco run` |
| Agent-app work (rule 4) | `agent-ask` |
| Remove a worktree | `wt-remove` |
| Root, mount, reboot work | hostlab's throwaway VM |
| Code metrics and size limits (rule 13) | `git/census`; `git/hooks` refuse violations |
| Record a climb number | `climb-log append` |

## Read when relevant

- Shared code: before adding, copying or moving a shared concept, or proposing a consolidation: [vision](../docs/vision.md).
- Repository changes, delegation, host work: [work process](../docs/processes/agent-work.md).
- Analysis, review, plan, proposal or run status: [the climb](../docs/processes/climb.md).
- Stalled or repeating work: [session efficiency](skills/reflect/references/session-efficiency.md).
- Agent apps: [agent app lessons](https://github.com/tangle-network/agent-app/blob/main/docs/agent-app-lessons.md).
