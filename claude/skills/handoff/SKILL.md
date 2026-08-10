---
name: handoff
description: Create a session brief with state, git status, decisions, proof, blockers, and next actions.
---

# Handoff

Use this when wrapping a long session, switching projects, or preserving state before context loss.
The output must let the next session continue without rediscovery.

## Flow

1. Read current git status, recent commits, open PRs/issues, and active task state.
2. Read `.agent/` state if present.
3. Capture what changed, what was verified, what failed, and what remains.
4. Name blockers with exact commands, files, credentials, or decisions needed.
5. Write a compact brief in the repo's existing handoff/reflection location or provide it inline if no convention exists.

## Include

- Objective and current status.
- Files/commits/PRs touched.
- Verification commands and results.
- Decisions made and why.
- Risks, blockers, and exact next actions.
- **Live lanes**: every still-running process/agent — status-file path, ground-truth check command, resume command. Lost live state is the measured top cost of session boundaries.
- **Open loops — exhaustive**: EVERY item started, promised, or deferred but not finished — one line each (item · state · pointer · next command). Completeness is the rule here; ranking lives in "next actions", not in this table. An item too small to list is an item you finished or explicitly dropped with a reason. Report the table's row count at the top so `/reflect` can track unclosed-loop count across sessions.
- **To the next agent**: the handoff is you going to sleep; the next session is you waking up. Three things preserve continuity of judgment, not just facts: (1) standing decisions each carry their KILL CONDITION — a decision without one becomes superstition the next instance follows blindly or relitigates expensively; (2) operator corrections paid for this session, stated plainly, so they are never paid for twice; (3) an honest "what I was uncertain about at close" — waking up into overconfident claims is the real lobotomy. Re-verify lane/process state at write time rather than trusting your own earlier status notes; the handoff must not lie to its reader, and its reader is you.

Use `references/full-reference.md` for the full handoff template.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Brief written and the session ends here | stop | nothing — the brief is the artifact |
| ≥3 skill runs logged this session and none has been graded | `/reflect` | the `.agent/skill-runs.jsonl` tail + the brief path |
| The resuming agent has ≥2 candidate next actions | `/governor` | the brief path + the objective it should route against |
| The brief lists ≥1 unproven claim | `/verify` | the claim + the command that would prove it |

## Log the run

On completion, append one line so `/reflect` and `/governor` can grade this skill later:

```bash
skill-run-log /handoff --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```
