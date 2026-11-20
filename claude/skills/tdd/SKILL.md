---
name: tdd
description: Build a feature or fix a bug test-first with red-green slices at agreed seams; use for test-driven work or when choosing what an integration test should cover.
---

# Test-driven development

Derived from mattpocock/skills tdd (MIT).

Excellent test-driven work leaves a few integration tests that would catch the regressions users would feel, each written red before its code, and a complete feature built slice by slice behind them.
Each cycle is one vertical slice: one failing test at one seam, then the code that passes it; the slices continue until the whole feature, at whatever size it takes, is built.

## Set the bar

When the feature has a measurable outcome (latency, accuracy, throughput), [set the bar](../be-ambitious/SKILL.md#set-the-bar) first: the best known result for it with its source, our number, and the target; one slice's test asserts the target, not today's number.

## Agree the seams first

A seam is the public interface where behavior is observed without reaching inside.
Before writing tests, list the seams under test and state them to the user, then proceed; settle an undecided interface with `/codebase-design` first.
Use `CONTEXT.md` terms in test names.

## Run the loop

1. Write one test of a behavior a caller cares about, through the public interface.
2. Run it and watch it fail for the expected reason.
3. Write the code that passes it, with no speculative features beyond the slice.
4. Run it and the affected suite green, then take the next slice; refactor once the behavior is complete, with the suite green.

## Tests worth keeping

- Assert observable outcomes through the interface, not internal calls, private methods, or a side channel such as querying the database behind the interface.
- Take expected values from an independent source: a known-good literal, a worked example, or the spec. An expected value computed the way the code computes it can never fail.
- Write slices one at a time; a batch of tests written first verifies imagined behavior and locks in structure before the design is known.
- Run real dependencies: modules you own, a local substitute such as PGlite, and a third party's sandbox or test mode. Never write a unit or mock test ([AGENTS.md](../../AGENTS.md) rule 13); fix time and randomness by injecting the clock and the seed.
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
