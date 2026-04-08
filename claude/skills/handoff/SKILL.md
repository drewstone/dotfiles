---
name: handoff
description: Produce a session-to-session knowledge transfer brief. Reads current session work, git history, open PRs, memory, and `.evolve/` state, then writes a structured handoff doc the next session can execute immediately. Use when wrapping up a long session, switching projects, or after a major milestone. Triggers - "wrap up", "hand off", "prepare for next session", "save context".
---

# Handoff — Session-to-Session Knowledge Transfer

Produce a dispatchable brief for the next session. Reads the current session's work, project state, git history, open issues, memory, and `.evolve/` state — then writes a structured handoff document that a fresh session can execute immediately.

## When to Use

- End of a long session (context getting large)
- Before switching to a different project
- When the user says "wrap up", "hand off", "prepare for next session"
- After completing a major milestone with follow-up work

## What It Produces

A `HANDOFF.md` in the project root (gitignored) with:

### 1. Current State (what's true right now)
- Branch, commit, PR status
- What's deployed vs what's local-only
- Running services and their state
- Test results from this session

### 2. Evolve/Pursue State
If `.evolve/current.json` exists, include:
- Mode (evolve/pursue), goal, round, generation
- Active pursuit path (if any)
- Current prompt version (from `.evolve/prompts/registry.json` if exists)
- Tail of `.evolve/progress.md` (where we are vs target)
- Last experiment verdict from `.evolve/experiments.jsonl`

This is **critical** — without it, the next session won't know if it's mid-experiment, mid-pursuit, or between cycles. Include the raw JSON of `current.json`.

### 3. Completed This Session
- What was built, with file paths
- What was merged (PR numbers)
- What was measured (benchmark results, quality scores, design audit scores)
- Decisions made and why
- Experiments run and their verdicts

### 4. Next Actions (with explicit skill routing)
Each action specifies **which skill to run**:
- "Run `/evolve` targeting [specific target] with baseline [number]%"
- "Run `/pursue` — evolve has plateaued for 3 rounds on [dimension]"
- "Run `/diagnose` on the failing traces in `.evolve/traces/`"
- "Run design audit on [URL] to verify UX quality"

Each action has: what to do, which files to touch, acceptance criteria, skill to invoke.
Flag any blockers or dependencies.

### 5. Context the Next Session Needs
- Key architectural decisions and constraints discovered
- Things that DON'T work (save the next session from re-discovering)
- Relevant memory entries to read first
- Commands to run to verify current state
- Per-turn metrics insights (which turns are high-value vs wasted?)

### 6. Roadmap Position
- Where this work fits in the bigger picture
- What comes after the next actions
- Open questions that need user input

## Process

1. Read `git log` for this session's commits
2. Read `.evolve/current.json` and `.evolve/progress.md` — understand the improvement loop state
3. Read `.evolve/scorecard.json` if it exists — know all measured flows
4. Read open issues/PRs on the repo
5. Read `.memory/` for persistent context
6. Read any pursuit or evolve docs in `.evolve/pursuits/`
7. Synthesize into the handoff document
8. Save to `/tmp/handoff-{project}-{timestamp}.md` (not in project tree)
9. Print the path so the next session can read it
10. **Bridge to memory**: extract 3-5 durable learnings and save via memory system. Handoff is temporal; memory is persistent. Don't let session-specific insights die with the handoff file.

## Rules

- **Be specific.** "Fix the scaffold builder" is useless. "In `scripts/experiments/scaffold-builder.ts`, the validation at line 570 only checks file count. Add `pnpm build` exit code check. See issue #1588 checklist item 1." is useful.
- **Include commands.** The next session should be able to run verification commands immediately.
- **Route to skills.** Every next-action should specify which skill to invoke, not just what to do.
- **Include .evolve/ state.** The next session MUST know the evolve/pursue state to avoid re-doing work or breaking mid-experiment.
- **Don't duplicate memory.** Reference memory entries, don't rewrite them. But DO extract new learnings into memory.
- **Capture the user's temperature.** If they're frustrated, note what caused it. If they're excited, note what's working.
- **Be honest about quality.** If the work is 70% done, say so. Don't round up.
- **Include metrics.** If per-turn scoring data exists, note which personas are stable vs noisy, and the current cost-per-run.
