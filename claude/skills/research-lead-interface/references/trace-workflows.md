# Trace workflows

Use this reference for questions about what agents did, why they changed course, or how work moved between them.

## Contents

- [Select the source](#select-the-source)
- [Ask bounded questions](#ask-bounded-questions)
- [Interpret the result](#interpret-the-result)

## Select the source

Resolve the installed `traces` executable and inspect its help.
Read the maintained CLI documentation for commands the installed version actually provides.
The owning source is [tangle-network/traces](https://github.com/tangle-network/traces).
Its [analyst guide](https://github.com/tangle-network/traces/blob/main/docs/trace-analysts.md) describes supported analysis workflows.

Start with deterministic metadata and event inspection.
Use the execution owner's journals and native originals when a trace reader cannot answer the question.
State the unreadable scope beside evidence obtained through another supported source.
Avoid silently installing a different tool version during an observation.

Bind records by run, Runtime node, native session, and time window.
Check whether content and linked children are actually available.
Retain source locations for every consequential observation.
Never infer a child's behavior from its parent's assignment alone.

## Ask bounded questions

Use model analysis when deterministic evidence leaves a decision unresolved and an analysis budget is authorized.
Choose questions specific to the available spans:

- Which hypothesis changed, and what observation caused the change?
- Which retained artifact did an ancestor consume, and what decision used it?
- Which repeated failure prevented execution, and which attempts differ meaningfully?
- Did an intervention reach its recipient and influence subsequent work?
- Which claimed progress is reproduced, conditional, or still unassessed?

Retain the question, input scope, analyst identity, cost, and answer.
Use available span citations and verify that cited records support the claim.
Raw file and record references remain valid when the source has no span identifier.

## Interpret the result

Separate observations, analyst explanations, and proposed actions.
An analyst can identify a candidate cause or overlooked evidence.
It cannot independently accept a subject-matter result by interpreting the author's trace.

Check alternative causes for a surprising result, including missing execution and a failed instrument.
Keep unavailable content, unobserved children, and incomplete usage explicit.
Report the useful finding without waiting for optional analysis that cannot change the immediate decision.
