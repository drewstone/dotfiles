---
name: ship
description: "Full pass to prod — typecheck, build, deploy, smoke. Use when the user says 'ship it', 'deploy', 'push to prod', 'ship to prod', or any variant of 'run the full release sequence'. Parallelizes the independent phases and fails fast on the first red signal."
---

# Ship Loop

You are executing a full pass to production. The bar: whatever gets deployed must have been typechecked, built, and smoke-tested. No partial states, no "it builds on my machine", no skipped phases.

## Fit Check — before shipping

1. **Scope check**: `/ship` is for actual deploys, not local builds. If the user hasn't asked to deploy, route to `/verify` (typecheck + build + test, no deploy) or just run tests directly.
2. **Clean tree**: uncommitted changes should be intentional. If the tree is dirty, ask — you do not know whether that state was meant to ship.
3. **Target known**: one of {dev, staging, prod}. If ambiguous and the user says "ship it", confirm target before touching deploy commands — prod is irreversible in ways dev and staging are not.
4. **Deploy gate**: prod deploys always confirm with the user first, even if the user said "ship it". Authorization once is not authorization for the prod push specifically.

## Phases

Phases are ordered but run commands in parallel within a phase where safe:

### Phase 1 — Gate (parallel)

Run these in parallel, fail fast on any red:
- `pnpm typecheck` (or project-equivalent)
- `pnpm test` (the fast suite, not the 20-minute integration sweep)
- `pnpm build` (generates the artifact that will ship)

If any fails: stop. Diagnose. Do not paper over with `--skip` or `--no-verify`. A failed gate is load-bearing information about what's broken.

### Phase 2 — Deploy

Run the project's deploy command. Examples:
- Cloudflare Workers: `pnpm wrangler deploy`
- Vercel: `pnpm vercel --prod`
- Railway: `railway up`
- Custom: whatever the project's CLAUDE.md or package.json scripts declare

Capture the deploy URL. Do not guess it — the deploy command prints it.

### Phase 3 — Smoke (parallel)

Hit the live deployment with the minimal end-to-end path that proves the ship worked:
- Health endpoint: `curl https://<deploy>/health` expects 200
- A canonical request path: whatever proves the critical flow (login, checkout, etc)
- If the project declares a `smoke:prod` script, prefer it over ad-hoc curls

If smoke fails on prod: roll back immediately (do not retry). Use the project's rollback command (`wrangler rollback`, `vercel rollback`, etc). Investigate after rollback, not before.

### Phase 4 — Announce

One line in the conversation: what shipped, version, URL, green/red. No ceremony.

## Rules

- **No `--skip`, no `--no-verify`, no bypassing pre-commit.** The gates are there for a reason. If they're wrong, fix the gate — don't bypass it.
- **Parallelize Phase 1.** Typecheck, test, and build are independent. Run them in parallel for ~3x speedup vs sequential.
- **Fail fast.** One red = stop. Do not continue to the next phase hoping the rest will cover.
- **Every deploy prints its URL.** If the deploy command doesn't print a URL, it did not deploy — scrape the deploy logs, don't invent one.
- **Smoke tests are not optional.** If there is no smoke script, write a minimal `curl` pipe as the smoke. Silent prod deploys are how regressions reach customers.
- **Version discipline.** If the project uses version tags, bump before deploy. If it uses `main`, confirm `git status` is clean first.
- **No retry loops on prod smoke fail.** Roll back first, diagnose second.

## Error recovery

| Symptom | Action |
|---|---|
| Typecheck fails | Fix types. Never `// @ts-ignore` under ship pressure |
| Test fails | Fix the test or fix the code. Never `.skip` |
| Build fails | Read the actual error. Do not blindly `rm -rf node_modules` — diagnose first |
| Deploy fails mid-way | Check deploy logs. Resume or roll forward; do not half-deploy |
| Smoke fails on prod | Roll back. Then diagnose. |
| Smoke fails on dev/staging | Investigate without rolling back; that's what dev/staging is for |

## Project integration

Projects can declare their own ship sequence in CLAUDE.md:

```
## Ship sequence
- Gate: pnpm typecheck && pnpm test && pnpm build
- Deploy: pnpm wrangler deploy --env production
- Smoke: pnpm smoke:prod
- Rollback: pnpm wrangler rollback
```

If a project declares its own sequence, follow it exactly. `/ship` is the generic scaffold — project-specific commands override.

## Relationship to other skills

```
/ship        ← full pass to prod (typecheck + build + deploy + smoke)
  ├── /verify     ← if user wants the gate phase only (no deploy)
  ├── /harden     ← before first prod ship, run adversarial battery
  └── /diagnose   ← if smoke fails, route here to find root cause
```

`/ship` is the final step. Use `/verify` for pre-deploy gates, `/harden` for adversarial sweeps, and `/diagnose` when smoke catches a regression.

## Example: Cloudflare Workers + Hono + D1

```bash
# Phase 1 (parallel)
pnpm typecheck &
pnpm test &
pnpm build &
wait

# Phase 2
pnpm wrangler deploy --env production

# Phase 3 (parallel smoke)
curl -fsS https://api.example.com/health &
curl -fsS https://api.example.com/v1/ping &
wait

# Phase 4
echo "shipped v1.2.3 → https://api.example.com"
```

The shell `&` + `wait` idiom gives real parallelism inside a single bash call.
