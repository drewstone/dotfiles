# Reflect: gtm-agent + vertical-agent fleet — session 2026-06-19
Date: 2026-06-19

## Run Grade: 7/10

| Dimension | Score | Evidence |
|---|---|---|
| Goal achievement | 6/10 | Fleet program shipped (teams/intakes/snappy-shell on 5 apps; intake redesigned + lifted to agent-app; ~30 PRs merged across 6 repos). BUT the marquee "make it work" outcome is **unfinished**: gtm's agent still does not boot in prod — the root fix (#2404) is merged to agent-dev-container `develop` (→ staging), not `main`/prod. The eval *caught* that it never worked; it isn't fixed-in-prod yet. |
| Code quality | 9/10 | Every change tested, root-caused, regression-guarded, reviewed before merge. Shared modules done opt-in/factory (teams, intakes, context-sufficiency). Fail-loud honored (surfaced the swallowed `.cause`). 3 real regression guards on the proxy fix, proven by revert-reproduces-hang. |
| Efficiency | 6/10 | Necessary depth, but real waste: ~25+ sub-agents; 2 boot-test agents rested mid-provision (no result); a fork role-confused and did zero work; the flake-fix broke 2 sibling tests on the first push; I re-framed "#330 fixes the hang" before the drill disproved it. The 7-layer spiral was partly inherent (each bug masked the next) but a box-internal drill *earlier* would have collapsed 2–3 deploy cycles. |
| Self-correction | 9/10 | Caught own wrong conclusions repeatedly via the claim gate: the dead `project_intake` store (in review, pre-merge), the `--json` regression (live run), the prompt-not-the-hang correction (the drill), the flake-fix breakage. Honest mid-course reversals throughout. |
| Learning | 7/10 | Memories written (intake-redesign, fleet-deploy-state updated with the sandbox footguns). But the #1 lesson — HTTP-200 ≠ working agent; no boot canary exists — was diagnosed, not yet operationalized. |
| Overall | 7/10 | Excellent process + discovery, high code quality, strong self-correction — undercut by an unfinished marquee outcome (gtm still down in prod) and a long, occasionally wasteful agent spiral. |

## Session Flow Analysis

1. **FLOW: ship-a-fix loop** — `worktree off default → edit → typecheck+test+build → PR → merge-on-green → deploy → re-verify`. Ran ~15×. Outcome: reliable, but hand-orchestrated each time. **Automation: a `ship` skill that takes a worktree + branch and runs the gate→PR→merge-on-green→deploy→smoke loop.**
2. **FLOW: lift-to-shared** — prove a capability in gtm → extract the product-agnostic core to agent-app (opt-in factory) → re-point gtm → enable other apps. Ran for teams, intakes, context-sufficiency, vault. Outcome: clean shared modules; the established grain.
3. **FLOW: eval → deeper bug → fix → deeper bug** — the spine. Real E2E evals peeled 8 distinct defects off gtm's never-booting agent (staging-sandbox routing → 4 KiB exec-proxy stream-hang → tilde→literal-`~` → read-only `/usr/local/bin` → 429 burst → no per-exec timeout/park → 131 KB double-shipped prompt → glm-4.7 model-at-create). Each masked the next.

**Operator questions revealing gaps:**
- Q: *"did you drive evals… real evals, multi-run, resumed, driver-simulated?"* → IMPLICATION: I'd been reporting "live/deployed/200" as "works." PRODUCT SIGNAL: **the entire fleet has no real agent-boot E2E test — HTTP 200 masked a completely dead product.**
- Q: *"what is this gigantic profile… why so large?"* → found skills **double-shipped** (131 KB inlined in the prompt AND written as files) → ~42K-token prompt + 502s. PRODUCT SIGNAL: profile composition was never measured/audited.
- Q: *"has everything been prd?"* → wanted a ground-truth accounting; revealed I track state in prose, not a dashboard.

**Pivot:** the operator's demand for *real evals* was the single highest-leverage intervention of the session — it converted "shipped + green" into "the agent has never once worked in production."

## Project Health

