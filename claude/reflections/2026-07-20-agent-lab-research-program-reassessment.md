# Research program reassessment: stop treating profile tuning as learning

Date: 2026-07-20.

## Verdict

The research program is 2/10 today.
It has unusually strong records of failures, but it has no conference-ready self-improvement result and no evidence that its named proposer composition improves a coding agent.
The current R392 method is one-shot contextual advice: five traces and three binary outcome labels are compressed into prompt and mounted Markdown for an unchanged worker.
That is not teacher-student training, recursive self-improvement, a learned update rule, or a demonstrated structural advantage over prompt optimization.

The reset is categorical, not incremental.
`AgentProfile` remains useful as the serialized output of an improvement method, but it is not the research contribution.
The next contribution must be the update method itself: an advisor observes complete student trajectories and outcomes, predicts which executable intervention has positive advantage, changes the student, and improves performance on unseen repositories over multiple generations under matched total compute.

R392 is stopped as a flagship research path.
Its source may remain as engineering evidence, but another one-task profile screen cannot justify more research time before the advisor-student question is specified against current prior art.

## Grade

| Dimension | Score | Evidence |
|---|---:|---|
| Goal achievement | 1/10 | There are zero completed matched-compute comparisons of trace-and-outcome-authored AgentProfiles against fixed, trace-only, shuffled-label, prompt-optimized, and inactive controls. |
| Scientific novelty | 2/10 | The current paper and related-work section concede that typed configurations, trace-fed proposals, tool-documentation optimization, skill/memory evolution, and whole-agent search already exist. |
| Empirical strength | 2/10 | The surviving positives are narrow static treatment packages, output-format effects, small tax pilots, and an evaluation bug. |
| External validity | 1/10 | No method improves DeepSWE, SWE-bench, or another comparable coding benchmark. |
| Research efficiency | 1/10 | The operator session took 70 hours 14 minutes to reach the first model-bearing coding attempt and 71 hours 6 minutes to reach the first valid scored coding artifact. |
| Engineering and evidence integrity | 7/10 | Recent work retains patches, traces, usage, official scores, cleanup evidence, and autopsies unusually well. |
| Self-correction | 2/10 | The program diagnosed the same problem on July 4 and July 16, then repeated it through R392. |
| Communication and orchestration | 1/10 | One 11-day operator trace contains 456 subagent starts and a 30:1 corrective-to-positive human-reaction ratio. |
| Submission readiness | 0/10 | The canonical status and the venue snapshots say the current flagship is ineligible. |
| Overall | 2/10 | Honest negative knowledge and good evidence plumbing do not equal a frontier result. |

## Facts checked directly

1. The current comparison-log parser reports 351 structured records across 186 unique round numbers and 1,400 indexed run rows.
   It reports 777/1,400 rows still marked `pending verdict` and 782/1,400 rows unindexed or auto-archived.
   These are not independent experiments and must not be added.
   Check: `pnpm exec tsx projects/research-ops/full-comparison-log.mts --json /tmp/full-comparison-current.json --md /tmp/full-comparison-current.md` followed by `jq .summary /tmp/full-comparison-current.json`.

2. The R360-R392 coding phase occupies 109 indexed rows.
   A row-by-row audit classifies 98 as registration, calibration, infrastructure, transport, recovery, or support; nine as valid single-arm or mechanism diagnostics; and two as completed model-calling comparisons.
   Those two comparisons were R378, a `1/3` versus `1/3` exposed-task tie unrelated to AgentProfile learning, and R389, a one-task `1` versus `1` tie in which learned context used 2.65 times the tokens and 94 versus 56 internal model iterations.
   The phase contains zero completed matched-realized-compute comparisons of the central outcome-conditioned AgentProfile claim.

3. R391 uses 14 indexed rows for calibration, six preflights, metering, transport, and private-worker checks.
   It completed zero profile authors, zero task workers, and zero official scores.
   R392 has zero indexed run rows, zero model calls, and zero scores.

4. From the R360 research pivot to current `origin/main`, the repository accumulated 307 commits: 289 non-merge commits, including 120 `fix`, 72 `research`, 49 `feat`, 21 `chore`, 18 `test`, and eight `docs` subjects.
   Check: `git rev-list --count 45343775..origin/main`, `git rev-list --count --no-merges 45343775..origin/main`, and prefix counts over the commit subjects.

5. The full operator trace spans 117,820 JSONL lines and 286,695,755 bytes.
   The trace analyzer reconstructed 52,746 spans and 24,600 tool calls.
   It found 2,994 exact repeated calls, 1,517 failed calls, and 1,516/1,517 failures followed by another call to the same tool.
   It observed 502 spawn requests and 456 actual subagent starts.
   Of 81 human turns following assistant turns, 31 contained a reaction signal: 12 corrections, 18 frustration signals, and one praise signal, a 30:1 corrective-to-positive ratio.
   Check: `/home/drew/code/traces/node dist/cli.js analyze --harness codex --session /home/drew/.codex/sessions/2026/07/09/rollout-2026-07-09T14-01-47-019f4878-d9c3-7a53-a04e-7d88cb8207ad.jsonl --out /tmp/agent-lab-process-audit-2026-07-20-long-session.md --otlp /tmp/agent-lab-process-audit-2026-07-20-long-session.otlp.jsonl`.
   The report SHA-256 is `7797b105962a0403cfd3ffe9e850c18fdbbc3ef0964037dc5943f8edac7a942e`.
   The source has one corrupt record, and task quality and cost are not joined to this trace, so it supports process claims only.

