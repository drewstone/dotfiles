# Polish Rubric — the five dimensions

The single source of truth for what polish audits. SKILL.md cites this file; a per-dimension subagent reads its own brief here verbatim. Score each dimension 1–10 with the anchors at the bottom — no inflation.

For prose, skills, and docs, the mappings in parentheses apply: the dimension is the same, the artifact is different.

## Correctness (for prose: factual accuracy)

Does it actually work in **all** cases, not just the happy path? Exercise edge cases, error paths, concurrency, empty inputs, huge inputs, malformed inputs. The question is never "does the demo pass" — it's "what input breaks this." For prose/docs: every claim is true, every command runs as written, every link resolves, every cited number traces to a real source. A plausible-sounding but wrong statement scores the same as a crashing branch.

## Design

Is the architecture right? Are the abstractions justified, or is something over- or under-engineered? Would you have to explain any of this to a new engineer, or does it explain itself? The best score goes to a structure so clear the next person never asks "why is this here." Prefer fixing the design over papering it with comments — a well-designed module with no comments beats a poorly-designed one with perfect docs.

## Robustness

Error handling, failure modes, invariants. What happens when things go wrong — does it fail loud and recoverable, or silently corrupt state? A silent failure is an automatic 0 for this dimension. Name the invariants the code relies on and confirm each is enforced, not assumed. For prose: does the argument hold under an adversarial reading, or does one counterexample collapse it?

## Tests

Are the tests testing **behavior**, or just asserting that code runs? `toBeTruthy()` / `not.toThrow()` / a test that mocks everything and asserts `true` is worse than no test — it's false confidence that rots in parallel to the code. Every test should break when the behavior it guards changes, and you should be able to name the specific regression it catches. Cover the edge cases and failure modes from the Correctness and Robustness dimensions, not just the path the author already knew worked.

## API surface (for prose: reader interface)

Is the public interface clean? Would a user of this code curse you? Are the defaults sane, the names honest, the CLI/API self-documenting? Minimize what a caller must know to use it correctly. For prose/docs: is the structure scannable, the lede up front, the next action obvious — does the reader get what they came for without fighting the document.

## Scoring anchors

- **10** — a senior staff engineer would learn something from reading it.
- **9** — a senior staff engineer would approve with zero comments.
- **8** — solid, but I have notes.
- **5–7** — where most work starts. "Fine" is a 6, not an 8.
- **0** — silent failure, false-confidence test, or a factual claim that's wrong.

A dimension that is merely "fine" is a 6. Do not round up to feel finished.
