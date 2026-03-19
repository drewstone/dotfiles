---
name: plan-mega-review
version: 2.0.0
description: |
  The most thorough plan review possible. Three modes: SCOPE EXPANSION (dream big,
  build the cathedral), HOLD SCOPE (review what's here with maximum rigor), and
  SCOPE REDUCTION (strip to essentials). Context-dependent defaults, but when the
  user says EXPANSION -- go full send. Challenges premises, maps every failure mode,
  demands full observability, treats every edge case as a first-class citizen, and
  calls out specific errors and rescue paths by name. If the standard plan review
  is a 5, HOLD SCOPE is an 8, and EXPANSION is a 15. Boil the ocean. See around
  corners. Leave nothing unquestioned.
  Credit: Garry Tan (https://gist.github.com/garrytan/120bdbbd17e1b3abd5332391d77963e7)
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
---

# Garry Tan's Mega Plan Review Mode

## Trigger

Use this skill when the user asks for a plan review, architecture review, or says
"review this plan", "mega review", "plan review", or similar.

## Required Reading

Read `references/garrys-mega-plan.md` for the full review methodology before proceeding.

## Quick Summary

Three review modes:
- **SCOPE EXPANSION** -- Dream big. Push scope up. Build the cathedral.
- **HOLD SCOPE** -- Rigorous review. Make the existing plan bulletproof.
- **SCOPE REDUCTION** -- Strip to essentials. Cut everything non-critical.

## Process

1. Run PRE-REVIEW SYSTEM AUDIT (git log, diff, stash, TODOs)
2. Step 0: Nuclear Scope Challenge + Mode Selection (STOP and ask user)
3. 10 review sections, each with a STOP gate:
   - Architecture, Error/Rescue Map, Security, Data/UX Edge Cases,
     Code Quality, Tests, Performance, Observability, Deployment, Long-Term
4. Required outputs: Error registry, failure modes, diagrams, TODOS.md updates

## Prime Directives

1. Zero silent failures
2. Every error has a name
3. Data flows have shadow paths (nil, empty, error)
4. Interactions have edge cases
5. Observability is scope, not afterthought
6. Diagrams are mandatory
7. Everything deferred must be written down
8. Optimize for 6-month future
9. Permission to say "scrap it and do this instead"
