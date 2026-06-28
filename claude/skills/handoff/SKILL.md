---
name: handoff
description: Produce a session-to-session brief with current state, git/PR status, decisions, blockers, verification, and exact next actions for a fresh agent.
---

# Handoff

Use this when wrapping a long session, switching projects, or preserving state before context loss.
The output must let the next session continue without rediscovery.

## Flow

1. Read current git status, recent commits, open PRs/issues, and active task state.
2. Read `.evolve/` state if present.
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

Stop after the handoff unless the user asks to continue.
