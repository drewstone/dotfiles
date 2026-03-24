---
name: plan
description: "Generate a comprehensive implementation plan for a feature, project, or strategic direction. Reads the codebase, researches alternatives, and outputs a structured markdown document with architecture diagrams, implementation checklists, quality scorecards, risk tables, and effort estimates. Use when the user says 'plan this', 'write a plan', 'implementation plan', 'design doc', 'RFC', or wants a detailed brief before building."
---

# Plan — Implementation Brief Generator

You are writing a FULL IMPLEMENTATION PLAN. This must be the quality of a principal engineer's design doc — the kind that gets approved by a staff+ engineering review.

## Process

1. **Read the codebase** — understand what exists, what's relevant, what to reference
2. **Research** — check for prior art, alternatives, related patterns in the project
3. **Write the plan** — structured markdown with all sections below

## Required Sections (include ALL)

### 1. Executive Summary
3-4 sentences. What, why, and what changes when this ships.

### 2. Context & Motivation
- Current state (reference actual code you read)
- Why this matters NOW (with evidence)
- What happens if we DON'T do this
- Who benefits and how

### 3. Architecture
- ASCII diagram of the system before and after
- Mermaid diagram if data flow is complex
- Key interfaces and abstractions
- How this fits into the existing system

### 4. Detailed Implementation
For EACH step, include:
- [ ] Specific file path to create/modify
- Code snippet showing the key change
- What to verify after this step
- Estimated time

### 5. API Changes
- New endpoints with request/response shapes
- Changed endpoints with migration path

### 6. Alternatives Considered

| Approach | Pros | Cons | Why rejected |
|---|---|---|---|
| ... | ... | ... | ... |

### 7. Quality Scorecard

| Dimension | Score | Bar | Justification |
|---|---|---|---|
| Impact | X/10 | █████░░░░░ | ... |
| Feasibility | X/10 | ████████░░ | ... |
| Risk | X/10 | ██████░░░░ | (lower = riskier) |
| Novelty | X/10 | ███░░░░░░░ | ... |
| Taste alignment | X/10 | ████████░░ | ... |
| Time to value | X/10 | ██████░░░░ | ... |
| Learning potential | X/10 | ████░░░░░░ | ... |
| Cross-project leverage | X/10 | ██░░░░░░░░ | ... |
| Defensibility | X/10 | █████░░░░░ | ... |
| Fun factor | X/10 | ████████░░ | ... |
| **Composite** | **X/10** | | weighted average |

### 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ... | high/med/low | high/med/low | ... |

### 9. Edge Cases & Pitfalls
Specific scenarios. Not generic warnings.

### 10. Testing Strategy
- Unit tests needed (with file paths)
- Integration tests
- E2E verification steps

### 11. Success Criteria
Measurable. "Tests pass" is not enough. "Coverage > 80%, all API endpoints respond < 200ms, zero regressions on existing tests."

### 12. Dependencies & Prerequisites
What must exist before starting. What blocks what.

### 13. Effort Estimate

| Phase | Hours | Cost | Notes |
|---|---|---|---|
| Design | X | $0 | ... |
| Implementation | X | $Y | ... |
| Testing | X | $0 | ... |
| **Total** | **X** | **$Y** | |

### 14. Rollback Plan
How to undo if it goes wrong. Be specific — "revert the commit" is not a rollback plan.

## Output

If an output path is specified, write the plan there using the Write tool.
Otherwise, output the full plan as your response.

The plan should be 200-400 lines. Every claim must reference real code, real files, real APIs. No pseudocode. No generic templates. No filler.

## Rules

1. **Read before writing.** Understand the codebase before proposing changes to it.
2. **Be specific.** File paths, function names, line numbers where relevant.
3. **Be honest.** If something is risky, say so. If an alternative is better, recommend it even if it's not what was asked for.
4. **Include diagrams.** ASCII for architecture, Mermaid for data flow.
5. **Score honestly.** A 6/10 impact with good reasoning is more useful than a 10/10 with vague justification.
