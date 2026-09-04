---
name: session-continuity
description: Preserve a long-running task across context or process replacement with checked state, decisions, live work, proof, and exact next actions.
---

# Session continuity

Use this before context replacement, process replacement, or a project switch.
The active goal survives unless it reached a terminal condition.

## Capture checked state

1. Re-read the active goal and the user's latest instruction.
2. Inspect git state, recent commits, open pull requests, active subagents, and running processes.
3. Read the repository's durable task state.
4. Recheck every live lane through its authoritative status source.
5. Record one compact brief in the repository's existing state location or the session scratch directory.

Include:

- objective, current status, and explicit completion conditions;
- exact branch, commit, pull request, and uncommitted files for each repository;
- every active process or subagent, its identity, status source, and safe resume command;
- every completed change with the check that proved it;
- every open item with one state, one artifact pointer, and one next command;
- decisions with evidence and the condition that would reverse each one;
- user corrections that must not be relearned;
- uncertainty at replacement time.

Reference existing records instead of copying them.
Never infer a live process from age or silence.
Never describe an unchecked claim as settled.

## Continue

After the brief is written, continue the already-authorized goal automatically when the environment supports it.
Do not ask the user to restate the task.
Ask only when progress needs new authority or a material choice that cannot be inferred.

## Log the run

```bash
skill-run-log /session-continuity --target "<active goal>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Two or more valid next actions compete | `/governor` | the brief and active objective |
| The brief contains an unproven completion claim | `/verify` | the claim and its real-path check |
| Several completed skill runs have not been assessed | `/reflect` | the run log and brief |
| One next action is already determined | active skill | the brief path and exact next command |
