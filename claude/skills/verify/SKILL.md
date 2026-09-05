---
name: verify
description: Run relevant tests, builds, checks, and git inspection; report proof and unchecked work.
---

# Verify

Verify the requested artifact and revision, then report the evidence and unchecked work.
A clean or fully pushed branch still needs the requested verification.

## Establish coverage

1. Identify the target, revision, comparison base, and user's completion requirements.
2. Read current git state, staged and unstaged changes, and the complete relevant branch diff.
3. Read repository checks and the tests that cover the changed behavior.
   Choose unit, integration, build, or browser checks according to the boundary being changed.
4. Check changed files for exposed credentials and debug artifacts that would affect the delivered result.
   Inspect candidates in context; legitimate logging or a remaining TODO is not automatically a defect.

## Run and assess

Run the affected checks and the repository's required validation.
Respect dependencies between commands and collect each exit status when checks run concurrently.
Confirm that regression coverage can catch the behavior it claims to protect.
A test double can isolate a dependency, but cannot stand in for the integration behavior the test claims to verify.

If no build or test command exists, inspect the actual artifact with suitable structural, link, syntax, or behavioral checks.
State the resulting coverage rather than implying a test suite ran.
Diagnose failures and repair them when fixes are part of the request.
Keep report-only verification read-only.

## Result

For each relevant check, report `PASS`, `FAIL`, `UNCHECKED`, or `N/A`, with the command or inspection evidence and its result.
Include counts where the tool reports them, exclusions, environment limits, and unresolved concerns.
Name the verified revision and any changes made after it was checked.

A ready-for-release verdict means the requested verification passed; it does not grant deployment authority.
If this is part of an active task, pass the results back to that task and continue its already-authorized work.

## Log the run

```bash
skill-run-log /verify --target "<what this run targeted>" --verdict <VERDICT> --next /<next-skill-or-stop>
```

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Verification passes and an authorized release remains | `/ship` | the verified revision, target, and release path |
| Required local or remote checks fail | `/converge` | the failure evidence and preserved requirements |
| Unresolved quality gaps need an implementation review | `/polish` | the gaps and checks that exposed them |
| A security boundary remains untested | `/harden` | the boundary, risk, and missing behavior check |
