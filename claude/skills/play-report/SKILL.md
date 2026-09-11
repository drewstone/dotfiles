---
name: play-report
description: Report what a play did, for an observer, separating the system's own behavior from what the harness and the operator did to it.
---

# Play report

Tell the observer what a play did and what to decide next.
A play is one press of start, with several agents working one problem under declared invariants and resource limits.
This skill reports a play; it does not run one, and it does not audit a single director's research quality.

## Separate the system from its harness

Split every outcome into three causes before interpreting anything.

- The system's own behavior: what the agents chose, built, checked and concluded.
- The harness: timeouts, restarts, admission limits, stream failures, full disks, rate limits.
- The operator: what a human or an outer agent did to the run while it was live.

Report the split explicitly, because a run that ends badly for harness or operator reasons says nothing about the research.
Name the operator's own actions in the report.
An operator who ended a run states that plainly rather than describing the run as having failed.

A terminal error is a claim about the harness until its cause is traced.
Read the harness log for the run before trusting a settled result's reported cause: an accounting or transport error can replace the original failure.

## Attribute every turn

Give each turn, artifact and write an agent, or mark it unattributed.
Use the identity the run records, such as a profile digest or a node id carried on the turn.
Never infer identity from a model name: agents share models, and their children inherit them.
Report the attributed count, the unattributed count, and what made attribution impossible.
State which attributions are certain and which are inferred, and never present an inferred one as certain.

## Account honestly

Report measured resource use and declared limits as different things.
Give the measured total, its source, and the count of turns that reported nothing.
When a route reports no cost, the cost is unknown, never zero.
When a limit was enforced against an estimate rather than a measurement, say so and give both numbers.
A cap computed from an estimate did not bound anything; report it as an unbounded channel.

## Report the collaboration that emerged

The doctrine gives agents invariants and hazards, never a protocol.
So report what they invented, not their compliance with a protocol they were never given.

Answer from the record, and drop any question the evidence cannot support:

- How did they find each other, divide the work, and decide?
- What channel did they build, and what did it route around?
- Did a write ever overwrite a peer's work, and was the earlier version recoverable?
- Was disagreement preserved, or replaced by the last writer?
- Was any claim checked by an agent that did not produce it?
- Where several agents agree, is that independent replication or one error copied?

Authorship may not be recorded by the store that holds the shared knowledge.
Establish where authorship actually lives before promising any fact that depends on it.

## Say what survived

A failed run is not an empty run.
List the artifacts, decisions and claims that persist, with their paths and digests.
Say which of them a later run can start from.

## Report defects with their owner

Give each defect its owner, its evidence, and its issue, and separate a defect in the system from a defect in how it was operated.
Report a defect that only an operator could have caused as the operator's, not the system's.

## Log the run

```bash
skill-run-log /play-report --target "<play or runId>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| One director's behavior needs auditing | `/director-autopsy` | The run records and the director's rows |
| A result is null, surprising, or suspect | `/autopsy` | The run ID and raw artifacts |
| The harness ended the run | `/diagnose` | The harness log, the settled cause, and the real cause |
| A claimed event cannot be observed at all | `/ground-truth` | The missing event and the actual execution path |
| The play is ready to run again | `/operate` | The surviving artifacts and the changed keys |
