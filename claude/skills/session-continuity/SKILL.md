---
name: session-continuity
description: Preserve a long-running task across context, process, provider, or machine changes with checked state and exact next actions.
---

# Session continuity

Use this before or after context, process, provider, or machine replacement, and before a project switch.
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
- every active process or subagent, its harness, account, native session ID, status source, and safe resume command;
- every completed change with the check that proved it;
- every open item with one state, one artifact pointer, and one next command;
- decisions with evidence and the condition that would reverse each one;
- user corrections that must not be relearned;
- uncertainty at replacement time.

Reference existing records instead of copying them.
Never infer a live process from age or silence.
Never describe an unchecked claim as settled.

## Recover from native sessions

Resolve the installed trace tool and check its help before selecting a parser.
A command name can resolve to an unrelated package on another machine.
Start with session metadata, the latest relevant user turn, and its linked workers.
Use deterministic facts before model analysis; ask a bounded question only when those facts leave a decision unresolved.
Keep source file and record references for consequential claims.

When moving traces, preserve immutable snapshots of the parent and referenced workers with a size and hash manifest.
Record missing workers explicitly; a parent transcript alone does not establish what its children delivered.
Keep recorded source paths intact and use the tool's supported relocation mechanism.

Reconcile recovered claims against current commits, pull requests, process identities, and task ownership before resuming.
After a reboot, a restored terminal or board entry does not prove that its worker is running.
Resume a stopped task with its verified native session ID, account, and checkout.
Recover one worker first and verify execution and result capture before restoring the former concurrency.

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
