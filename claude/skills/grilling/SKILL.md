---
name: grilling
description: Stress-test a plan, decision, or idea by questioning the user in rounds until no decision is left assumed; use when asked to grill or challenge thinking.
---

# Grilling

Derived from mattpocock/skills grilling (MIT).

Map the plan as a decision tree: each decision branches into the decisions that depend on it.
The frontier is every open decision whose prerequisites are settled.

1. Ask the whole frontier in one round. Number each question, give the options when they are discrete, and give your recommended answer under it.
2. Find facts yourself from the code, files, and tools; ask the user only for decisions. A question that waits on a lookup belongs to a later round, so ask the rest now.
3. Wait for the answers, recompute the frontier, and ask the next round. A question that depends on an answer still open goes to a later round.
4. Finish when the frontier is empty and every branch has been visited.
   Summarize the decisions and confirm the shared understanding before acting on it.

Format each question as:

```
**Q1. <title>**: <question and choices>
Recommended: <answer and one-line reason>
```

## Log the run

```bash
skill-run-log /grilling --target "<plan>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The settled plan is a product bet whose value is uncertain | `/product-innovation-audit` | the decisions and open risks |
| The plan includes interface or domain decisions | `/codebase-design` | the settled terms and constraints |
