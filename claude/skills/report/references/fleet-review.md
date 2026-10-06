# Fleet review question register

Use this reference for recurring fleet reviews, broad research status, or an audit of the research organization itself.
The register covers useful work and the system that produces it.
Keep the registered acceptance criteria fixed while investigating stronger claims separately.

## Contents

- [Review cadence and coverage](#review-cadence-and-coverage)
- [Verify the actual reviewer](#verify-the-actual-reviewer)
- [Question records](#question-records)
- [Core questions: every 15 minutes](#core-questions-every-15-minutes)
- [Deeper questions: selected reviews](#deeper-questions-selected-reviews)

## Review cadence and coverage

Review C01–C12 every 15 minutes for the current fleet.
Select deeper questions hourly and when findings expose a consequential uncertainty.
Cover the relevant deeper categories across successive hourly reviews.
Keep unchanged answers short; retain the previous evidence and update its observation time only after rechecking.
Report changes, exceptions, and decisions prominently.
The 64 questions are a register, not 64 required essays each quarter-hour.

Fix the current cohort from immutable registrations and recorded launches before counting work.
Group continuation versions under their pursuit; preserve each version's events and outcomes.
Include refused launches, missing observations, and terminal runs in the relevant coverage denominator.
Do not silently substitute the historical census or operator-session count for the current research cohort.

Preserve question IDs when wording improves.
Keep evidence and answers in the existing review artifacts; this document does not own execution state.
Select deeper reviews using these triggers:

| Trigger | Questions |
|---|---|
| Unclear beneficiary, weak claim, ambitious scope, or proposed public announcement | D01–D08, D47–D52 |
| Surprising differences, saturation, budget imbalance, or proposed profile winner | D09–D17, D41–D46 |
| Missing recursion, duplicate work, waiting, or coordination overhead | D18–D25 |
| Early return, repeated rediscovery, continuation, or claimed self-improvement | D26–D32 |
| New checks, generated environments, unusually high scores, or candidate rejection | D33–D40 |
| Missing originals, unknown costs, replay failure, or operational boundary changes | D41–D52 |

## Verify the actual reviewer

Inspect the installed timer, service command, source revision, effective configuration, and retained prompt before claiming automated coverage.
Check which inputs the command actually loads, including source ages, truncation, and omitted branches.
Retain the command and source identity with the review evidence.
Map answered question IDs to the retained projection and resulting answers.
A skill file's presence does not prove that a scheduled process loaded it.

The inspected 2026-09-29 Fleet installation used `fleet-research-review.timer` and `fleet-research-review.service`.
The service executed `~/.local/share/tangle-tools/fleet/research_review.py` every 15 minutes.
Its bounded, tool-free prompt allowed six findings and two actions.
It projected four fields per run and five root-stream excerpts of at most 4,096 characters each.
Its Fleet target allowlist was empty; a separate configured native-root route delivered advisory findings.
That inspection did not establish automatic loading of this register or complete question coverage.
Reinspect the actual installation when any of those facts affect a current claim.

Until a retained scheduled cycle proves the integration, the current root operator audits core coverage directly.
Identify that review as manual and distinguish it from the scheduled report.
Installing or merging this reference alone does not integrate the timer.
An integration claim requires the loaded register identity, answered question IDs, their evidence, and the served review artifact.
Keep observation, advice, and execution authority in their existing owners.

## Question records

Retain one record per selected question and declared scope.
A fleet-level answer must identify covered runs and exceptions.
Use `observed`, `unavailable`, or `not_applicable`; retain a reason for the latter two.
`Observed` means the stated answer follows from inspected evidence, not that the experiment succeeded.
Use `unavailable` when missing evidence prevents the requested conclusion; retain any partial observation beside that limit.
Use `not_applicable` only when the question does not apply to the declared scope.

| Field | Meaning |
|---|---|
| `question_id` | Stable C or D identifier below |
| `scope` | Cohort, pursuits, versions, observation window, covered runs, and exclusions |
| `status` | `observed`, `unavailable`, or `not_applicable`, with the applicable reason |
| `as_of` | UTC observation time; retain source timestamps separately |
| `answer` | Bounded finding, including uncertainty or partial coverage |
| `evidence` | Source locations, exact artifact identities, and relevant records or spans |
| `change` | Difference from the previous answer, or explicitly unchanged |
| `owner` | Exact responsible owner, or unavailable ownership |
| `next_action` | Authorized action, observation needed, or an explicit reason to continue watching |

Separate successful report generation from question coverage.
Count observed, unavailable, and not-applicable questions against the selected set.
Show the run denominator and unexamined branches beside those counts.
Keep delivery, acknowledgment, consumption, and subsequent action as distinct observations.

## Core questions: every 15 minutes

| ID | Question | Minimum evidence |
|---|---|---|
| C01 | Who benefits from each pursuit, and what useful claim or product outcome would its result establish? | Named beneficiary, concrete outcome, fixed acceptance, and current scope |
| C02 | Which registered profiles, accounts, and models actually executed native research work during this interval? | Input identity, account knownness, served model, native session, and executed tools |
| C03 | What new decisive artifact, checked result, or changed research decision appeared since the previous review? | Artifact digest or event reference, prior state, check, and meaning |
| C04 | Where did elapsed time go: productive work, waiting, idle capacity, failures, and observation overhead? | Measured durations and denominators; explicit unmeasured intervals |
| C05 | Did work persist automatically through checkpoints and continuations, and what caused any early stop? | Version chain, retained artifact, observed reuse, terminal cause, and continuation owner |
| C06 | Which observed collaboration changed a decision or artifact, and did the intended topology execute? | Executed parent edges, native descendants, communication, and evidence of consumption |
| C07 | What next experiment would best distinguish the leading explanations or advance the useful result? | Competing explanations, discriminating observation, current owner, and action bounds |
| C08 | Do public development evaluations detect required behavior and failures without rewarding shortcuts or irrelevant output? | Calibrated controls, negative cases, candidate checks, and evaluator limitations |
| C09 | Which exact artifact digest has an outside acceptance result, and which fixed claim did that check establish? | Candidate identity, independent checker identity, verdict, exclusions, and fixed gate |
| C10 | Which profile or topology comparison is supported after accounting for actual resources, task differences, and dependence between trials? | Matched measurements, confounds, shared ancestry, uncertainty, and qualified conclusion |
| C11 | Are current originals captured on the external HDD, and which capture, integrity, checkpoint, or replay claims remain unproved? | Per-run expected/observed coverage, original-frame joins, hashes, sealing state, and actual replay receipts |
| C12 | Who owns each needed intervention, and was their action delivered, acknowledged, consumed, and acted upon? | Attributed control records, exact recipient, distinct receipt states, and subsequent evidence |

## Deeper questions: selected reviews

### Value, ambition, and prior art

| ID | Question |
|---|---|
| D01 | What specific user problem remains painful, and what evidence shows that solving it would matter? |
| D02 | What existing research or product is the strongest relevant baseline, and what remains unsolved after inspecting its evidence? |
| D03 | Which result would be useful to Tangle, an external customer, or a research community, and which audience is merely speculative? |
| D04 | What could this work become: a shipped feature, reusable primitive, scientific result, benchmark, or demonstration? |
| D05 | What supports commercial viability, including adoption friction, operating cost, willingness to pay, and plausible distribution? |
| D06 | Does the ambitious target preserve the actual user outcome, or encourage superficial metric improvement? |
| D07 | What is genuinely new relative to prior art, and what is reproduction, integration, optimization, or rediscovery? |
| D08 | Which public story is justified by the evidence, and how do usefulness, commercial value, virality, and reputation differ? |

### Experimental design, replication, and confounds

| ID | Question |
|---|---|
| D09 | What falsifiable hypothesis does each arm test, and what observation would change the decision? |
| D10 | Is there a simple baseline that can already achieve the useful outcome at lower cost? |
| D11 | Which assigned lever differs between arms, and which unintended differences remain? |
| D12 | Are model, account, harness, order, timing, task difficulty, and resource availability confounded? |
| D13 | What was randomized, paired, or held fixed, and what uncertainty follows from those choices? |
| D14 | Are seeds, source artifacts, prompts, prior findings, and selection history sufficiently independent for the claimed comparison? |
| D15 | Do repeated trials reproduce the effect across fresh tasks, seeds, accounts, and execution windows? |
| D16 | What stopping rule, selection process, or multiple-comparison effect could explain the reported winner? |
| D17 | Does the mechanism generalize across research and software domains, or only under one specially prepared setup? |

### Topology and coordination

| ID | Question |
|---|---|
| D18 | How do configured topology, observed Runtime edges, and harness-native descendants differ? |
| D19 | Did recursion produce an executed child-to-grandchild edge with useful work, rather than an unused capability? |
| D20 | Which role boundaries reduced duplication, and which produced repeated investigation or incompatible artifacts? |
| D21 | Which messages or artifacts crossed agent boundaries, and where is their subsequent consumption visible? |
| D22 | Did independent investigation uncover different evidence before agents converged or copied an ancestor? |
| D23 | Where did coordination, resource contention, waiting, or context transfer consume more time than the collaboration saved? |
| D24 | Did supervisors detect weak work, challenge claims, reassign effort, and preserve useful rejected findings? |
| D25 | When did a topology adapt to evidence, and would a simpler arrangement plausibly achieve the same result? |

### Learning, retained nulls, and checkpoints

| ID | Question |
|---|---|
| D26 | What knowledge or artifact survived each return, failure, restart, and version transition? |
| D27 | Did successors actually use retained findings, or repeat work because handoffs were absent, misleading, or unread? |
| D28 | Which null results, rejected candidates, and failed approaches were retained with their conditions and reusable evidence? |
| D29 | Did experience change profiles, tools, problem selection, or methods in a way tied to measured improvement? |
| D30 | Can improvement be separated from extra compute, easier tasks, selection effects, or operator assistance? |
| D31 | Did automatic continuation preserve the intended objective, profile constraints, candidate identity, and remaining budget? |
| D32 | What explains early termination, repeated barren versions, or failure to pursue the next authorized useful step? |

### Evaluation engineering and generated environments

| ID | Question |
|---|---|
| D33 | Were evaluations built or improved from actual user requirements and the production entrypoint? |
| D34 | Do controls establish that the evaluator accepts useful behavior and rejects plausible defective behavior? |
| D35 | Can a candidate exploit evaluator omissions, artifacts, leakage, or formatting without improving the required outcome? |
| D36 | Were generated environments validated for fidelity, solvability, reproducibility, and relevant failure modes? |
| D37 | Does evaluation distinguish partial progress, instrument failure, invalid output, and genuine task failure? |
| D38 | Is outside evaluation independent of candidate authorship, public calibration, and access to hidden acceptance material? |
| D39 | Do generated tests or judges transfer to unseen cases, and what human or independent checks calibrate their mistakes? |
| D40 | Which evaluation work became a reusable shared capability, and which remains a task-specific proxy with limited reach? |

### Provenance, replay, and resources

| ID | Question |
|---|---|
| D41 | Can every consequential claim be traced through source revision, input, profile, environment, event, candidate, and checker identities? |
| D42 | Are all expected Runtime and native descendants accounted for, with missing originals and observation gaps explicitly bounded? |
| D43 | Has capture integrity been checked through original bytes, sequence continuity, hashes, sealing, and durable storage receipts? |
| D44 | What has actually been replayed or restored, and which external dependencies prevent stronger reproducibility claims? |
| D45 | What are the complete known resource costs, including unsuccessful work, coordination, evaluation, storage, and operator intervention? |
| D46 | Are account capacity, concurrency, memory, latency, and tool limits constraining useful throughput, and where is idle capacity observed? |

### Delivery, security, and user outcomes

| ID | Question |
|---|---|
| D47 | Does the delivered artifact work through the intended user's actual interface, including persistence and reopening where relevant? |
| D48 | Which outside acceptance results support a release or publication, and what limitations must accompany that claim? |
| D49 | Were existing authorization, credential, sandbox, and data boundaries preserved during development and defensive review? |
| D50 | Do required reliability, performance, maintainability, and security properties survive simplification or optimization? |
| D51 | For physical designs, which assumptions require qualified simulation, independent engineering review, or physical validation before safe fabrication and use? |
| D52 | Who owns integration, delivery, support, and unresolved risks, and what user outcome remains unproved? |
