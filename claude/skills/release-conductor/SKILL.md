---
name: release-conductor
description: Run a custom release with artifact tracking, live checks, rollback, updates, and handoff.
---

# Release Conductor

Use this when release is not a simple trusted deploy script or when prior sessions keep losing state.
The goal is the right artifact live with proof.

## Start

1. Identify artifact, environment, owner, current live version, expected version, and rollback path.
2. Read project release docs, scripts, CI, prior deploy logs, and current service state.
3. Create or update a release ledger with command, result, timestamp, and next action.
4. Run the smallest smoke before a long or external deploy.

## Loop

1. Build or select the artifact.
2. Deploy using the least opaque path available.
3. Watch logs or status until success/failure is known.
4. Verify live behavior with curl, UI check, version endpoint, or product smoke.
5. Record proof and residual risk.

## Rules

- A build-hook 200 only proves the hook accepted the request.
- Do not claim live until the live endpoint or product path proves it.
- If third-party deploy logs are opaque, pivot to infrastructure you can observe.

Use `references/full-reference.md` for the full ledger format and release decision matrix.

## Then consider

- `converge` when CI is the blocking release input.
- `ship` when the project has a reliable one-command deploy path.
