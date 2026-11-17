# Prompt library

These are prompts one agent sends another for specific kinds of knowledge work, each with its trigger, the failure it targets, its evidence and the test that would grade it.
A [brief](agent-work.md#brief-template) carries every entry whose trigger matches its task, pasted under Constraints; [be-ambitious](../../claude/skills/be-ambitious/SKILL.md) draws its expert moves from here first.
Prompt text is written as definitions and conditions, so it reads the same in every harness and to every model.

Evidence grades, strongest first:

- **measured**: a controlled comparison on a scored task family;
- **n=1**: one observed case without a control;
- **essay-grade**: a practitioner's argument or account, or a measured result from a different setting;
- **untested**: no evidence either way;
- **evidence against**: a comparison found no gain or a loss.

An entry's grade changes only with a cited run of its own test; an entry whose test shows evidence against stays, graded, so it is not proposed again untested.

| Entry | Kind | Grade |
|---|---|---|
| [Feasibility count](#feasibility-count) | method | n=1 |
| [Scorer, representation, bulk search](#scorer-representation-bulk-search) | reframe | essay-grade |
| [Known-positive control](#known-positive-control) | procedure | essay-grade |
| [First checked object early](#first-checked-object-early) | procedure | n=1 |
| [Artifacts come from code](#artifacts-come-from-code) | procedure | n=1 |
| [Receipts, not narration](#receipts-not-narration) | procedure | n=1 |
| [Stall recount](#stall-recount) | procedure | n=1 |
| [Frontier handoff](#frontier-handoff) | procedure | n=1 |
| [Targeted reading](#targeted-reading) | reading | essay-grade |
| [Inspirational reading](#inspirational-reading) | reading | untested |
| [Explicit state machines](#explicit-state-machines) | method | essay-grade |
| [Driver's-seat audit](#drivers-seat-audit) | audit | essay-grade |
| [Harness cost per completed task](#harness-cost-per-completed-task) | audit | essay-grade |

The search entries share one case, cited as **the codeword case**: a search for a codeword with no zero entry in a [109, 54] ternary code, run twice in November 2026.

## Search and construction

### Feasibility count

**Kind:** method.

**Trigger:** a lead to a worker, in the brief of any search for an object (a counterexample, a configuration, a failing input, a design point), before the worker picks a method.

```text
A search plan opens with a feasibility count: an estimate of how many target objects exist in the space (a first-moment count, a density or a base rate) and, for each candidate method, the expected steps to a first target and the steps it runs per second.
A method whose expected time to a first target exceeds the budget is ruled out, and the plan shows the numbers that rule it out.
The plan names the strongest method the field already uses for this kind of object, its reasonable attack, and the result that would rule that method out in turn.
```

**Targets:** a search that improves a proxy (fewer violations, a better score) in a space where targets are too rare for its method to reach, and spends the budget on a plateau.

**Evidence:** n=1, the codeword case.
The first run, one agent for two hours, annealed toward fewer zero entries and stalled at 7 zeros.
A first-moment count gives about 3.7e6 target words among 3^54 (about 5.8e25) codewords, a density near 6e-20 that local search does not reach, while enumerating value patterns on an information set expects a first hit after about 5e9 patterns.
With that count and method written into its task, a four-hour second run enumerated information-set patterns and found a target after about 1.8e9 patterns, 0.9 s of compute on 8 cores, about 19 minutes after it started; an independent check confirmed the word.
The second run also had workers and twice the budget, so the count's own effect is not isolated.
Sources for the method: R. Hamming, "You and Your Research" (1986), on working only where there is a reasonable attack; J. R. Platt, "Strong Inference", Science 146:347 (1964), on alternatives and the test that excludes them.

**Test:** family: construction and counterexample tasks with an exact checker, chosen so a first-moment count puts half of them beyond local search at the given budget; arms: the brief with and without this entry, same model and budget, at least 10 tasks per arm; metric: solve rate, then time to the first checker-accepted object.

### Scorer, representation, bulk search

**Kind:** reframe.

**Trigger:** a lead to a worker when a construction task is first framed, or when candidates keep failing validation.

```text
A machine search for an object has three parts: an exact scorer that runs in milliseconds, a representation in which invalid objects are hard or impossible to write, and a bulk search that scores many candidates and keeps the best as parents.
The plan names each part, and a missing part is the first thing built.
A model proposing candidates one at a time is the bulk search only when the feasibility count says a few candidates suffice.
```

**Targets:** an agent that reasons about one candidate at a time, writes objects by hand and checks them late.

**Evidence:** essay-grade.
The machine-discovery systems that found new objects share this design: A. Z. Wagner, "Constructions in combinatorics via neural networks", arXiv:2104.14516 (2021); FunSearch, B. Romera-Paredes et al., Nature 625:468 (2024); AlphaEvolve, A. Novikov et al., arXiv:2506.13131 (2025); PatternBoost, F. Charton, J. S. Ellenberg, A. Z. Wagner and G. Williamson, arXiv:2411.00566 (2024).
These are successes, not a controlled comparison of the framing.

**Test:** family: the feasibility-count family; arms: with and without this entry; metric: solve rate, then candidates scored per unit of spend.

### Known-positive control

**Kind:** procedure.

**Trigger:** a lead to a worker, in the brief of a search or measurement, for the moment its generator and checker exist and before the hunt.

```text
A known-positive control is a run of the worker's own generator and checker on an instance whose answer is already known, returning that answer.
The hunt starts after the control passes; a failing control means the pipeline is the first thing to fix.
A negative result counts only beside a passing control on the same pipeline.
```

**Targets:** a hunt that reports "none found" from a generator that cannot produce the object, or a checker that rejects valid ones.

**Evidence:** essay-grade.
R. Feynman, "Cargo Cult Science" (Caltech commencement, 1974): an experimenter first repeats the earlier experiment under her own conditions and gets its result, then changes one condition.
It is the positive control of laboratory practice; it is untested as an agent prompt.

**Test:** family: construction tasks where half the runs receive a seeded defect in the supplied generator or checker; arms: with and without this entry; metric: share of defective runs that find the defect within a tenth of the budget, and the count of false "none found" reports.

### First checked object early

**Kind:** procedure.

**Trigger:** a lead to a worker, in the brief of any task decided by an exact checker or acceptance test.

```text
The first checked object is one candidate that the real checker, the one that decides the task, accepts.
It exists within the first tenth of the budget, on a smaller or easier instance when the full one is out of reach, with its command and output stored.
A preview copy of the checker or a test the worker wrote does not count.
```

**Targets:** format, contract and pipeline defects found only at the final submission, with no budget left to fix them.

**Evidence:** n=1, the codeword case.
The second run's first submission reached the real checker 31 minutes into a 4-hour budget (13%) and was refused for a defect the worker's own preview had not caught (next entry).

**Test:** family: tasks with a frozen checker; arms: with and without this entry; metric: share of runs with a checker-accepted object by a tenth of the budget, final pass rate, and share of final refusals that are format or contract defects.

### Artifacts come from code

**Kind:** procedure.

**Trigger:** a lead to a worker, in the brief of any task whose deliverable holds a structured object (an array, a table, a matrix, a certificate) longer than a few lines.

```text
An artifact longer than a few lines is written by the program that made it, and checked by reading the written file back: its length, types and checksum against what the program holds.
Text a model types or pastes is a transcription, not an artifact.
```

**Targets:** dropped or repeated entries in objects a model copies by hand.

**Evidence:** n=1, the codeword case.
The checker refused the second run's first submission because the codeword must have 109 entries: the worker had typed the array into its claim by hand, and the typed array had 110.
The compressed artifact its program wrote held the correct 109 entries.

**Test:** family: tasks whose deliverable is a structured object of 50 to 500 entries; arms: with and without this entry; metric: checker refusals for length, type or encoding per submission.

### Receipts, not narration

**Kind:** procedure.

**Trigger:** a lead to a worker, in every brief; and a reviewer to an author before reading a report.

```text
A check in a report is its stored command and the output that command printed, or a pointer to where both are stored.
A check that was not run reads "not run", and a cause nobody observed reads "unknown".
A sentence that describes a check without its receipt is narration and carries no weight.
```

**Targets:** reports that describe checks that were not run, or explain a failure with a cause nobody observed.

**Evidence:** n=1, the codeword case.
After the refusal above, the worker's report blamed the platform for re-serializing the array; the stored claim showed the hand-typed array was 110 entries long, which its own checker, run on the submitted claim rather than on the program's file, would have shown.
The lead's side of this rule is [rule 9](../../claude/AGENTS.md): verify the receipt, not the summary.

**Test:** family: tasks with a required check; arms: with and without this entry; metric: share of check claims in the final report that match a command and output in the tool-call log, and share of causes stated without an observation.

### Stall recount

**Kind:** procedure.

**Trigger:** a lead to a worker, in the brief of any search; the worker's own loop runs it when the best score stalls.

```text
A stall is a best score unchanged over the last three measurements.
At a stall the feasibility count is redone with the remaining budget and the rate the current method actually achieved.
When the recount says the current method will not reach a target in the remaining budget, the plan switches to the method the recount favors; otherwise it continues and records why.
```

**Targets:** more effort on a plateau where a different method is needed; this is the [climb's](climb.md) plateau breaker applied inside one search.

**Evidence:** n=1, by its absence in the codeword case: the first run spent its two hours annealing without a recount, and the count made afterward ruled its method out.

**Test:** family: stalled runs resumed from a checkpoint at equal remaining budget; arms: with and without this entry; metric: share that switch method, then solve rate.

### Frontier handoff

**Kind:** procedure.

**Trigger:** a lead to a worker, in the brief of any task that may end before its goal; the worker writes it before the budget ends, and a successor reads it first.

```text
A frontier handoff is written before the budget ends and holds: the method used; the number of candidates evaluated; the best object, stored by the program that made it; the estimated remaining cost to a target under the current method and under the best alternative; and the next command to run.
A successor starts from the handoff and does not re-evaluate the candidates it lists.
```

**Targets:** a successor that rediscovers or reruns its predecessor's dead end.

**Evidence:** n=1, the codeword case: the second run started from a written record of the first run's method, its best result of 7 zeros and the count of the remaining cost, and changed method; the operator wrote that record after the run, not the run itself.
[session-continuity](../../claude/skills/session-continuity/SKILL.md) owns handoffs in general.

**Test:** family: one budget split into two runs, the second starting from the first's handoff or from nothing; metric: candidates the second run re-evaluates, then its time to a first target.

## Reading

### Targeted reading

**Kind:** reading.

**Trigger:** a lead to a worker, at the start of a research, search or design task built on a source (a paper, a specification, a codebase), before the worker chooses a direction.

```text
Targeted reading is a one-page note written before a direction is chosen.
It holds the source's own methods and what the source already ruled out or proved; the one or two strongest method papers for this kind of object; and the method each suggests for this task, with its cost.
Further reading happens when a named decision needs it.
```

**Targets:** a direction chosen without the field's known method or the source's own exclusions, and open-ended reading that spends the budget without changing a decision.

**Evidence:** essay-grade for the one-page form.
Its mechanism, task-specific material in context, is measured in other settings: retrieval (P. Lewis et al., arXiv:2005.11401, 2020), reflection on prior attempts (N. Shinn et al., Reflexion, arXiv:2303.11366, 2023), a skill library (G. Wang et al., Voyager, arXiv:2305.16291, 2023) and expert method hints in AlphaEvolve's mathematics work (B. Georgiev, J. Gómez-Serrano, T. Tao and A. Z. Wagner, 2025).

**Test:** family: research or construction tasks whose strongest known method the graders hold; arms: with and without this entry; metric: share of runs that choose that method within a tenth of the budget, then solve rate.

### Inspirational reading

**Kind:** reading.

**Trigger:** a lead to a worker before it chooses a direction; it is recorded here, as commonly given, so the hypothesis keeps an honest grade.

```text
Read books and essays to inspire yourself before choosing a direction.
```

**Targets:** narrow or unoriginal directions.

**Evidence:** untested; the nearest evidence shows no gain: persona and role framing in system prompts did not beat a no-persona control (M. Zheng et al., arXiv:2311.10054).
No study tests general reading before a task; the test is cheap.

**Test:** family: the targeted-reading family; arms: this entry, targeted reading, and neither; metric: solve rate, tokens per solved task, and the share of runs whose chosen direction cites something read.

## Systems for people and agents

### Explicit state machines

**Kind:** method.

**Trigger:** a lead to a worker, on an application whose behavior depends on stages, statuses or retries, or where bugs recur around stuck or impossible states.

```text
An implicit state machine is state spread across status strings, phase booleans, nullable stage fields and retry loops, with its legal transitions written nowhere.
The work lists each one in the application with the code that sets each state, makes each explicit as one set of states with its legal transitions and a check that rejects an illegal transition, and picks the change that improves the experience of users, developers and agents together without changing behavior.
An integration run of the application's real flows gives the same results before and after the change.
```

**Targets:** impossible combinations (done yet retrying, failed with a result), stuck work, and developers and agents guessing which states exist.

**Evidence:** essay-grade: D. Harel, "Statecharts: a visual formalism for complex systems", Science of Computer Programming 8:231 (1987); Y. Minsky, "Effective ML" (2011), on making illegal states unrepresentable.
Untested as an agent prompt.

**Test:** family: real applications reverted to before the fix of a state bug from their issue history; arms: with and without this entry; metric: integration results unchanged before and after, the share of those historical bugs the new transition check rejects, and illegal transitions it reports on the real flows.

### Driver's-seat audit

**Kind:** audit.

**Trigger:** a lead to a fresh worker with no prior context, when a system built for agents (a command-line tool, an API, a skill set, a documentation tree) changes or before it is offered to others.

```text
A driver's-seat audit uses the system as a new agent would, with only its documentation and tool output, on real tasks.
Its count is every guess, retry and source-code read that the interface should have made unnecessary, each with the place it happened.
The top causes are fixed at their owner, and the documentation reads as one tower: each level defines its terms once and links the level below.
```

**Targets:** interfaces that work for their authors but make every new agent guess, retry or read source code.

**Evidence:** essay-grade for the audit; the mechanism is measured: changing only the agent's interface changed its resolve rate on SWE-bench (J. Yang et al., SWE-agent, arXiv:2405.15793, 2024).

**Test:** family: a fixed set of first-time tasks on the system, run by fresh agents before and after the fixes; metric: guesses, retries and source reads per completed task, counted from traces, with completion rate.

### Harness cost per completed task

**Kind:** audit.

**Trigger:** a lead to a worker when a harness, system prompt, tool set or agent profile changes, or when a run's cost is questioned.

```text
Cost is measured per completed task, failed attempts and retries included, and weighted by how each part is billed: metered tokens at list price, subscription seats by share of quota, compute by box-hours held.
Static context (system prompt, always-loaded instructions, tool schemas) holds only what most turns need; the rest is a pointer to a file read when needed.
Instructions are definitions and conditions, not commands and emphasis.
The cached prefix is byte-stable from call to call; timestamps, counters and other volatile values come after it.
A large output goes to a file, with its path and a short summary in context, and is never cut off.
A handoff between agents is short: outcome, evidence pointer, next action.
The model is not asked to save tokens or keep answers short; length follows the task.
A change is kept when real tasks show a lower cost per completed task with no loss in completion.
```

**Targets:** savings per call that raise cost per task: a broken cache, context nobody reads, truncated output that forces a rerun, brevity that cuts reasoning short, and compute held after the work ends.

**Evidence:** essay-grade, with a measured cost map as a worked example (three research runs on one platform, November 2026; no change tested yet).
Practitioner sources: Anthropic, "Effective context engineering for AI agents" (2025); Y. Ji, "Context Engineering for AI Agents: Lessons from Building Manus" (2025), on cache hit rate as the main cost lever, a stable prefix and files as memory.
Results on instructions to be brief are mixed: a concise-reasoning prompt halved response length with an accuracy loss on some math tasks (M. Renze and E. Guven, arXiv:2401.05618), and token budgets set too tight raised total tokens (T. Han et al., arXiv:2412.18547).
In the cost map, the first model call carried about 14.7K input tokens, each root agent made 36 to 94 calls, and cache hit rates were 90.8% to 98.2%.
A coding CLI's default system prompt, about 8.5K characters, reached the research agents with instructions to minimize output tokens and answer in fewer than 4 lines.
One agent lost 21 minutes to two extra-high reasoning-effort steps that hit the output cap without a tool call.
Sandboxes stayed held 18 to 42 minutes after the agent session ended, about 36% of box-hours across three pilots, because bookkeeping steps ran before trace export and teardown.

**Test:** family: a fixed set of tasks the current harness already completes, taken from real runs; arms: the current harness and the changed one, same models and seats; metric: billed cost per completed task, with completion rate no more than 5 points lower.