6. The first model-bearing coding attempt occurred 70 hours 13 minutes 54 seconds after the original assignment.
   It failed before a completed result.
   The first valid scored coding artifact arrived 71 hours 5 minutes 50 seconds after assignment and was explicitly an `n=1` infrastructure recovery, not independent research evidence.

## What the research was, and how it drifted

The program has moved through five different central objects.

| Regime | Question | Honest result | Why it did not become the next theory |
|---|---|---|---|
| Depth, breadth, and memory | Does a supervisor allocation or reusable memory improve agents generally? | The powered depth effect shrank to `+4.1` points with 95% CI `[-1.6,+10.2]`; AppWorld reversed sign. | The general allocation claim failed. |
| Deliberation policy and action contracts | Can prompts, files, actions, routing, and budgets substitute for model capability? | A hand-written EOPS package reached `22/22` versus `5/22` on one internal family; ToolLLM format constraints reached `9/10` versus `7/10`. | These are static, task-specific packages and formatting effects, not automatic learning. |
| Minimal profile-diff law | Does the smallest causal profile change vary with model size and task difficulty? | Small BFCL upper bounds were measured; the model-size by difficulty law was never estimated. | Search and measurement machinery grew before a valid hard-task grid existed. |
| Construct-validity paper | How much tool benefit comes from readable semantics versus execution? | The intended factorial was invalid because semantic identifiers survived stripping, action firing was sparse, and fresh arms received extra resources. | The paper became an honest autopsy, not the claimed causal result. |
| Outcome-conditioned coding improvement | Can complete traces and outcomes generate executable changes that improve fresh repositories? | One repository-disjoint comparison completed, but both arms solved the task and the learned arm spent 2.65 times more tokens. | The central causal comparison has never completed. |

The shifts were not harmless refinements.
They changed the intervention, outcome, target benchmark, and novelty claim before the prior decisive experiment closed.
The supposedly frozen hypothesis family was amended twice, first with H7 and then with H8.

## What actually survives

The following results are real but narrow.

- A same-model, hand-specified EOPS action-and-guidance package changed one internal family from `5/22` to `22/22`.
- A strict output contract improved deterministic validity on a ten-task ToolLLM sample, but four of five templates lacked distractor APIs.
- Small tax-profile pilots were directionally positive but underpowered.
- A lexical safety check confused explicit refusal with compliance; refusal-aware adjudication corrected the error.
- Outcome-based schema-text revision fit one observed EOPS source from `0.375` to `1.0`, but different-source evaluation produced `0/4` counted attempts.

None of these establishes autonomous improvement, a structural advantage over prompt optimization, or a coding-benchmark lift.

## Why the process failed

### 1. The progress metric was wrong

The workflow optimized round completion, artifact retention, checks, and mergeable infrastructure.
The scientific unit should have been a completed comparison that changes belief about one frozen hypothesis.
Once a registration, preflight, recovery, or report received a new round number, the archive visually rewarded motion even when task information remained zero.

### 2. The representation was mistaken for the algorithm

An AgentProfile is a carrier for prompt, files, tools, permissions, and other execution settings.
R392 treats authoring that carrier as the learning contribution.
Its mutable surface is prompt plus mounted Markdown; GEPA receives one reflection with no population search, SkillOpt receives one text proposal rather than an improvement loop, FAPO makes zero model calls and applies a hand-written routing rule, and the Runtime proposer validates an already-authored diff.
This is manual or model-assisted contextual tuning with branded composition, not a learned advisor.

### 3. Safety work became an unbounded prerequisite stack

Real problems in isolation, receipts, cleanup, provider transport, cost accounting, and task leakage had to be fixed.
The mistake was allowing every newly discovered failure to create another general prerequisite and another round, rather than selecting one stable execution path and imposing a strict time budget on repairs.
The result was production-grade forensic evidence around zero scientific comparisons.

### 4. Correct diagnosis did not change behavior

The July 4 critique said the previous seven days had produced roughly 70 rounds and 416 artifacts with zero new quality evidence.
The July 16 reflection graded the program 2/10 and reset it around one scored candidate.
The current trace still shows the same build, preflight, failed canary, new-round pattern.
This is the most important failure because another process document cannot solve a behavior that already ignored two correct process documents.

### 5. We used breadth to avoid the hard comparison

The operator trace shows 456 subagent starts and 489 distinct task names.
Hundreds of short audits and builders distributed attention while no owner remained responsible for one completed scientific comparison.
Parallelism increased local throughput and reduced global accountability.

### 6. Competitive baselines were postponed

The current paper explicitly lacks a content-equivalent prompt control and an optimized-prompt control.
The learning program lacks completed trace-only, shuffled-label, prompt-only, inactive-footprint, teacher-critique, and stronger-teacher comparisons.
Without those arms, even a positive profile result would not identify what was learned.

