---
name: autopsy
description: Root-cause a single run (eval, benchmark, optimization/self-improvement loop, /evolve round, /pursue generation, A/B of strategies) that produced a null, surprising, or suspicious result — auto-research WHY, classify the cause, and verify every claim against ground truth before believing it.
---

# Autopsy — Run Forensics

A run finished and the result is **null** ("no lift"), **surprising** ("74% — from what?"), or **suspicious** ("every cell scored exactly 0.125"). Autopsy answers one question: **WHY did this run produce this result — and is the result even real?**

"A run" = anything with a harness and a measured outcome: an eval/benchmark, an optimization or self-improvement loop, an `/evolve` round, a `/pursue` generation, an A/B of strategies, a training/curation pass. Adjacent asks route elsewhere: *failure triage by ROI* → `/diagnose`; *"is it actually live / did the deploy work"* → `/report` or `/release-conductor`; *session/project patterns* → `/reflect`. Autopsy dissects **one experimental run's result**.

The output is a **root-cause classification** that tells you what to do next:

| Class | Meaning | Action |
|-------|---------|--------|
| **infra-bug** | the mechanism is broken — a step is a silent no-op, a value is dropped, a fallback fabricates a number | fix the code (file:line + the change) |
| **design-flaw** | the mechanism works but the experiment *cannot* show the effect (no held-out, confounded arms, the signal the learner needs isn't observable to it) | redesign the run, not the code |
| **dead-metric** | the measure can't move with the thing you changed (content-invariant, saturated at floor/ceiling, wrong observable) | fix the metric/corpus |
| **real-result** | the effect genuinely isn't there at this n/power | believe the null; stop chasing it |

Misclassifying here is the expensive mistake: patching the mechanism to chase a dead metric, or "discovering a regression" that was a fabricated number. The whole skill exists to get this classification right.

## When autopsy vs other skills

| Signal | Skill |
|--------|-------|
| "A run did something I don't understand / didn't improve / looks too good" | **`/autopsy`** |
| "Many cases fail; rank fixes by ROI" | `/diagnose` |
| "Move this metric up" | `/evolve` |
| "Did the deploy/ingest/job actually work" | `/report` · `/release-conductor` |
| "What is this session/project teaching us" | `/reflect` |
| "The approach is wrong, redesign it" | `/pursue` |

Autopsy often *precedes* the others: autopsy a flat `/evolve` round before running another; autopsy a `/pursue` generation that regressed before reverting.

## The non-negotiable: verify against ground truth

**Never relay a load-bearing claim — your own or a subagent's — without re-deriving it from ground truth.** Confident-but-wrong analysis is the default failure mode. Two real examples (from a self-improvement eval, but the trap is universal):

- a subagent reported *"the score is fabricated, the code never ran"* — re-running the real grader on the recorded artifact returned the logged number exactly, refuting it;
- a prior claim *"0.125 is a real partial score"* had no proof until that same re-run established it.

The check is cheap relative to acting on a wrong conclusion. Pick the ground-truth move that fits the run: **re-run the grader/metric on the recorded artifact; re-execute the produced output; replay the request against the live source; re-read the file at the cited line; recompute the statistic from the raw rows.** If a claim can't be reduced to a ground-truth check you ran yourself, it's a hypothesis, not a finding — label it as such.

## The loop

```
PULL ARTIFACTS → FAN OUT FORENSICS → VERIFY EACH CLAIM (ground truth) → CLASSIFY → GO-PLAN
```

### 1. Pull the actual artifacts
Read what the run actually emitted — its records/logs/traces, the produced outputs, the config/inputs that actually ran. Not your memory of them, not the summary. First questions: do the scores *vary* across different inputs (a constant ⇒ likely dead-metric), did the success flag ever flip true, did the step you're crediting actually fire?

### 2. Fan out forensics (parallelize — use a Workflow)
Independent angles, run concurrently:
- **Mechanism forensics** — did each step do what it claims? (e.g. for a steering/self-improvement loop: diff iteration N vs N-1 — was the signal threaded in, was it correct, did behavior change, did the outcome move? For an A/B: were the arms actually different and compute-matched?)
- **Reuse the project's own analyzer** — run the existing report/analysis tooling (e.g. an `analyzeRuns` / trace-analyst / scorecard) over the run's records. If it can't ingest them, that incompatibility is itself a finding.
- **Wiring audit** — trace the data path in code (file:line). Is any step a silent no-op? Is a fallback fabricating a value where it should fail loud?
- **Competing hypotheses** — enumerate the candidate causes; for each cite supporting AND refuting evidence from the actual data; rank by likelihood and mark the refuted ones refuted.

### 3. Verify each load-bearing claim against ground truth (see above)
Do this for the claims the conclusion rests on. A surprising claim from a subagent gets re-derived before it enters the report.

### 4. Classify the root cause
Into exactly one of {infra-bug, design-flaw, dead-metric, real-result}. State it in one sentence. If two classes are live, say which experiment would discriminate them — and note that discriminating run is usually the highest-value next step.

### 5. Go-plan
- The single most informative next run (isolate ONE variable; prefer the run that completes a 2×2 over a bigger version of the same run).
- Any infra-bug fixes (file:line + change), ranked. Apply fail-loud fixes immediately — a fabricated number that reads as a result is the highest-leverage bug.
- Honest risks: where a null/tie persists and why (underpowered n, floor/ceiling saturation, a confound the design didn't control), and what setup most avoids it.
- A falsifiable hypothesis for the *next* run: "X holds iff Y," and the minimal run that tests it.

## Persist

- Write a short autopsy note to `.evolve/autopsies/YYYY-MM-DD-<run-slug>.md` (create the dir if missing): the run, the verified findings (each with its ground-truth check), the classification, the go-plan.
- Extract a durable learning to memory if the cause is a class you'll hit again (a dead-metric pattern, an infra no-op, a saturation regime).
- Append a `.evolve/skill-runs.jsonl` line on completion if the project uses one.

## Dispatch at end

End with one executable line, derived from the classification:
- infra-bug → `Fix: <file:line> <change>, then re-run`
- design-flaw → `Next: re-run with <the one changed variable>` (often a different corpus/harness)
- dead-metric → `Fix the metric: <what>, then re-baseline`
- real-result → `Stop: the effect is absent at n=<N> (need <power> to detect <effect>)`

## Rules

1. Read the real artifacts, not your summary of them.
2. Every load-bearing claim carries a ground-truth check you ran. No exceptions for "an agent told me."
3. Classify into exactly one root cause; name the discriminating run when ambiguous.
4. A verified null is a valid result — report it plainly; don't manufacture a cause.
5. Parallelize the forensics; serialize the verification (you must do the ground-truth checks yourself).
