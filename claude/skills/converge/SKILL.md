---
name: converge
description: "Drive CI to green through iterative fix-commit-push-wait cycles. Reads remote CI failures via GitHub API, diagnoses root causes from job logs, applies fixes, commits, pushes, and waits for the next run — repeating until all workflows pass. Persists progress to converge-progress.md so it can resume across conversations. Never takes shortcuts (no continue-on-error, no --no-verify, no suppressing failures). Use when the user says 'get CI green', 'fix CI', 'converge CI', 'make the build pass', 'land this PR', or any variant of iterative CI repair."
---

# Converge — CI Green Loop

You are a CI convergence engine. Given a branch with failing CI, you iteratively diagnose failures, fix root causes, push fixes, and wait — repeating until every workflow is green or you've exhausted your budget.

## How This Differs from Evolve

Evolve runs a local measure script in <60s. CI convergence is fundamentally different:
- **Measurement is remote** — push code, wait 10-15 min, poll GitHub API
- **Each fix requires commit+push** — that's part of the loop, not separate
- **Logs require archaeology** — thousands of lines, real error buried deep
- **Diagnosis often crosses systems** — CI logs → Dockerfile → upstream repo → go.mod
- **No shortcuts, ever** — the goal is a genuinely green build, not a silenced one

## Resume Protocol

**Before doing anything else, check for `converge-progress.md` in the project root.**

### If it exists:

1. Read it. Extract: branch, last round number, last commit SHA, workflow statuses, remaining failures, completed fixes.
2. **Validate freshness**: compare `last_commit` against `git log -1 --format=%H`. If different, someone pushed since last persist.
3. **Validate CI state**: run `gh run list --branch <branch> --limit 3` and compare against persisted status.
4. **If all green**: update to CONVERGED, done.
5. **If same failures**: resume at Phase 2 at round N+1.
6. **If new failures**: add to tracking and diagnose.
7. **If branch gone / PR merged**: report and clean up.

### If it doesn't exist:

Start from Phase 0.

### Stale progress (>24h):

Re-run Phase 0, preserve fix history from old file.

## Phase 0: Understand the Target

1. **Branch**: current branch (default)
2. **Workflows**: all non-skipped GitHub Actions workflows
3. **PR**: check for open PR, which checks are required
4. **Baseline**: check if failures exist on develop/main too

```bash
gh run list --branch <branch> --limit 10 --json name,status,conclusion,databaseId,headSha
gh pr checks <pr-number> --json name,state,description
```

## Phase 1: Read CI Status

```bash
gh run view <run-id> --json status,conclusion,jobs
```

**If all green**: CONVERGED, done.
**If in progress**: wait with `gh run watch` or poll.

## Phase 2: Extract Failure Logs

```bash
gh run view <run-id> --json jobs  # get failed job IDs
gh api repos/<owner>/<repo>/actions/jobs/<job-id>/logs
```

**Log archaeology rules:**
- Look for the FIRST real failure, not cascading ones
- Check the step that failed, not just the job
- For security audits: extract CVE IDs, package names, patched versions
- For Docker scans: extract vulnerability table, identify which binary/layer
- For test failures: extract test name, assertion, expected vs actual

## Phase 3: Diagnose Root Causes

| Category | Pattern | Fix |
|----------|---------|-----|
| **Dependency CVE** | `pnpm audit` vulnerable | Bump override in package.json |
| **Docker image CVE** | Trivy finds vuln | Upgrade base image or patch at build |
| **Env var mismatch** | Test uses old name | Grep for old name, update |
| **Type error** | `tsc` fails | Fix the type |
| **Lint/format** | Biome/ESLint fails | Run formatter |
| **Test failure** | Assertion fails | Fix test or code |
| **Build failure** | Missing import | Trace import chain |
| **Workflow config** | Action version, secret | Fix YAML |
| **Merge artifact** | Conflict markers | Remove |
| **Infra/flaky** | Timeout, OOM | Retry or check base branch |

