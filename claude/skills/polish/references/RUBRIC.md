# Check catalog — worked examples

Non-normative. `SKILL.md` is the contract; this file is a menu of checks that produce a `PASS`/`FAIL` with a command behind it. Pick ≥1 per criterion, or write a better one for the artifact at hand.

The artifact changes, the criterion does not: for prose/skills/docs read Correctness as factual accuracy, API surface as reader interface, Tests as "would a wrong edit be caught".

| Criterion | Example check (run it, keep the output) | `FAIL` looks like |
|---|---|---|
| Correctness | Feed the 6 hostile inputs: empty, 1 element, 10k elements, malformed, duplicate concurrent call, unicode/NUL. | 4 of 6 inputs crash or return a wrong value; `path:line` for each. |
| Correctness | Delete a branch, re-run the suite. Still green ⇒ that branch is untested, not proven. | Suite 41/41 green with the timeout branch deleted. |
| Design | Count callers of each exported symbol: `rg -n "from '.*<mod>'" \| wc -l`. | 3 of 9 exports have 0 callers; abstraction serves 1 caller. |
| Design | Time-to-explain: name the file a new engineer must read 2nd. If there is no obvious 2nd, structure is implicit. | Entry point requires reading 5 files in a fixed order that nothing states. |
| Robustness | `rg -n "catch\s*\{\s*\}|\?\?\s|return null" <dir>` — every hit is a candidate silent failure. | 2 of 7 catch blocks swallow and return a default; caller cannot tell. |
| Robustness | Kill the dependency mid-call (drop network, revoke key, SIGKILL child). | Returns `{ok:true}` with empty data instead of throwing. |
| Tests | Mutation check: change one constant / invert one condition, re-run. | 0 of 12 tests fail after inverting the guard. |
| Tests | Count assertions that only prove code ran: `rg -n "toBeTruthy\(\)|not\.toThrow\(\)|toBeDefined\(\)"`. | 8 of 30 assertions are existence-only. |
| API surface | Write the smallest correct call from the public docs alone, no source reading. | 2 required options are undocumented; default silently disables retries. |
| API surface | Name honesty: does every exported name still describe what it does after the last 3 edits? | `syncUser()` performs a delete on one branch. |

## Ranking gaps

User-visible impact = callers or users hit (`n=`) × severity (silent wrong answer > crash > degraded > cosmetic). A silent wrong answer hitting 1 caller outranks a crash hitting 0 in production. Fix effort is not an input to the ranking; it is a column in the fix plan.
