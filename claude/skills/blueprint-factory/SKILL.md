---
name: blueprint-factory
description: "Six-stage pipeline for running a Tangle blueprint from greenfield to production-ready reference quality in one session. Orchestrates /pursue per generation, spawns adversarial personas continuously (not post-hoc), enforces a pre-complete gate, and produces a scorecard. Use when the user says 'build a blueprint for X', 'new blueprint', 'factory another one', or wants to run the distributed-sql-blueprint pattern against a new problem. Extracted from the distributed-sql-blueprint session — see that repo's research/process/blueprint-factory-pipeline.md for the full spec."
---

# Blueprint Factory — Greenfield to Reference-Quality in One Session

The distillation of the distributed-sql-blueprint session: six stages,
per-stage prompts, trace expectations, pass gates, and a 10-point
scorecard. Runs `/pursue` per generation, dispatches persona sub-agents
continuously, produces `research/` as a final artifact.

Read the source spec at
`~/webb/distributed-sql-blueprint/research/process/blueprint-factory-pipeline.md`
for full details. This skill is the executable summary.

## When to use

- Greenfield Tangle blueprint (`~/webb/<name>-blueprint`)
- User has a problem statement and wants a working, honest, testable
  implementation — not a demo
- Session has ≥4 hours of budget (or accept Stage 5 will be skipped)

Do NOT use for:
- Adding features to an existing blueprint (use `/pursue` directly)
- Library crates without Tangle surface (use regular dev flow)
- Experiments where honesty-discipline is overhead (use `/evolve` direct)

## Inputs

- `name` — blueprint name (e.g., `distributed-ml-blueprint`)
- `problem` — one-sentence problem statement
- `axes` — optional comma-separated axis decisions
  (consensus, trust, payment, storage, security, failure-domain)

If `axes` omitted, Stage 1 will prompt for them. Do not proceed past
Stage 1 with any TBD.

## The six stages

```
STAGE 0  FORENSICS + REPO SKELETON           15 min  | 1 prompt
STAGE 1  THESIS + AXIS DECISIONS             30 min  | 1-2 prompts
STAGE 2  GEN 0 — SKELETON END-TO-END         1-2 hr  | 2-3 prompts
STAGE 3  GEN 1..N — CAPABILITY BUILDOUT      loop    | /pursue per gen
STAGE 4  ADVERSARIAL PASS                    parallel to 3
STAGE 5  MULTI-NODE PROOF                    2-4 hr  | operator-owned
STAGE 6  META-REVIEW + HANDOFF               1 hr    | 1 prompt
```

### Stage 0 — Forensics + repo skeleton

```
Bootstrap <name> at <path>. Install SessionEnd + PreCompact archive
hooks from ~/dotfiles/claude/settings.json. Git init. Create src/,
tests/, docs/, scripts/, .evolve/. Commit skeleton.
```

**Gate**: `git log` shows 1 commit. Hooks fire. If the watcher caveat
applies, operator must `/hooks` once.

### Stage 1 — Thesis + axis decisions

```
Write docs/THESIS.md (one page): problem, axis decisions (all 6 rows,
no TBD), explicit non-goals, success criteria, rejected moonshot.
Also init docs/LIMITS.md. Commit.
```

**Gate**: one-sentence answer to "what is this?" from THESIS.md.
Every axis decided.

### Stage 2 — Gen 0 skeleton

```
Gen 0: lib crate + thin binary + ONE Tangle job + ONE BlueprintHarness
integration test + harness.toml + blueprint-definition.json +
deploy-local.sh + XBlueprintBuilder::from_env(). cargo test passes.
LIMITS.md lists everything deferred. Commit.
```

**Gate**: `bash scripts/deploy-local.sh --dry-run` exits 0.

### Stage 3 — /pursue per generation

For each generation:

```
/pursue Gen N of <name>.
Thesis: <one sentence>.
In scope: <list>.
Out of scope: <list>.
Hard constraints:
  - Builds on Gen N-1 without breaking its tests
  - New tests would FAIL on Gen N-1 code
  - Paranoid default for security-adjacent code
  - LIMITS.md delta ≥ 1 entry
  - Claim-with-counterweight for every new capability
Before declaring done, run pre-complete gate.
```

**Pre-complete gate** (all must be YES):
1. Every new doc claim has a test that fails without the code?
2. Every new crypto op has key-lifecycle doc?
3. Every "distributed" claim has ≥2-process test (separate ports)?
4. Every "deferred" has named owner/trigger?
5. `deploy-local.sh` still runs?

**Gate for stage overall**: test count ≥5× Gen 0, ≥1 gen is
architectural (not just features), every gen is a separate commit,
no stubs pass tests silently.

### Stage 4 — Adversarial pass (continuous, after every Gen commit)

Dispatch sub-agents in parallel after each Gen N commit:

**Skeptic** (always):
```
Adversarial review of Gen N diff. Find (1) a doc claim the code
doesn't support, (2) a "deferred" that's actually "hoping", (3) a
test that passes trivially. Rank by day-90 blast radius. ≤300 words,
no charity reading.
```

**Security** (if diff touches auth|crypto|jwt|secret|key|hash|sign|
encrypt|ipfs|s3|http):
```
Security review of Gen N diff. Identify (1) paranoid default NOT
chosen, (2) attack that works today, (3) minimum patch. ≤250 words.
```

