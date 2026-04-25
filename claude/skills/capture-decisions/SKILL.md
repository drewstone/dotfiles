---
name: capture-decisions
description: "Structured decision/failure/session records with rationale, alternatives, human-vs-AI contribution analysis, outcomes. Maintains a research/ corpus. Triggers: 'capture this decision', 'document the reasoning', 'decision record', 'ADR', after a significant architectural choice or pivot."
---

# Capture Decisions — Structured Development Intelligence

Every significant decision has a story: context, alternatives, why this, who contributed what, what happened. Most is lost in chat history and commit messages. This captures it in a structured, searchable, publishable format.

Shared conventions in `_common.md`.

## When to Invoke

- **After an architectural decision**: "We're switching from X to Y"
- **After a pivot**: "This approach isn't working, we're changing direction"
- **After a significant fix**: "This bug revealed a design flaw"
- **After a session**: "Let me capture what we learned"
- **Proactively**: "What decisions have we made that aren't documented?"
- **Before planning**: "Review our decisions before deciding what's next"

## Directory Structure

Create `research/` in the project root (if it doesn't exist):

```
research/
  README.md              — thesis, paper outline, tracking guide
  decisions/
    YYYYMMDD-HHMMSS-short-name.md  — timestamped for ordering, parallel-safe
    ...
  metrics/
    YYYY-MM-DD-label.md  — quantitative snapshots
  failures/
    YYYYMMDD-HHMMSS-what-failed.md  — timestamped, parallel-safe
  sessions/
    YYYY-MM-DD-label.md  — session summaries with contribution analysis
```

## Decision Record Format

```markdown
# Decision [YYYYMMDD-HHMMSS]: [Title]

Date: [date]
Status: PROPOSED | ACCEPTED | SUPERSEDED | REVERTED
Origin: [who/what prompted this — Human, AI, Bug, Metric, External]

## Context
[What situation led to this decision? What problem needed solving?
Include specific evidence: error messages, metrics, user feedback, code smells.]

## Decision
[What was decided. Be specific — not "improve performance" but
"replace O(n²) graph rebuild with incremental state updates."]

## Rationale
[WHY this choice over alternatives. Connect to evidence from Context.]

## Alternatives Considered
- [Alternative A] — rejected because [specific reason]
- [Alternative B] — rejected because [specific reason]
- [Alternative C] — partially adopted: [what was kept and why]

## Origin Analysis

### Human Contribution
[What insights, direction, critique, or domain knowledge came from the human?
Quote specific messages when possible.]

### AI Contribution
[What design, implementation, research, or analysis came from the AI?
Be honest about what was generated vs genuinely novel.]

### Interaction Pattern
[How did human and AI contributions combine? Common patterns:
- Human identified problem → AI proposed solution
- AI built something → Human critiqued → better design emerged
- Human asked a question → question revealed a gap → AI filled it
- AI suggested X → Human redirected to Y → compromise Z emerged]

## Implementation
[Brief description of what was built. Link to commits, files, or PRs.]

## Outcome
[What happened after the decision? Did it work? Metrics before/after.]

## Lessons
[What would you do differently? What surprised you?
What does this teach about the domain, the methodology, or the human-AI collaboration?]
```

## Session Summary Format

After a significant work session:

```markdown
# Session: [date] — [label]

Duration: [time]
Scope: [what was worked on]

## Key Decisions Made
- [link to decision records created]

## Metrics
| Metric | Before | After |
|---|---|---|
| [relevant metric] | [value] | [value] |

## Human vs AI Contribution Map
| Component | Human | AI | Pattern |
|---|---|---|---|
| [what was built] | [human's role] | [AI's role] | [how they interacted] |

## What Worked
[specific evidence]

## What Didn't Work
[specific evidence with diagnosis]

## Open Questions
[things that came up but weren't resolved]

## Product/Research Signals
[ideas that emerged from the work]
```

## Failure Record Format

```markdown
# Failure [YYYYMMDD-HHMMSS]: [What Failed]

Date: [date]
Severity: [how bad — data loss, wasted time, wrong direction, minor]
Detection: [how was it discovered — test, user report, metric, accident]

## What Happened
[specific description with evidence]

## Root Cause
[WHY it failed — distinguish symptoms from causes]

## What We Tried Before Finding the Fix
[the debugging journey — this is valuable data]

## Fix
[what actually solved it]

## Prevention
[what would prevent this class of failure in the future]

## Lessons
[what does this teach about the system, the methodology, or assumptions?]
```

## How to Use This Skill

### Capture a specific decision
```
/capture-decisions document why we switched from daemon to service architecture
```

### Scan for undocumented decisions
```
/capture-decisions scan this project for significant decisions in the git log that aren't documented yet
```

Read the git log, identify commits that represent decisions (not just "fix typo"), and create decision records for any that don't have one.

### Session debrief
```
/capture-decisions summarize this session
```

Analyze the current conversation, identify decisions made, create records for each, and write a session summary.

### Review existing decisions
```
/capture-decisions review — are our decisions still valid?
```

Read all existing decision records, check if any have been superseded by later work, update statuses, and note outcomes.

## Rules

1. **Capture decisions when they happen, not later.** Context decays fast. The rationale that's obvious now will be mysterious in 3 months.

2. **Be specific about origin.** "We decided to use X" is useless. "Drew said 'the prompt IS the product' which led to building the prompt composition system" is a researchable claim.

3. **Track failures as carefully as successes.** Failed approaches with good analysis are more valuable than undocumented successes.

4. **Separate signal from noise.** Not every code change is a decision. Decisions change direction, introduce new concepts, or reject alternatives. Routine implementation is just implementation.

5. **Update outcomes.** A decision record without an outcome is a hypothesis. Go back and fill in what happened.

6. **Quote the human.** When the human's words drove a decision, quote them exactly. This is primary source data for understanding human-AI collaboration.

7. **Be honest about AI contribution.** Don't claim the AI "designed" something if it generated the obvious implementation. Don't claim the human "designed" something if the AI proposed it and the human just approved.

8. **Timestamp precisely.** Use YYYYMMDD-HHMMSS format. Timestamps sort naturally and prevent collisions across parallel sessions.

9. **Cross-reference.** Decisions reference other decisions by timestamp. "This supersedes Decision 20260320-141523." "This was motivated by Failure 20260319-093012."

10. **This is publishable material.** Write it like a researcher, not like a developer. Future readers include: you in 6 months, your team, academic reviewers, open-source contributors.

## Where it fits

This skill is institutional memory. Other skills produce work; this produces understanding of the work. `/reflect` and this skill compose — reflect identifies what's significant, capture-decisions records it.

Append to `.evolve/skill-runs.jsonl` on completion.
