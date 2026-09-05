---
name: verify
description: Run relevant tests, builds, checks, and git inspection; report proof and unchecked work.
---

# Verify Before Ship

Perform a thorough verification that work is complete and ready to ship. Do NOT ask questions — run checks and report.

## Fit Check — before verifying

1. **Repo shape**: verify works on any git repo. No bootstrap required.
2. **Build present**: if the repo has no build step and no test command, verify's scope is reduced to diff review + secrets + debug-artifact scan. Surface this explicitly in the report so the operator doesn't infer false coverage.
3. **Target**: identify the artifact, revision, and comparison base requested by the user.
   A clean or fully pushed branch still needs the requested verification.
4. **Resume check**: if `.agent/current.json` shows a `/pursue` or `/converge` session in flight, verify's report is the INPUT to their evaluate/stop steps, not a standalone deliverable. Include the active skill's session ID in the report so the caller can correlate.

## Read Current State

Read `git status --short`, staged and unstaged diffs, and the branch diff against the requested base.
Inspect the complete relevant diff.
Report command failures and any files excluded from review.

## Additional Checks (run in parallel)

1. **Tests pass** — run the full test suite. Report pass/fail counts. For any test file ADDED in this diff, confirm it exercises real infra: real DB, real HTTP call, real sidecar — not `vi.fn()` / `mockFetch` / in-memory stubs standing in for the system under test. Mocks are fine at process boundaries; they are NOT fine as primary coverage of the new code. A mocked test passes while the production bug stays.
2. **No debug artifacts** — grep changed files for `console.log`, `print(`, `debugger`, `TODO`, `FIXME` that shouldn't ship.
3. **Build succeeds** — if the project has a build step, run it.
4. **No secrets** — scan changed files for patterns that look like API keys, passwords, or credentials.
5. **Changed behavior has a named regression** — every test added or modified in the diff should have a one-line comment or test name that describes the bug it would catch if the code regressed. Tests without a named regression are hope, not coverage.

## Report format

```
## Verification

| Check | Result |
|-------|--------|
| Tests | PASS (N passed, M failed) |
| Real-infra coverage | OK / N mocked tests covering new code |
| Git status | CLEAN / N uncommitted files |
| Debug artifacts | CLEAN / N found |
| Build | PASS / FAIL / N/A |
| Secrets scan | CLEAN / WARNING |
| Diff review | OK / N concerns |

Overall: SHIP IT / HOLD (reasons)
```

If any check fails, explain what needs fixing before shipping. Be specific.

## Log the run

On completion, append one line so later analysis can grade this skill:

```bash
skill-run-log /verify --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Overall SHIP IT | `/ship` | the verified SHA + the deploy command |
| HOLD with ≥1 FAIL and a non-trivial fix | `/pursue` | the failing check + the design the fix needs |
| HOLD only from fixed-rubric gaps (no FAIL rows) | `/polish` | the rubric gaps + the files they sit in |
| HOLD because CI or the local gate is red | `/converge` | the failing job + its log excerpt |
| Real-infra coverage shows ≥1 new code path covered only by mocks | `/harden` | the path + the real-infra test that must replace the mock |
| SHIP IT and ≥3 skill runs logged this session | `/reflect` | the `.agent/skill-runs.jsonl` tail + the proof table |