Store at `research/adversarial/gen-N-{skeptic,security}.md`.

**Gate**: any "blast radius = high" finding either fixed OR accepted
in LIMITS.md with reasoning before Gen N+1 starts.

### Stage 5 — Multi-node proof

Operator-owned. Agent can write the script, not provision the infra.

```
N-node deployment (N ∈ {3,5,10}). Separate processes, separate hosts
or distinct networking. Run T hours under production-like load.
Record p50/p95/p99 latency, throughput, leader-kill recovery time.
Write docs/DEPLOYMENT-RUN.md with exact numbers + timestamp +
commit SHA + env. Edit README to cite DEPLOYMENT-RUN for every
distributed claim.
```

**Gate**: DEPLOYMENT-RUN.md has a number that would be painful to
fake. "p95=47ms at 1000 RPS against 5 ops for 6h" = credible. "Runs
fine" = not.

**If Stage 5 can't happen this session**: README must explicitly say
"distributed properties asserted in tests only; no real deployment
proof yet." Don't silently omit.

### Stage 6 — Meta-review + handoff

```
Meta-review pipeline for <name>:
1. Dispatch 5 persona sub-agents in parallel (architect, security,
   economist, skeptic, process-analyst). Each produces scored rubric
   + top-3 strengths + top-3 weaknesses + verdict. Write to
   research/judgments/0{1..5}-*.md.
2. Write research/trajectories/chosen-vs-alternatives.md from
   THESIS axis decisions + per-axis counterfactual.
3. Write research/mind-simulation/what-you-were-thinking.md —
   theory-of-mind with falsification tests.
4. Write research/synthesis/meta-review.md — aggregate score table,
   verdict (PRODUCTION/EXPERIMENTAL/PROTOTYPE/TOYLIKE), top-3 ranked
   follow-ups.
5. Commit as "Meta-analysis."
```

**Gate**: synthesis verdict matches cold-reader conclusion. If overly
generous, second skeptic pass required.

## Operator vs agent division of labor

The highest-leverage insight: **operator value and agent value don't
overlap**. Do not ask the operator to do agent-value work, and do not
have the agent make operator-value calls.

**Operator-only prompts** (expect 5-10 per session):
- Ambition-setting ("10+ operators", "do gen 3 and 4 at once")
- Honesty constraints ("critique why this is wrong", "write LIMITS.md")
- Threat-modeling catches ("shouldn't this be encrypted?")
- Taste calls ("shy away from tiers", "rename or delete, don't stub")
- "Is this really done?" pushback

**Agent does unprompted**:
- Scaffolding, tests, docs, builder pattern
- Parallel research spawns at decision points
- LIMITS.md drafting (operator reviews)
- Forensics + archival
- Pre-complete gate enforcement
- Per-gen adversarial sub-agent dispatch

**Red flag**: if an operator prompt is >3 lines of spec, ask "is this
spec or constraint?" Spec = agent's job in disguise.

## Scorecard (10 dimensions)

| Dimension | Pass threshold |
|---|---|
| Compiles | `cargo build --all-targets` clean |
| Tests | ≥20 passing, ≥1 BlueprintHarness integration |
| Coverage | Every new doc claim has failing-without-code test |
| Honesty | LIMITS.md ≥10 entries with named owner/trigger |
| Multi-node | DEPLOYMENT-RUN.md OR README honestly disclaims |
| Security | No HS256/shared-secret/plaintext defaults |
| Architecture | Persona dispatch returns no 3+-way-agreed BLOCKER |
| Reversibility | Every gen is separate git commit |
| Ergonomics | `from_env()` + builder + `deploy-local.sh` runs |
| Meta | research/ populated by Stage 6 |

- 10/10 = REFERENCE-IMPLEMENTATION
- 7-9 = PRODUCTION-READY
- 4-6 = EXPERIMENTAL
- ≤3 = TOYLIKE

## Anti-patterns (block on any)

1. Ceremony preambles ("I'm about to...")
2. Premature-complete (pre-gate must pass)
3. Ergonomic default for security-adjacent code
4. "Distributed" claim with only inline test
5. Stub-that-looks-real (must fail loud, delete, or `todo!()`)
6. Mocks at internal seams
7. `.toBeDefined()`-style assertions
8. Generation without a thesis
9. Skipping Stage 0 (lose session on crash)
10. Skipping Stage 4 per gen (catch issues only at end)

## Min-viable prompt set (happy path)

Seven prompts if no interjections needed:

1. `/blueprint-factory bootstrap <name> at <path>`
2. `Write THESIS.md with axes for <problem>`
3. `Gen 0 skeleton`
4. `/pursue Gen N — <thesis>` (loop)
5. `Dispatch skeptic + security on Gen N` (per gen)
6. `Stand up N-node deployment, write DEPLOYMENT-RUN.md`
7. `Meta-review pipeline`

Real sessions: 2-5× that many, because of operator-value interjections.
That's correct — those are the leverage points, not overhead.

## Source

Extracted from `~/webb/distributed-sql-blueprint/research/`. That repo
is the worked example. When in doubt about a stage, read:

- `research/process/blueprint-factory-pipeline.md` — full spec
- `research/process/skills-and-flows.md` — what actually happened
- `research/synthesis/meta-review.md` — cross-persona verdict shape
- `research/mind-simulation/what-you-were-thinking.md` — operator model