### 7. The benchmark was treated as the last mile

EOPS and one-task screens let the workflow demonstrate formatting, tool access, and integration.
The requested claim is better performance on useful unseen work.
That requires a public coding benchmark to be the first design constraint, not a later promotion stage after internal optimization.

### 8. There was no empirical heartbeat

No rule required a scored, decision-bearing comparison within a fixed wall-clock interval.
A sensible program would stop or switch execution paths if it cannot produce one informative task result within two hours or one repair cycle.
Seventy-one hours to an `n=1` infrastructure result is decisive evidence that the workflow lacked this constraint.

## Agent behavior audit

| Failure class | Evidence | Correction |
|---|---|---|
| Fake action | Registrations, source checks, and transport proofs were discussed as progress toward the research result despite zero task outcomes. | Report only changes in the scientific denominator as research progress. |
| Blind action | Paid and official runs repeatedly stopped on known classes of transport, accounting, isolation, and cleanup failure. | Permit one repair cycle per execution path; then replace the path. |
| No learning | The July 4 and July 16 diagnoses were correct, but the same loop continued. | Make the stop rule executable: no new round until the prior round changes a task outcome or is retired. |
| Bad incentives | Round count, test count, and artifact completeness displaced hypothesis information. | Track completed comparisons, unseen tasks, matched compute, and effect size as the only progress counters. |
| Missing observability | The operator trace has no joined task-quality or cost outcome, and skill events are missing. | Join session, run artifact, task score, model calls, tokens, and dollars before using traces to improve the workflow. |

## Central questions after the reset

The static action-schema question and the self-improvement question are separate research programs.

### Program A: causal interface science

Question: holding model, task, visible bytes, tool availability, and compute fixed, how much benefit comes from readable action semantics versus executable capability?

This is a narrow causal paper.
It is potentially useful, but the current experiment is invalid and the current paper is an autopsy.
It should continue only if a clean factorial can be executed quickly on a public, stateful task set with content-equivalent and optimized-prompt controls.

### Program B: advisor-student agent learning

Question: can an advisor learn an update rule from complete student trajectories and external outcomes that produces executable changes and improves a student on unseen repositories beyond teacher critique, prompt optimization, retrieval, and direct solution distillation at equal total compute?

This is the ambitious company-defining program.
The required object is an update operator, not a profile author:

`updated student = U(current student, trajectories, outcomes, candidate history, compute budget)`.

The update may emit profile text, tools, code, memory policy, coordination policy, inference budget, or a weight-training dataset.
AgentProfile is one deployment format for those outputs.

The smallest convincing experiment requires:

1. A student that has stable failures on predeclared public coding tasks.
2. A stronger or differently trained advisor that receives complete training trajectories and official outcomes.
3. At least two update generations, where the second update observes the first updated student's outcomes.
4. A prompt-only optimizer, teacher critique, trace-only, shuffled-label, inactive-change, and direct teacher-solution distillation control.
5. Identical total author plus worker inference allowance across methods, with realized tokens and model calls reported.
6. Repository-hidden validation followed by a sealed DeepSWE or SWE-bench evaluation.
7. Every proposed intervention retained so a value model can learn which changes have positive held-out advantage.

The strongest possible novelty is not “we tune more profile axes.”
It is that correct trajectory-outcome pairing trains or selects an executable update operator whose interventions transfer across repositories and compound over generations.
That novelty remains an unverified hypothesis until a current primary-source review is complete.

## Immediate decisions

1. Stop R392 as the flagship and do not merge or run it for a paper claim.
2. Do not add another proposer, skill, context compiler, transport, or research-process document before the next scored comparison.
3. Preserve the static interface result as a separate narrow line; do not use it as evidence for learning.
4. Run a current primary-source novelty review of advisor-student distillation, agent-system evolution, workflow-to-weights compilation, and value-guided update selection.
5. From that review, freeze one advisor-student experiment whose first paid unit is a completed task comparison, not another readiness proof.
6. Require a scored pilot within two hours of execution work; after one repair cycle, switch to an already proven worker path.

## Skill assessment

`reflect`, `autopsy`, `calibrate-before-measure`, and evidence-retention skills often produced correct local decisions.
They failed globally because there was no enforced limit on how many local checks could precede one result.
`multi-pursue` and broad subagent dispatch were actively harmful at this scale: 456 starts spread ownership across hundreds of one-off tasks.
`evolve` optimized the active round instead of questioning whether the round still represented the research question.

The needed improvement is not more skill prose.
Every research skill should share three hard counters: time to first scored comparison, number of repair cycles before path replacement, and number of completed hypothesis-bearing comparisons.
If those counters do not move, the skill must stop producing new rounds.

## Dispatch

Next: `/hypothesize`.

Condition: compare the advisor-student program against current primary sources, generate multiple falsifiable mechanisms, and choose the one whose novelty survives and whose first useful coding comparison can complete immediately on existing execution paths.

Do not dispatch `/evolve` until the new hypothesis, controls, task split, matched-compute definition, and kill rule are frozen.
