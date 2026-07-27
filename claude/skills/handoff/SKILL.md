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
