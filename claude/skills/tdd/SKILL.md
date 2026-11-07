---
name: tdd
description: Build a feature or fix a bug test-first with red-green slices at agreed seams; use for test-driven work or when choosing what an integration test should cover.
---

# Test-driven development

Derived from mattpocock/skills tdd (MIT).

Each cycle is one vertical slice: one failing test at one seam, then the least code that passes it.

## Agree the seams first

A seam is the public interface where behavior is observed without reaching inside.
Before writing tests, list the seams under test and confirm them with the user, or state them when the user is unavailable.
Put effort on critical paths and complex logic rather than every edge.
Use the project's domain terms from `CONTEXT.md` in test names.
If the interface itself is undecided, settle it with `/codebase-design` first.

## Run the loop

1. Write one test that describes a behavior a caller cares about, through the public interface.
2. Run it and watch it fail for the expected reason.
3. Write only enough code to pass it; add no speculative features.
4. Run it and the affected suite green, then take the next slice.

Refactor after the behavior is complete, as a separate review pass with the suite green.

## Tests worth keeping

- Assert observable outcomes through the interface, not internal calls, private methods, or a side channel such as querying the database behind the interface.
- Take expected values from an independent source: a known-good literal, a worked example, or the spec. An expected value computed the way the code computes it can never fail.
- Write slices one at a time; a batch of tests written first verifies imagined behavior and locks in structure before the design is known.
- Mock only at system boundaries: third-party APIs, time, randomness, and sometimes the database or filesystem. Use real code for modules you own.
- Design boundaries for this: inject the client, and expose one function per external operation instead of a generic fetcher with branches.

A test that breaks during a refactor without a behavior change is coupled to the implementation; fix the test.

## Log the run

```bash
skill-run-log /tdd --target "<behavior>" --verdict <PASS|FAIL|PARTIAL|BLOCKED|ABANDONED> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The behavior is complete and needs review before merge | `/critical-audit` | the diff, spec, and seams tested |
| Broader checks remain before delivery | `/verify` | the changed behavior and test commands |
