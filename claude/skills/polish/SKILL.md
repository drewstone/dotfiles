---
name: polish
description: "Relentless quality loop. Tears apart work across correctness, design, edge cases, and engineering rigor — then fixes everything. Never stops at 'good enough'. Use when the user says 'polish this', 'push to 9+', 'rate and improve', 'make this better', 'iterate until good', or any variant of improve-until-threshold."
---

# Polish Loop

You are running a relentless quality loop. The bar is world-class engineering — code that a principal engineer would mass on first read. Default target: 10/10. The user may request 11/10 which means: exceed what's expected, find improvements nobody asked for, leave the codebase measurably better than you found it.

## Process

1. **Audit** the current state across these dimensions. Be ruthlessly honest. If something is merely "fine", that's a 6, not an 8.

   - **Correctness** — Does it actually work in all cases? Edge cases, error paths, concurrency, empty inputs, huge inputs, malformed inputs. Not "does the happy path work."
   - **Design** — Is the architecture right? Are abstractions justified? Would you have to explain any of this to a new engineer, or does it explain itself? Is anything over-engineered or under-engineered?
   - **Robustness** — Error handling, failure modes, invariants. What happens when things go wrong? Silent failures are a 0.
   - **Tests** — Are the tests actually testing behavior, or just asserting that code runs? Do they cover edge cases? Would a subtle regression slip through?
   - **API surface** — Is the public interface clean? Would a user of this code curse you? Are defaults sane? Is the CLI/API self-documenting?

2. **List every issue** — no matter how small. Group by severity. Don't hedge with "might want to consider" — either it's a problem or it isn't.

3. **Fix everything** in priority order. Use subagents to parallelize independent fixes. Don't ask permission for obvious improvements.

4. **Run tests.** If anything breaks, that's a regression you introduced — fix it immediately before re-rating.

5. **Re-rate** with before/after. Show what moved and why.

6. **Repeat** until target is met or you've genuinely exhausted improvements (and can articulate why).

## Rules

- **No score inflation.** A 9 means a senior staff engineer would approve with zero comments. A 10 means they'd learn something from reading it. An 8 means "solid but I have notes." Most code starts at 5-7.
- **No fluff fixes.** Adding comments that restate the code is negative value. Adding a docstring to a private helper is noise. Every change must make the code measurably better for the next person who reads or modifies it.
- **Design thinking > cosmetics.** A well-designed module with no comments beats a poorly-designed one with perfect docs. Prioritize structural improvements over surface polish.
- **Tests must be meaningful.** A test that mocks everything and asserts `True` is worse than no test. Tests should break when behavior changes.
- **Keep fixes surgical.** The best improvements are small, precise, and obvious in hindsight. If a fix requires 50 lines of scaffolding, the design is wrong — fix the design instead.
- **Maximum 5 rounds.** If not at target after 5, report what's blocking honestly.
- **Broken tests = stop everything.** Fix the regression before touching anything else.

## Output per round

```
Round N — Score: X/10 (target: Y)
  Correctness:  X/10 — <honest assessment>
  Design:       X/10 — <honest assessment>
  Robustness:   X/10 — <honest assessment>
  Tests:        X/10 — <honest assessment>
  API surface:  X/10 — <honest assessment>

  Issues: <count>
  <prioritized list — what's wrong and why it matters>
```
