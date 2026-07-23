---
name: deploy-proof
description: Prove a merged change is live and correct in production, including caches and performance.
---

# Deploy Proof

Close the gap between "merged" and "serving traffic." This skill is for release closeout when the repo uses asynchronous deploy infrastructure, especially Cloudflare Pages or Workers.

## Fit Check

Use this when the user asks whether work is live, shipped, deployed, validated, or ready to announce. Also use it after merge when the change affects production behavior, performance, caching, auth, billing, discovery, chat, or benchmarks.

Do not use this for local-only verification before a PR is merged. Use `/verify` or `/ship` there.

## Evidence Order

1. Current git state: `git status --short`, current branch, local `HEAD`, upstream tracking branch, and latest merge commit if on `main`/`develop`.
2. Deploy system: GitHub Actions deploy workflow, Cloudflare Pages/Workers deployment list, or the repo-specific deploy command documented in AGENTS/README.
3. Served artifact: curl a production or staging endpoint that proves the deployed revision, build hash, or behavior is the expected one.
4. Behavior probe: exercise the changed route or user-visible behavior through the public URL.
5. Metrics/prod-only claims: if claiming caching or performance, measure against the deployed dependency from outside local dev.

## Repo Memory

Before proving a deploy in any repo, read local memory or agent instructions for deploy-specific pitfalls if present. Look especially for entries about asynchronous deploy queues, production validation, cache semantics, and provider-specific rollout behavior.

For Cloudflare Worker caching claims, a `Cache-Control` header is not evidence. The Worker must use `caches.default`, and the proof must include two public curls where the second response shows `cf-cache-status: HIT`.

For perf claims, local numbers are synthetic unless they hit the same deployed runtime and dependencies users hit. Label local measurements as local only.

## Procedure

1. Identify the target environment and expected revision.
   - If the user did not name one, infer from branch: `main` means production; `develop` means staging/develop if the repo uses that split.
   - Get the expected short SHA with `git rev-parse --short HEAD`.
2. Check deploy status.
   - Prefer `gh run list --branch <branch> --limit 10` and `gh run view <run-id> --log-failed` for GitHub Actions.
   - For Workers, use the repo's documented `wrangler deployments list` or deployment script when available.
   - For Pages, use workflow status, deployment logs, or a curlable sentinel. A successful build-hook POST is not deploy proof.
3. Prove the served artifact.
   - Curl a sentinel header, `/version`, inline build metadata, sourcemap comment, or behavior that uniquely identifies the target commit.
   - If no sentinel exists, state that limitation and use the strongest available behavior probe. Add a follow-up task to create a sentinel.
4. Probe the changed behavior through the public URL.
   - Use real auth/session data only when needed and available.
   - Capture HTTP status, response headers, and one exact response/body fact that would fail on the previous build.
5. Report honestly.
   - Say "merged, deploy pending" when queues are behind.
   - Say "passes locally, prod proof pending" when production cannot be probed.
   - Reserve "live", "deployed", "validated", and "confirmed" for served-artifact proof.

## Output

```markdown
## Deploy Proof

Target: <environment URL>
Expected revision: <sha>
Served revision: <sha or unknown>

| Check | Result |
|---|---|
| Deploy workflow | PASS/FAIL/PENDING |
| Served artifact | PASS/FAIL/UNKNOWN |
| Behavior probe | PASS/FAIL |
| Cache/perf proof | PASS/FAIL/N/A |

Verdict: LIVE / MERGED BUT NOT LIVE / BLOCKED

Evidence:
- <command or URL> -> <key result>
- <command or URL> -> <key result>

Follow-ups:
- <only concrete gaps, such as adding a revision sentinel>
```

If the verdict is not `LIVE`, create or update the ops-board task with the exact retry command.
