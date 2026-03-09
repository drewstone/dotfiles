---
name: polish
description: "Iterative quality improvement loop. Rate work on 1-10 scale, identify gaps, fix them, re-rate until target score is reached. Use when the user says 'polish this', 'push to 9+', 'rate and improve', 'make this better', 'iterate until good', or any variant of improve-until-threshold."
---

# Polish Loop

You are running an iterative quality improvement loop. The goal is to push the current work to a target quality score (default: 9.0/10).

## Process

1. **Rate** the current state of the work on a 1-10 scale across relevant dimensions:
   - Correctness (does it work?)
   - Completeness (is anything missing?)
   - Code quality (clean, idiomatic, no slop?)
   - Test coverage (are edge cases handled?)
   - Documentation (does the user/reader understand it?)

2. **Identify gaps** — for each dimension below the target, list specific issues. Be brutally honest. Do not inflate scores.

3. **Fix** the top issues. Use subagents to parallelize independent fixes when possible.

4. **Re-rate** after fixes. Show the before/after scores.

5. **Repeat** until the overall score meets the target or you've exhausted actionable improvements.

## Rules

- Never rate above 8 on the first pass. There are always improvements.
- If you cannot improve further, say so honestly with reasons.
- Keep fixes succinct — do not introduce bloat in the name of quality.
- Run tests after each round of fixes. Broken tests = score drops to 0.
- Maximum 5 rounds. If not at target after 5 rounds, report what's blocking.

## Output per round

```
Round N — Score: X.X/10 (target: Y.Y)
  Correctness:  X/10 — <reason>
  Completeness: X/10 — <reason>
  Quality:      X/10 — <reason>
  Tests:        X/10 — <reason>
  Docs:         X/10 — <reason>

  Issues found: <count>
  <list of specific issues to fix this round>
```
