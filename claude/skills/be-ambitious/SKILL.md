---
name: be-ambitious
description: Rewrite a task as the deeper version a top professional would ask for, with expert moves, the rawest sources, named methods and an outside check with its pass line; use for /be-ambitious, "be ambitious", "raise the bar" or "what would an expert do". Not for adding scope or polishing tone.
---

# Be ambitious

Make the task deeper, not bigger: the same goal and scope, held to a higher standard through better sources, sharper methods and an outside check.
Drop any suggestion that adds a deliverable, feature or side quest.

The task is the text after the invocation, else the latest request in the conversation; with neither, ask for it in one line.

## Answer four questions

Name the field first (SRE incident response, clinical pharmacology, zero-knowledge proof engineering), then answer for that field with the actual thing, not its category:

1. **Expert moves not asked for.** The two or three moves that separate expert from competent work here, such as naming the decision the work serves, checking base rates, reproducing before fixing, or writing the strongest counter-argument.
2. **Rawest material.** The primary source the expert starts from instead of a digest: the dataset, not the chart; the filing, not the article; the logs and code, not the bug report; the methods section, not the abstract. Say where it lives: here that is often a trace, a run's journal, `origin/<default>` or the served endpoint.
3. **Named methods and tools.** Techniques, instruments, libraries or commands, each with the reason it fits this task.
4. **Outside check.** What, other than the user or the model, shows the result is right: a test suite, benchmark, reproduction, ground-truth data, known answer, measurement, independent reviewer or real user behavior. State the pass line and the failure line, as numbers where the check allows.

Where the field is beyond what you know, say so instead of inventing a source or tool.
The step is done when each question has a concrete answer or a named unknown.

## Rewrite

Write the rewritten prompt in one fenced block, in the user's voice.
It asks for exactly what the four answers describe: start from the raw material, use the named methods, and end on the outside check and its pass line.
Keep the user's acceptance criteria and named levers unchanged.

When the request asked only for the rewrite, stop after it.
When the task is already authorized work, because the user asked for it to be done or another skill invoked this one for its own task, carry out the rewritten version.

## Log the run

```bash
skill-run-log /be-ambitious --target "<task>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The rewrite asks for research from primary sources | `/report` | the rewritten prompt |
| The outside check does not exist yet and must be built | `/eval-engineering` | the pass and failure lines |
| The rewrite leaves decisions only the user can make | `/grilling` | the open decisions |
