---
name: _ladder
description: "Author-side reference, not a skill. One map for the whole skill family: the improvement loop, the escalation ladder by swing size, the clusters the flat names hide, the three preconditions for running the loop at all, and how the system points its loop at its own skills."
---

# The Skill Ladder — one map for the whole family

Companion to `_common.md`.
Same status: this is documentation for **skill authors**, not a skill the harness ever loads or invokes.
`_common.md` holds the shared *rules*; this file holds the shared *shape* — how the flat skill names compose into one system.

`skills/` holds 53 entries today: 52 local skill folders (each with a `SKILL.md`) plus one symlink to an external skill (`build-with-agent-runtime`, sourced from the agent-runtime repo).
Of the 52 local folders, 49 are live skills and 3 are merge-shims that only redirect: `code-review` → `critical-audit`, `research` → `evolve`, `site-clone` → `bad`.
The flat directory hides how those ~50 live skills fit together. This map restores that structure.

The inventory here can lag; **`ls skills/` and each `SKILL.md` frontmatter are always authoritative, this file never is.**
What frontmatter does *not* encode is each skill's place in the system — which loop phase it serves, which rung it sits on, what it gates, which cluster it belongs to. That relational structure is the only thing this map adds.

## A. The improvement loop

Four phases, one cycle. LEARN feeds back into THINK — that return edge is the whole point.

