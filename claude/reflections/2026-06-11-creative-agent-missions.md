# Reflect: the missions program — from "is this overengineered?" to shipped, fenced, and fleet-propagated

Date: 2026-06-11 (session spanned 2026-06-10 → 06-11)

## Run Grade: 8.5/10

| Dimension | Score | Evidence |
|---|---|---|
| Goal achievement | 9 | Every directive landed: critique → rebuild → substrate lifts → adoption (−2,032) → `:::` retirement (6 repos) → ship-it waves (gating/auto-start/ledger/evals/spend-cap) → 3 production incidents found+fixed → permanent smoke gate. ~32 PRs merged across 8 repos, 3 substrate releases (agent-app 0.9.0/0.9.1, agent-runtime 0.49.0). Only round 4 (crash-resume) remains, unblocked minutes ago. |
| Code quality | 9 | Net: creative-agent ~−3,300 lines with strictly more capability; +~400 tests across the fleet; every PR carried failing-then-passing proof where it mattered (SSO regression test verified falsifiable; eval pack caught 4 harness bugs in its own smoke runs). Two pre-existing master breakages found and fixed in passing. |
| Efficiency | 7 | ~30 background agents, high parallelism, watcher-chained merge trains. Deductions: 3 branch collisions from agents sharing one checkout (worktree discipline adopted only mid-session), 2 agents killed by the spend limit (resumed cleanly from uncommitted state), 1 deploy watcher raced the wrong run, repeated gh-drew first-call flakes (pattern memorized). |
| Self-correction | 9 | Round-1 drive failed → SSO incident found+fixed; round 2 → model-routing incident; round 3 → KEY_PRODUCTS; each failure became a fix + a permanent fence. Spend-limit kills resumed from exact state. My own review claim ("SDK lacks durable execution") corrected by investigation when Drew pushed back — and that correction became `driveTurn`. |
| Learning | 8 | 3 memory files (ops quirks, verification state, learnings); principles codified in framework docs (agent-native, no-block-channels, transport map) so they outlive the session; substrate feedback filed as issues (#40/41/42/44, #1956, #237) rather than lost in reports. |
| Overall | 8.5 | Operator merged everything, often saying only "yalla" / "keep merging." The deductions are real but were all converted into durable process (worktrees, watchers, memory). |

## What we actually did and shipped

**Act 1 — The critique (PR #278).** Verdict: the durable-mission chassis was sound; the cargo was bolted to it (250 lines of YouTube Python in the engine, chat-authored shell in prompts, a personal build journal). Posted as a teaching review.

**Act 2 — Agent-native rebuild.** Deleted the vertical + command-step machinery (−2,067), moved steps to **detached sandbox sessions** (`dispatchPrompt`/turn-cache — after Drew correctly pushed back that the platform already had session durability), folded the legacy workflows executor into missions, added gateway stream grants.

**Act 3 — Contribute down, adopt up.** Lifted `driveTurn` into the sandbox SDK (#1944→0.6.0), `/missions` into agent-app (#35→0.8.x), the durable delegation queue + detached resume into agent-runtime (#232/#236→0.49.0); then adopted them back (−2,032 in creative-agent). Principles + transport map codified in agent-app docs.

**Act 4 — `:::` retirement, fleet-wide.** All five blocks → schema-validated tools in creative-agent (#299–#301), then the audit: legal (−724; 2 dead channels), insurance (finished its own stalled migration), agent-builder (found the approval loop was *broken on main*), tax (the block path silently wrote empty citation linkage — the tool now *requires* citations). Rule codified (#43) so blocks can't regrow.

**Act 5 — Live verification, three incidents deep.** Round 1: SSO logins minted cookies better-auth rejects (since #294; fleet-wide; gtm had *never* had working SSO). Round 2: prod sandbox chat had **never** reached the router (hard-coded `openai/` prefix + dead default model). Round 3: `creative-agent` absent from the platform `KEY_PRODUCTS` enum (clean same-wallet A/B proof). Each: product hotfix same-day, source fix in the right layer, fleet propagation, regression test of the round-trip kind that was missing. Plus the **deploy smoke gate** (#306, extended #323): SSO round-trip + real router call + MCP handshake on every master deploy — all three incident classes now go red instead of silent.

**Act 6 — Ship-it waves.** Capability-layer gating (#318 — last intent-regex deleted; proposals from inside missions link+park), tcloud spend cap (#320 — platform key out of boxes entirely, the session's one security finding), risk-tiered auto-start + goal-only missions (#321 — machine consent excluded from learning signals), one work ledger + delegation activity lane (#322 — workflows noun deleted), mission eval pack (#319, nightly). Took over Lin's #315 (MCP StreamableHTTP — sandbox turns were silently toolless; config-true, runtime-false).

## Session Flow Analysis

1. **FLOW: critique → rebuild → lift → adopt** (the substrate loop). Trigger: "is X overengineered?" Steps: adversarial audit → fix in consumer → lift proven shape to package → re-adopt with net deletion. Ran 3 full cycles. Automation: this IS `substrate-release` + `*-adoption`; the session validated the loop end-to-end.
2. **FLOW: live drive → incident → hotfix → source fix → propagate → fence.** Ran 3 times, converging each time. The fence step (smoke lane) is the non-obvious part most teams skip.
3. **FLOW: background agent → independent verify → push → PR → `checks --watch && merge` watcher.** ~18 iterations. Fully mechanizable as a skill (`/land <branch>`).
4. **Pivot worth noting:** Drew's "delegation survives across turns!" pushback was half-aspiration — the code didn't do it yet. Investigating instead of arguing produced the Phase-2 durable queue. Operator intuition about *design intent* beat the code's current truth.

## Cross-Project Patterns

- **Green suites, broken products.** Three production outages and one silent-toolless bug lived exactly at the seams every test mocked (auth round-trip, router contract, MCP handshake, key policy). Two repos had tests *asserting the broken behavior*. Pattern: **a test that doesn't round-trip the real artifact is a description, not a proof.** Counter-pattern shipped: deploy-time live smoke + round-trip regression tests, now in 5 repos.
- **Text conventions rot into bug shelters.** The `:::` audit found a broken approval loop and a compliance bypass *hiding under* unparsed/parallel block channels in 2 of 5 repos.
- **Multi-agent repos need worktree isolation by default.** Three collisions before the discipline stuck.
- **Fallbacks hide unknowable secrets**: `APP_TOOL_SECRET ?? TANGLE_API_KEY` meant prod's signing secret was unknowable to CI — found only because the smoke check failed live. Fail-loud doctrine vindicated again.

## Product Signals

- The verification campaign itself is a product shape: "drive your deployed product as a real user, on every deploy, with typed evidence" — what the smoke gate does manually could be `bad`/ui-test as a continuous service.
- Missions now have zero-friction entry (auto-start under $2) — the funnel instrumentation (proposed→approved→completed→deliverable-opened) is the next product question, before any new vertical.

## Action Items / Remaining

1. **Round 4 live verification** — #1973 merged + platform handled per Drew ⇒ unblocked NOW. Mission e2e + mid-step crash-resume: the program's final unproven claim.
2. Rotate the parent `TANGLE_API_KEY` if not already done (tool tokens now decoupled, safe).
3. Open substrate feedback: agent-app #40/#41/#42, SDK #1956 (typed usage on `TurnDriveResult` → real-dollar budget gates), agent-runtime #237.
4. Queued small adoptions: `resolveChatTurn`, web-react chat-shell (design pass), mission funnel instrumentation.
5. Verify gtm blocks retirement landed (Drew's lane) + insurance SSO posture (was latent-only).

## Next (explicit dispatch)

**Run round 4 now** — the live mission + crash-resume drive against deployed master with the full fixed stack. Everything else on the board is either filed, queued, or someone else's button.
