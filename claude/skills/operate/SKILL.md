---
name: operate
description: "Run a discovery system without doing its work. Hold the operator seat: produce instrument facts, make the system produce domain facts, and refuse acceptance criteria that cannot fail."
---

# Operate

You are running a system that is supposed to discover things.
Your job is the system. The system's job is the discovery.
These are different jobs and the failure mode is that you quietly take both.

Use this whenever you launch, resume, or evaluate a discovery run, campaign, or agent swarm.
It is a **pre-hook**, not a retrospective: `autopsy` explains a run whose *answer* looks wrong, and it
will never fire on the failure this skill exists to catch — a run that completed, produced well-formed
cited output, and discovered nothing, because its acceptance criterion could not fail.

## The line, stated mechanically

Every fact is one of two kinds. Sort it before you produce it.

| kind | about | who produces it |
|---|---|---|
| **instrument** | the system: what it cost, where it died, what it can and cannot do | **you** |
| **domain** | the subject matter: the distance of that code, the truth of that claim | **the system** |

If you are about to run a command whose output is a **domain** fact, stop.
You are about to do the system's job, and you will enjoy it, and it will feel like progress, and the
system will be no better afterwards. Write the child task instead.

The tell is a question with a mechanical answer: *"could a child have produced this, given an
acceptance criterion?"* If yes, it was never yours.

Doing the work yourself is not always wrong — it is wrong **silently**. If you take a domain fact
deliberately (to unblock, to calibrate, to prove the task is possible), say so out loud and say what
it would take for the system to produce it next time. An undeclared domain fact is the failure.

## Gate 1 — every acceptance criterion must be able to fail

Descriptive acceptance produces a librarian. Executable acceptance produces a researcher.
This is the highest-leverage lever you control, and it costs one sentence per task.

| shape | example | can it fail? |
|---|---|---|
| descriptive | "write `analysis.md` separating proved from proposed" | no — reading satisfies it |
| executable | "make `test_x.py` pass, or show it cannot be made to pass from the corpus" | yes |
| executable | "recompute N; report your value and whether it matches" | yes |

Before dispatch, write next to each task **the command that decides it and the exit code that means
done**. If you cannot write one, you do not yet understand the unit — say so instead of inventing a
criterion that always passes.

A run whose every child could succeed by reading has already failed. Check that first, not last.

## Gate 2 — name what could come out false

Every campaign names, before launch, at least one claim that could come out **false**, and reports
which way it came out.

A run that could not have surprised you did not discover anything, however much it produced.
Process quality — verified facts, shared knowledge, clean traces — is all satisfiable by an
immaculate catalogue of what someone else already claimed. The falsification target is what separates
discovery from bookkeeping, and nothing else in the loop supplies it.

## Gate 3 — the evidence ladder, with the rung named

State the rung. Never speak in the vocabulary of a rung you did not reach.

| rung | means |
|---|---|
| 1 | it parses / it exists |
| 2 | it imports / it loads |
| 3 | its tests pass |
| 4 | it reproduces the claimed number |
| 5 | it was independently re-derived |

Rung 1 dressed as rung 4 is the most expensive error available to you: it is indistinguishable from
success, it propagates into every downstream profile as settled provenance, and it survives until
someone runs the thing. "All files parse clean" is rung 1 and is nearly worthless — parsing proves the
text is in the language, not that it computes anything.

Run the cheapest rung-3 check available **before** any analysis is commissioned. It is usually one
command and it partitions the corpus into checkable and merely-assertable, which sets honest
confidence for everything after it.

## Gate 4 — identity before launch

Three layers, each already owned by a package. Do not invent a fourth.

| layer | owner | lifetime |
|---|---|---|
| `pursuit` | knowledge-base scope | the standing question, months |
| `campaignId` | `agent-eval` | one comparable configuration; owns the ledger and trusted head |
| `runId` | `agent-runtime` | one `supervise()` call |

`runId` cannot be the unit of comparison: the resume contract refuses a budget change under the same
id, so any retune forces a new one. Attempts that fragment into one directory per retune, with no
field saying which question they share, cannot be compared afterwards — assign the `campaignId`
at launch or lose the comparison permanently.

## Gate 5 — state that outlives context

Assume every agent's context dies mid-sentence, because it does.

- Durable state is files and knowledge-base pages. Agent context is scratch.
- Every child task says: **create the output file first, append as each section settles.**
- A child that composes its answer in context and writes once at the end converts any abort into
  total loss for that child. This is measurable: three children, 49 tool calls each, nothing on disk.

Long-horizon resumability is not a feature you add later; it is this constraint, applied from the
first run.

## When the run ends

Report, in this order:

1. **Falsification result** — what could have come out false, and which way it came out.
2. **Rung reached** — per load-bearing claim, with the command that establishes it.
3. **Instrument findings** — what the system taught you about itself. Early on this is the real
   product: a system's first output is a map of how it breaks, and that map is worth more than the
   first few answers.
4. **Domain findings** — what the system discovered, tagged with who produced it: the system, or you.

If (4) is empty and (3) is full, that is a legitimate result and should be reported as one, not
dressed up. If (4) is full and every entry says "you", you did the system's job again.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| A run finished but its result looks false, null, or too good | `/autopsy` | the run id + the raw artifact path |
| Five or more runs failed and you have root-caused one | `/diagnose` | the failure list + the confirmed root cause |
| The bottleneck is that nothing can measure the thing you care about | `/ground-truth` | the dark hop + the real-path command that would light it |
| An acceptance criterion needs to become a measured comparison | `/evolve` | the metric, the baseline, the change |
| An agent reported success it did not earn | `/agent-behavior-audit` | the transcript span + the state it failed to read |

## Log the run

```bash
skill-run-log /operate --target "<pursuit/campaign>" --verdict <VERDICT> --next /<next-skill-or-stop>
```