| Phase | The question it answers | Skills |
|---|---|---|
| **THINK** | What is even worth trying? | `/hypothesize` — research the space, rank a portfolio of bets |
| **BUILD** | Make the change. | `/pursue`, `/meta-harness`, `/breakout` (and `/evolve`'s own edit step) |
| **MEASURE** | Did the number move, for real, past noise? | `/evolve` + the keep/promote gates below; `/eval-agent` first if no evaluator exists yet |
| **LEARN** | What does the result actually teach? | `/reflect`, `/autopsy`, `/diagnose` |

Two skills sit *above* the phases:

- **`/governor` is the router.** It reads `.evolve/` state, git, and the objective, picks the single next phase/skill, dispatches once, and exits. It does no work itself.
- **`/orchestrate` is the composer.** When a goal is too big or too novel for any single skill, it *chooses* the workflow shape — pipeline, parallel barrier, judge-panel, loop-until-dry, adversarial-verify, multi-modal sweep — and wires other skills in as the stages, then synthesizes. `/governor` picks one skill; `/orchestrate` composes many.

`/multi-pursue` is the fixed-shape composer under `/orchestrate`: always N independent `/pursue` tracks plus one synthesis.
(`/arena-experiment` is an equal-compute controlled comparison of architectures, not a composer — it lives in the Execution cluster.)

**Two measurement gates, two costs — keep them separate:**

- **KEEP guard** — cheap, runs on every candidate. A change is kept only if its delta clears **2× the run-to-run noise floor**. `/evolve`'s deterministic loop emits that floor every run (`p50_ms_noise` and friends); a delta inside 2× it is not a win, it's noise (`evolve/references/deterministic-loop.md`).
- **PROMOTION gate** — expensive, runs once per graduating winner. A kept winner is promoted into the baseline/defaults only when a **bootstrap confidence interval on the delta excludes zero** (default 10000 resamples; `evolve/references/STATS.md`).

Teaching the expensive gate as if it ran on every keep is the common mistake; it doesn't.

## B. The escalation ladder (by swing size)

Same target, six sizes of swing. Small to large:

| Rung | Swing | Trigger |
|---|---|---|
| `/polish` | smallest | Work is basically right — apply the fixed rubric and close every gap. No new design. |
| `/evolve` | small | Measured target; the metric still moves on parameter / prompt / config changes. |
| `/pursue` | medium | The approach itself is wrong or capped — design one coherent new generation. |
| `/multi-pursue` | medium-wide | Several independent designs worth building at once; a synthesis picks the winner. |
| `/meta-harness` | wide | Progress plateaued and architecture search can be automated against a benchmark. |
| `/breakout` | widest | The target itself is the cage — change the regime so a higher target becomes reachable. |

**Escalate only when the smaller swing provably cannot reach.**
"Provably" names a procedure, not a feeling: the metric's gain over the last several real (non-cosmetic) edits stays inside **2× the measurement noise floor** — `/evolve` emits that floor every run — or you can name the mechanism that caps the current rung.
Climbing a rung you didn't need burns compute and oversight; skipping a rung you did need keeps you optimizing a dead approach.

`/orchestrate` is not a rung — it composes rungs. Reach for it when the goal wants several of these wired into one plan, not a single bigger swing.

## C. The clusters the flat names hide

The cluster names below are a legibility overlay for reading the family — not a competing taxonomy.
`/governor`'s own decision labels (exploit / explore / bootstrap / diagnose / step-back) remain the canonical routing vocabulary.
Each skill has one home here and is cross-referenced, not re-listed, elsewhere.

### Guards — gate BEFORE action

The one class allowed to interrupt at the *front* of a flow (see `_common.md` "guard skill" exception). Their whole purpose is to stop a bad measurement before it happens.

| Guard | Fires before | What it makes you prove first |
|---|---|---|
| `/calibrate-before-measure` | any eval / A-B / benchmark | The metric can actually see the effect, and the task is hard enough to need the capability. |
| `/ground-truth` | any optimize / debug / speed-up of a live system | The full real-path measured harness is standing — every hop instrumented, real env not a local stand-in. |
| `/dont-collapse-the-architecture` | the first marginal A-B on a new architecture | The regime that makes the ambitious design pay off was actually active before you judge it. |
| `/push-past-easy` | the moment you reach for the safe version | You picked the experiment that could fail, not the flattering one. |

### Cognition / Learn — THINK and the post-mortems

| Skill | Loop phase | Role in the loop |
|---|---|---|
| `/hypothesize` | THINK | Survey prior art + the real ceiling, generate a diverse field, rank by expected value, hand a portfolio to `/evolve` or `/pursue`. |
| `/diagnose` | LEARN | Cluster many failures by root cause; rank by impact × fix effort. |
| `/autopsy` | LEARN | Root-cause ONE null / surprising result — real effect vs artifact / no-op / measurement bug. |
| `/reflect` | LEARN | Learn across sessions; grade skills; name the systemic pattern. Fills `operatorOverride` post-hoc. |
| `/report` | readout | Answer an analytical "did X work" as a quantified artifact, not prose. |

### Measure — build the ruler, then use it

| Skill | Role in the loop |
|---|---|
| `/eval-agent` | Build the LLM-as-judge when a subjective target has no evaluator yet (the bootstrap phase). |
| `/evolve` | The core measure → diagnose → experiment → verify → compare loop, with the keep/promote gates from Section A. |
| `/eval-harness-diagnose` | When pass/fail looks contaminated (auth / route / judge / baseline), suspect the ruler, not the agent. |

### Execution — build, compose, converge, release, close out

| Skill | Role in the loop |
|---|---|
| `/pursue` | BUILD one coherent new generation. |
| `/multi-pursue` | BUILD — N parallel `/pursue` tracks + central synthesis. |
| `/meta-harness` | BUILD — automated architecture evolution after a plateau. |
| `/breakout` | BUILD — raise the target / change the regime. |
| `/orchestrate` | Compose several skills into a bespoke multi-stage plan when no single skill fits. |
| `/arena-experiment` | Equal-compute controlled comparison of architectures across a difficulty axis. |
| `/converge` | Drive failing CI to green by fixing root causes. |
| `/review-to-green` | Drive a PR to an approving / no-blockers review. |
| `/ship` | Full release path with live smoke proof. |
| `/deploy-proof` | Prove the merged change is actually live in production. |
| `/release-conductor` | Run opaque / custom releases with a ledger, rollback path, and handoff. |
| `/verify` | Build / test / git completion check before any "done" (the loop's close-out step). |
| `/handoff` | Session-to-session brief so a fresh agent resumes with zero loss. |

### Quality — fixed-bar review and cleanup

| Skill | Role in the loop |
|---|---|
| `/polish` | Fixed rubric; close every gap in work that's basically right. |
| `/harden` | Adversarial security validation — invariants, fuzz targets, races. |
| `/critical-audit` | Staff-engineer review; severity-ranked, file:line findings (absorbed `/code-review`). |
| `/simplify` | Capability-preserving simplification — kill duplication and god objects without losing behavior. |
| `/deep-clean` | Measured dead-code / debt cleanup with before/after proof. |

Audit siblings — the same fixed-bar review shape aimed at other surfaces: `/product-design-audit`, `/product-innovation-audit`, `/docs-slop-audit`, `/agent-behavior-audit`, `/harness-escalation-audit`, `/ui-test`, `/semgrep`.

### Adoption — kill-and-replace, never re-implement platform code

| Skill | Adopts |
|---|---|
| `/build-agent-app` | `@tangle-network/agent-app` shell framework. |
| `/agent-eval` | `@tangle-network/agent-eval` internals. |
| `/agent-integrations-adoption` | `@tangle-network/agent-integrations`. |
| `/hub-sdk-adoption` | `@tangle-network/hub-sdk`. |
| `/sandbox-sdk-integration` | `@tangle-network/sandbox` SDK. |
| `/build-with-agent-runtime` | External skill — a symlink into the agent-runtime repo, not a local folder; adopts that runtime's app framework. |

### Outside the loop

Domain / craft skills that aren't loop phases: `/product-design`, `/signal-distill`, `/writing-profile`, `/tangle-blueprint-expert`, `/nano-banana`, `/bad`.
Merge-shims (redirect, don't invoke): `/code-review` → `/critical-audit`, `/research` → `/evolve`, `/site-clone` → `/bad`.

## D. When the loop applies at all — the three-precondition test

The loop is powerful and expensive. It earns its cost only when all three hold:

| Precondition | The test | If it's missing |
|---|---|---|
| **Real repeatable measurement** | Run the same check twice — do you get a number you'd stake a decision on? | Build it (`/ground-truth`, `/eval-agent`) or just plan → build → ship. No ruler, no loop. |
| **Wide solution space** | Is there genuinely more than one real way to do this? | One obvious way → build it. The loop's exploration is pure overhead. |
| **Iteration budget** | Is there compute/time for ≥3 measured rounds? | One-shot work → plan → build → ship. |

Miss any one and the loop is ceremony.
The tell: you're logging rounds and dispatches, but the number isn't moving and there was only ever one thing to try.
When in doubt, the honest default is plan / build / ship, not a loop wrapped around a single foregone change.

## E. The self-improvement meta-loop

The family is itself an action space — 49 live local skills, each a markdown file you can edit.
So the same four-phase loop can point at its *own* skills, with skill quality as the metric and `SKILL.md` as the artifact being changed.

| Phase | What it does here | Files that make it real |
|---|---|---|
| **MEASURE** | Read where skills waste effort or get overridden. | `.evolve/skill-runs.jsonl` (`operatorOverride` vs `dispatchedTo`), `~/.claude/halo/profiles.jsonl` (one loop-waste profile per session), `.evolve/reflections/<ts>.md` |
| **THINK** | Hypothesize which skill edit lowers override / loop-waste. | `/hypothesize` over the three sources above |
| **BUILD** | Edit the skill's markdown. | `~/dotfiles/claude/skills/<name>/SKILL.md`, then rerun `~/dotfiles/claude/install.sh` |
| **MEASURE again** | Did the override rate actually fall over the next runs? | re-read `.evolve/skill-runs.jsonl` |

The metric, computed today in one command — per-skill operator-override rate over the log, the single best evidence a skill's routing is wrong:

```bash
jq -rs 'group_by(.skill)[]
  | {skill: .[0].skill, n: length,
     overrides: (map(select(.operatorOverride != null)) | length)}
  | "\(.skill): \(.overrides)/\(.n) overridden"' .evolve/skill-runs.jsonl
```

The tooling that makes capture real — deterministic, fail-silent, roughly constant memory:

- **Capture** — `hooks/halo-profile.sh` runs on Claude Code SessionEnd, pipes the transcript to `tools/halo-extract.mjs`, and appends one loop-profile per session to `~/.claude/halo/profiles.jsonl`.
- **Triage** — `tools/halo-report.mjs --flagged` scores each profile for loop-waste (e.g. ≥100 hand CI-polls, high tool-error rate, deploy/CI churn) and forwards only the worst sessions to the expensive trace-analyst. Profile everything; analyze the tail.
- **Per-run log** — `tools/skill-run-log` (symlinked to `~/bin/skill-run-log`) appends one row to `.evolve/skill-runs.jsonl` on skill completion.
- **Self-analysis** — `/reflect` (skill) and `reflect-last` (a *command*, `commands/reflect-last.md`, not a `skills/` folder) run the published `@tangle-network/traces` CLI: `traces analyze --harness claude-code --last 1` on the session's own transcript.

What is wired vs what is not — stated plainly, because this is the leapfrog capability and it still has one hand-operated step:

- **Wired and automatic: capture.** Every session ends → `halo-profile.sh` writes a profile; every skill run → `skill-run-log` writes a row. No human in that path.
- **Not wired: the THINK→BUILD trigger.** Today a human reads `halo-report --flagged`, decides which skill to edit, and edits it. Nothing dispatches a skill-edit from a measurement on its own.
- **The next rung** that would close it: a periodic `/reflect` portfolio pass that reads `skill-runs.jsonl`, computes the per-skill override rate above, and auto-dispatches `/governor` on any skill over a threshold T.

The recursion, stated honestly: the improvement loop's own action space is a directory of markdown, so the loop *can* rewrite the loop — capture is automatic, the edit is still a human call.
Override rate and loop-waste are the number; `SKILL.md` is the change; the same keep/promote honesty from Section A applies before any skill edit is called an improvement.