| Project | Trajectory | Note / next action |
|---|---|---|
| gtm-agent | **Improving but blocked** | Intake/shell/skills fixed + live. Agent **boot blocked** on #2404 reaching prod. Next: get #2404 to `main`+prod, then agent-app big-writes pairing + boot re-test. |
| agent-app | Improving | Now the fleet's shared core (teams/intakes/context-sufficiency/vault/sandbox). 0.33→0.39 this session. Healthy. |
| agent-dev-container (substrate) | **Latent risk surfaced** | The runtime exec proxy streamed bodies → hung >4 KiB. Fixed (#2404) but only on develop/staging. Substrate quality gap. |
| legal-agent | **Latent P0** | Agent never booted (0 users): inline profile (277 KB) > 256 KB create cap, no `deferProfileFiles`. One-line fix pending. |
| insurance-agent | **Latent P0** | Same as legal (363 KB inline). Box can't be created. |
| tax-agent | Healthy | Agent demonstrably works (15 recent assistant msgs); the only vertical whose agent boots in prod. |

**Fleet-level finding: 3 of 5 vertical agents have never produced a response in prod** (gtm hang, legal+insurance payload-too-large). 0 external customers, so latent — but the product line shipped non-functional and nobody knew.

## Skill / Dispatch Effectiveness

- **Workflows** (fan-out audits, standardization assessment, typecheck-fix): high value, structured output, parallelized well.
- **Single agents in worktrees** (the fix loop): reliable when the brief was precise + verification gates explicit.
- **Failure modes observed:** (1) `fork` subagent inherited my context and *role-confused* — narrated status instead of executing (zero work); lesson: **use general-purpose, not fork, for execution.** (2) Long-running E2E agents **rested mid-run** (set up a Monitor + came to rest) instead of waiting synchronously — lesson: **for a bounded long task, instruct synchronous run-to-exit, no Monitor.** (3) A `replace_all` edit changed only the matched call shape and **missed sibling call-sites** — lesson: enumerate ALL call sites before a signature change.
- **Recursive:** the `.evolve` scorecard reported the voice flow "met (4/4 grounded)" via **self-play** while the deployed agent was dead — the measurement infra measured the wrong layer. Self-play ≠ prod.

## Product Signals

1. **Agent-boot canary is missing fleet-wide (P0).** HTTP-200 liveness hid 3 dead agents for an unknown duration. The committed E2E driver (`eval/e2e/intake-e2e.ts`) is the seed of a real per-app boot canary: drive one real founder turn through `/api/chat`, assert a token + state write, alert on silence.
2. **Sandbox substrate fragility is a platform-quality issue.** A CF-Worker `fetch(duplex:"half")` shipping only the first ~4 KiB chunk silently wedged every large-profile agent. Worth a substrate-wide audit of streamed proxy paths.
3. **Profile/prompt bloat had no guardrail.** 131 KB double-shipped; deferred corpus = ~135 fragile execs. Needs a size/exec-budget lint.
4. **The shared eval harness** (operator's own ask) is validated: this session is the proof that real evals find what unit tests + deploys can't. Standardization plan already drafted.

## Proposed Automations

1. **`fleet-boot-canary` (cron, per app):** the E2E driver runs every N hours against prod, asserts the agent streams a real token + writes workspace state, pages on failure. Would have caught gtm/legal/insurance day one. *Highest value.*
2. **`ship` skill:** wrap the worktree→gate→PR→merge-on-green→deploy→smoke loop I hand-ran ~15×.
3. **Profile-budget lint (CI):** fail when the system prompt inlines content also shipped as files, or the deferred corpus exceeds a safe per-exec/byte budget.

## Action Items (by impact)
1. **Get #2404 to prod** (agent-dev-container develop→main release) — the one gate to gtm booting. Then agent-app big-writes pairing → gtm bump → boot re-test.
2. **Fix legal + insurance boot** — add `deferProfileFiles: true` (+ slim their inline corpus) so their boxes can be created.
3. **Stand up the fleet boot canary** from the committed E2E driver.
4. **Slim legal/insurance prompts** (same double-ship pattern as gtm #330).

## Next (executable dispatch)
`Next: /eval-agent — scope: fleet-wide prod agent-boot canary (per app: real /api/chat turn → assert token + state write), built from eval/e2e/intake-e2e.ts.` This is the missing measurement that let 3 dead agents ship. Until the canary exists, "deployed" cannot be trusted to mean "works."
