---
name: release-conductor
description: "Run custom production releases where normal CI/deploy is slow, opaque, or repeatedly loses state. Use for binary/server deploys, long builds, manual remote services, 'is latest live?', stale artifacts, waiting on CI/build hooks, rollback/smoke coordination, and release handoffs. Complements /ship and /converge by forcing a release ledger, deploy decision matrix, ETA communication, live-service verification, and post-deploy proof."
---

# Release Conductor

Use this when the release path is not a clean one-command platform deploy, or
when repeated sessions keep rediscovering the same facts. The goal is to get
the right artifact live with proof, while preserving enough state that the next
agent does not start over.

## Fit Check

Use `/ship` instead when the project has a normal deploy script that builds,
deploys, and prints a URL.

Use `/converge` instead when the task is specifically “make CI green” and CI is
the launch gate.

Use this skill when any of these are true:

- Production is a custom server, systemd service, binary, VM, container, or
  manually managed process.
- CI/build hooks are slow, opaque, flaky, or not the fastest path to a known
  correct artifact.
- A remote source build is known to be expensive or dangerous.
- The user asks whether the latest app is live.
- Prior sessions lost the live service name, binary path, deploy URL, branch,
  artifact SHA, or smoke procedure.
- A release takes long enough that the user needs explicit wait-state updates.

## Golden Rule

Never wait silently and never rediscover release state twice. If an operation
will take more than a few minutes, say what is running, why it must run, the
expected duration, and what signal will prove success.

## Phase 0 — Read The Release Facts

Before editing or deploying, read:

- Project instructions: `AGENTS.md`, `CLAUDE.md`, `README.md`, deploy docs.
- Existing release ledger: `.evolve/release-progress.md` if present.
- Git state: branch, dirty files, last commit, upstream status.
- Live service state: actual service/process, URL, binary/container path,
  current version or mtime, logs, and health endpoint.

Create or update `.evolve/release-progress.md` immediately with:

```markdown
# Release Progress

## Target
- Environment:
- Live URL:
- Live service/process:
- Artifact path:
- Rollback artifact/path:
- Credential files:

## Local State
- Branch:
- Commit:
- Dirty files:
- Gates planned:

## Remote State
- Host/provider:
- Current live artifact:
- Current service status:
- Last smoke result:

## Decision
- Build path: local artifact | CI artifact | remote build | platform deploy
- Reason:
- Expected duration:
- Fallback/rollback:

## Timeline
- [timestamp] action/result
```

## Phase 1 — Choose The Fastest Safe Launch Path

Use this decision matrix:

| Situation | Action |
|---|---|
| Remote source build is slow/OOM-prone | Build locally or in controlled CI, upload artifact. Do not remote-build by default. |
| Build hook only confirms HTTP POST | Treat as unverified. Check real build logs or use controlled deploy path. |
| CI is required by branch protection | Run `/converge`; persist progress. |
| CI is non-required and local gates cover the changed surface | Do not wait hours. Record the skipped/irrelevant CI, merge/push if allowed, deploy controlled artifact, smoke. |
| Remote repo diverges from local | Do not copy whole files. Use artifact deploy or surgical patch. Record divergence. |
| Multiple services look plausible | Identify the live one by URL/process/logs before deploy. Never restart the wrong service. |
| Current binary may be stale | Build the release artifact before tests/deploy; verify mtime/hash. |

If a build/deploy wait remains necessary, communicate:

- what command is running
- why it is necessary
- expected duration
- what you will do if it exceeds the expectation

## Phase 2 — Gates

Run the smallest meaningful gates for the touched surface before deploy.
Examples:

- TypeScript: typecheck + focused unit tests + build for the affected package.
- Rust binary: `cargo fmt --check`, focused tests, then release build.
- UI: build + browser smoke for changed routes/components.

Do not invent a giant test sweep if it will block an urgent controlled deploy
and does not cover the changed risk. Do not skip a gate that directly covers the
changed behavior.

## Phase 3 — Build Artifact

Build the exact artifact that will run in production.

For Rust binaries:

```bash
cargo build --release -p <binary-package>
sha256sum target/release/<binary>
ls -lh target/release/<binary>
```

If the target host is resource-constrained, prefer local/cross/CI artifact
builds over remote source builds.

## Phase 4 — Deploy Safely

For custom binaries/services:

1. Upload to `<artifact>.new`.
2. Capture current service status and current artifact hash/mtime.
3. Stop or drain the service.
4. Backup the current artifact with a timestamp.
5. Move `<artifact>.new` into place atomically.
6. `chmod +x`.
7. Start the service.
8. Verify `systemctl is-active` or equivalent.

Never overwrite without a rollback artifact.

## Phase 5 — Smoke The Live Surface

Smoke the public URL and one domain-critical flow.

Minimum proof:

- Health/meta endpoint returns expected JSON.
- Service logs show the new process started cleanly.
- Product-specific smoke proves the feature path, not just process liveness.

If smoke fails:

1. Roll back to the previous artifact.
2. Restart.
3. Smoke rollback.
4. Then diagnose.

## Phase 6 — Close The Loop

Update `.evolve/release-progress.md` with:

- final commit
- artifact hash/path
- live URL
- smoke command and result
- known caveats
- rollback artifact

If the project uses an ops board, mark or create the release task with artifact
URL/proof. Final response should be short: what shipped, where live, tests,
smoke proof, and caveats.

## Project Adapter Pattern

When a project has a repeated release path, add a compact adapter section to
its own `CLAUDE.md` or release docs:

```markdown
## Release Adapter
- Live URL:
- Service:
- Artifact:
- Build:
- Deploy:
- Smoke:
- Rollback:
- Known traps:
```

The adapter belongs in the project, not this generic skill.

## Anti-Patterns

- Waiting on an opaque build hook without checking real build logs.
- Rebuilding on a tiny remote box when a local artifact is faster and safer.
- Restarting a service by name from memory.
- Saying “deployed” after upload but before live smoke.
- Letting a context/session die without `.evolve/release-progress.md`.
- Retrying failed prod smoke instead of rolling back.
- Copying files onto a divergent remote repo to “sync” it.
- Reporting “latest is live” without commit/artifact/service proof.