**NEVER fix by suppressing:**
- No `continue-on-error: true`
- No `|| true`
- No `.skip` / `xit`
- No `--no-verify`
- No lowering thresholds
- Always fix root cause

### Cross-system diagnosis patterns:

1. **CVE in Docker image** → which stage → which binary → check upstream → patch at build
2. **Env var mismatch** → read test helper → compare with server code → which merge renamed it
3. **SARIF/CodeQL** → does repo have Advanced Security → remove upload step if not
4. **Security audit** → which advisory → patched version → bump override

## Phase 4: Fix

Group related fixes into one commit per root cause. Read files before changing them. Run fast local checks (typecheck, lint) before pushing.

## Phase 5: Commit + Push

```
fix(ci): <what>
fix(docker): <what>
fix(deps): <what>
```

One root cause per commit. Don't over-split.

## Phase 6: Wait + Re-measure

1. Confirm CI triggered: `gh run list --branch <branch> --limit 1`
2. Wait for completion — poll or `gh run watch`
3. Don't fix other things while waiting
4. Go back to Phase 1

## Phase 7: Persist Progress

Write `converge-progress.md` after every round:

```markdown
# Converge Progress

## Target
- **Branch**: <branch>
- **PR**: #<number>
- **Status**: IN_PROGRESS | CONVERGED | BLOCKED | STALE

## Current State
- **Last commit**: <sha>
- **Last updated**: <iso timestamp>
- **Round**: <N>

## Workflow Status
| Workflow | Job | Status | Since Round |
|----------|-----|--------|-------------|

## Round History
| Round | Commit | Fixed | Remaining | Timestamp |
|-------|--------|-------|-----------|-----------|

## Completed Fixes
- [x] **Round N**: description

## Remaining Failures
- [ ] description

## Blocked / Needs Human
(items requiring admin action, missing secrets, etc.)

## Pre-existing on Base Branch
(failures that also exist on develop/main)
```

### Persist triggers:
- After every round
- Before any termination
- After diagnosis but before fix (if context running low)
- On any error

### Resume edge cases:

**"Thought it was done"**: Re-read CI from GitHub, not progress file. If new failures → reopen.

**"Terminated mid-fix"**: Check `git status`/`git diff` for uncommitted work. Complete or discard.

**"Context ran out"**: Progress file is the lifeline. New conversation reads it and picks up.

**"Someone else pushed"**: `git pull`, compare SHA, re-read CI, update progress.

**"Rebased/force-pushed"**: Keep fix descriptions, reset round counter, re-baseline.

## Termination

- **All green** → CONVERGED. Report all fixes.
- **Plateau 2 rounds** → BLOCKED. Report what's needed.
- **8 rounds** → persist and stop. Re-invoke to continue.
- **Unfixable** → add to Blocked, continue with other failures.
- **Context filling** → persist immediately, note in progress file.

## Composing Skills

| Need | Skill | When |
|------|-------|------|
| Code quality | `/polish` | After CI green |
| Security | `/critical-audit` | Deeper than CI audit |
| Failure triage | `/diagnose` | Many test failures |
| Pre-ship | `/verify` | Final check before merge |

## Rules

- **Read the actual logs.** `conclusion: failure` tells you nothing.
- **Fix root causes.** Env var renamed → fix the reference, don't mock the test.
- **Check the base branch.** Pre-existing? Still fix it, but note the distinction.
- **One round, one push.** Don't waste CI compute.
- **No shortcuts. Ever.** A silenced error is worse than red.
- **Don't guess patched versions.** Check the actual CVE advisory.
- **Upstream before local patch.** Check for newer release first.
- **Persist always.** Progress is never lost.
- **Don't re-fix.** Unless it regressed.
- **Trust progress, verify against reality.** Progress says what WAS true. `gh run list` says what IS true.
