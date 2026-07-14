---
name: hub-sdk-adoption
description: "Adopt @tangle-network/hub-sdk in any product that needs to talk to the Tangle hub (OAuth connections, tools/search/describe/invoke, capability tokens, policies). Use whenever a product imports @tangle-network/agent-integrations, maintains a local hub-client.ts, or hand-rolls fetch() to /v1/hub/*. Forces kill-and-replace, not additive code."
---

# Hub SDK Adoption

You are wiring a product (sandbox-api, sandbox-cli, intelligence-api, intelligence-web, tax-agent, legal-agent, gtm-agent, creative-agent, a sidecar, or a generated app) to talk to the Tangle hub. The substrate is `@tangle-network/hub-sdk`. This skill exists because the 2026-05-30 fan-out (PRs #1465 #1467 #1468 #1469 #1470 #1471 #1472) shipped **additive** code (new package exports, new scripts, new compose files) while skipping the **subtractive** kill-and-replace steps that were the whole point. Validation typechecked what existed and missed what should not have. The fix is to bake the deletion into the acceptance check, not the prose.

## When to invoke

- Any task that wires a product to the Tangle hub for OAuth connections, tool search, tool invocation, capability minting, or policy reads.
- Any PR description that says "migrate X off `@tangle-network/agent-integrations`" or "consolidate hub client".
- Any file matching `**/hub-client.ts`, `**/hub.ts`, `**/integrations-hub.ts`, `**/*hub*.ts` outside `packages/hub-sdk/`.
- Any `fetch("/v1/hub/...")` or `fetch(\`${...}/v1/hub/...\`)` in product code.
- Before opening a PR that claims hub-sdk adoption — run the validators in this skill against the PR's branch.

If none of those apply, you do not need this skill.

## Principle

```txt
product code
  -> @tangle-network/hub-sdk { HubClient, HubConnectionsClient, HubToolsClient,
                                HubPermissionsClient, HubTokensClient }
  -> HubClient.request -> ${TANGLE_HUB_URL}/v1/hub/*
  -> envelope { success, data } | { success: false, error }  (HubSdkError on !success)
```

Two invariants define "adopted":

1. **No product owns a hub wire format.** No local `HubConnection`, `HubTool`, `HubStatusResponse`, `HubExecResponse`, `HubPolicy` type. Import the type from `@tangle-network/hub-sdk`.
2. **No product owns a hub transport.** No `fetch("/v1/hub/...")`, no Hono proxy that hand-formats the JSON envelope, no `async function callHub(...)` wrapper. Call methods on `HubClient` / its sub-clients.

Adoption is a deletion event. If the diff is net-additive, the migration didn't happen — see the anti-pattern at the bottom.

## The 5-step kill-and-replace checklist

Every step has an empirical verifier. The skill is not complete until **every verifier returns the asserted result**. "I ran typecheck and it passed" is not evidence — typecheck cannot tell you that a file failed to delete.

### Step 1 — Drop competing deps

Remove every hub-shaped dependency that hub-sdk replaces. Today the known competitors are `@tangle-network/agent-integrations` (the published package the new SDK supersedes for product-side consumers) and any sibling `PlatformHubClient` wrapper that exists only because hub-sdk did not.

For the target product `<P>` (e.g. `products/sandbox/api`):

```bash
# (a) phantom or real agent-integrations dep
grep -c '"@tangle-network/agent-integrations"' <P>/package.json
# must print 0

# (b) actual src imports of the old package
grep -rln "@tangle-network/agent-integrations" --include="*.ts" --include="*.tsx" <P>/src
# must print nothing (empty)

# (c) PlatformHubClient sibling-repo wrapper, if your product was using it
grep -rln "PlatformHubClient\|from \"@tangle-network/agent-runtime/platform\"" --include="*.ts" <P>/src
# must print nothing — replaced by HubClient from hub-sdk
```

If any of these fail, you have not finished step 1. Do not move to step 2.

**Edge case:** `@tangle-network/agent-integrations/specs` is sometimes consumed purely for the static `listIntegrationSpecs` catalog (allowlist of provider IDs / display names). Hub-sdk does not yet replace the spec catalog. If the only remaining import is `from "@tangle-network/agent-integrations/specs"`, flag it in the PR description as a known carve-out and keep the dep — but every other import path must be gone.

### Step 2 — Add `@tangle-network/hub-sdk` to the product

```jsonc
// <P>/package.json
{
  "dependencies": {
    "@tangle-network/hub-sdk": "workspace:*"
  }
}
```

Then:

```bash
pnpm install
grep -c '"@tangle-network/hub-sdk"' <P>/package.json
# must print >= 1
grep -A2 "@tangle-network/hub-sdk" pnpm-lock.yaml | head -20
# must show <P> as an importer of hub-sdk, not just the package being declared
```

`workspace:*` is the only correct specifier — hub-sdk is in-tree at `packages/hub-sdk` and is not published yet. A literal version (`^0.2.0`) silently pins against npm and breaks when the workspace evolves.

### Step 3 — Replace hand-rolled fetches with `HubClient`

Find every direct hit on the hub HTTP surface and rewrite it through the SDK.

```bash
# In your product src, every match here is a TODO:
grep -rnE '(fetch|axios|request)\([^)]*v1/hub/' --include="*.ts" --include="*.tsx" <P>/src
# After migration: must print nothing
```

The standard replacement table:

| Hand-rolled call | Replace with |
|---|---|
| `fetch("/v1/hub/status")` | `await client.status()` |
| `fetch("/v1/hub/connections")` | `await client.connections.list()` |
| `fetch("/v1/hub/connections/:id", { method: "DELETE" })` | `await client.connections.revoke(id)` |
| `fetch("/v1/hub/tools/search", { method: "POST", body })` | `await client.tools.search(query, { provider })` |
| `fetch("/v1/hub/tools/describe", { method: "POST", body })` | `await client.tools.describe(path)` |
| `fetch("/v1/hub/exec", { method: "POST", body })` | `await client.tools.invoke(path, input, { connectionId })` — handles `HUB_APPROVAL_REQUIRED` capability-token mint transparently |
| `fetch("/v1/hub/tokens", { method: "POST" })` | `await client.tokens.mint({ actionPath, connectionId, provider, ttlSeconds })` |
| `fetch("/v1/hub/tokens")` GET | `await client.tokens.list({ includeExpired })` |
| `fetch("/v1/hub/tokens/:id", { method: "DELETE" })` | `await client.tokens.revoke(tokenId)` |
| `fetch("/v1/hub/policies?connectionId=...")` | `await client.permissions.list(connectionId)` |
| `fetch("/v1/hub/policies", { method: "PUT", body })` | `await client.permissions.set(input)` |
| `fetch("/v1/hub/oauth/start", ...)` | (still server-only — keep until SDK adds it; document the carve-out) |

Errors: every method throws `HubSdkError` on a `{ success: false, error }` envelope. Do **not** wrap in `try { ... } catch { return null }` — propagate. The error carries `code: HubErrorCode`, `status`, and a redacted `details`.

Verifier:

```bash
grep -rln "@tangle-network/hub-sdk" --include="*.ts" --include="*.tsx" <P>/src | wc -l
# must print >= 1
```

If the product also ships an ESLint or no-raw-fetch invariant (sandbox-cli does — `scripts/check-no-raw-fetch-to-hub.mjs`), run it now:

```bash
pnpm check:invariants
# must exit 0
```

### Step 4 — Replace local hub type duplications with SDK imports

The published hub-sdk exports the canonical type names. Search for every local declaration of those names and rewrite to imports.

```bash
# Local type duplication scan — every hit is a TODO:
grep -rnE "^(export )?(type|interface) (Hub(Status|Connection|ConnectionsResponse|ConnectionDeleteResponse|Tool|ToolSource|ToolsSearchResponse|ToolsDescribeResponse|Exec(Request|Response)|OAuthStart(Request|Response)|Policy|PolicyDecision|TokenMint(Request|Response)|TokensListResponse|TokenRevokeResponse|Principal|PrincipalKind|Envelope|ErrorBody|ErrorCode|ErrorEnvelope|CapabilityToken|AuditResponse))\b" \
  --include="*.ts" --include="*.tsx" <P>/src
# After migration: must print nothing
```

Replacement form:

```ts
import type {
  HubConnection,
  HubConnectionsResponse,
  HubExecResponse,
  HubPolicy,
  HubStatusResponse,
  HubTool,
  HubToolsSearchResponse,
} from "@tangle-network/hub-sdk";
```

Types and values are exported from the package root. Do not import from `@tangle-network/hub-sdk/types` or `/client` — the deep paths are an implementation detail.

### Step 5 — Delete the hand-rolled client file

This is the load-bearing deletion. Yesterday's failure was that the migration added new imports while leaving the old client file beside them, so both worked and both shipped.

```bash
# every product that had a local hub client — list expanded as new ones surface:
test ! -f products/sandbox/cli/src/lib/hub-client.ts
test ! -f products/sandbox/api/src/lib/hub-client.ts
test ! -f products/intelligence/api/src/lib/hub-client-local.ts
test ! -f apps/sidecar/src/integrations/hub-client-local.ts
# each must exit 0 (file does not exist)

# Catch-all for unknown local hub clients in the product subtree:
find <P>/src -name "hub-client*.ts" -not -path "*/node_modules/*"
# must print nothing

# And anyone still importing the deleted file:
grep -rln "from \".*lib/hub-client\"" --include="*.ts" --include="*.tsx" <P>
# must print nothing
```

If the file is gone but anything still references its path, your typecheck will catch it on the next run — but only if you actually run it. After step 5:

```bash
pnpm --filter <package-name> check-types
pnpm --filter <package-name> test
# both must exit 0
```

## Configuration pattern — `HubClient.fromEnv()` and fail-loud

Server-side (Node, Cloudflare Worker, sidecar):

```ts
import { HubClient } from "@tangle-network/hub-sdk";

const hubUrl = process.env.TANGLE_HUB_URL;
const apiKey = process.env.TANGLE_HUB_API_KEY;

if (!hubUrl) {
  throw new Error(
    "HUB_CONFIG_MISSING: TANGLE_HUB_URL is required. Set it to the hub base URL " +
      "(e.g. https://hub.tangle.tools). No fallback — fail-closed by design.",
  );
}

export const hub = new HubClient({
  baseUrl: hubUrl,
  apiKey, // optional — omit for session-bound use, pass for service-account use
});
```

For per-request auth (browser, multi-tenant API):

```ts
const hub = new HubClient({
  baseUrl: process.env.TANGLE_HUB_URL!,
  authHeaders: async () => ({
    Authorization: `Bearer ${await getSessionToken()}`,
  }),
});
```

Rules:

- `TANGLE_HUB_URL` is required. Missing → throw `HUB_CONFIG_MISSING` at construction time. **No default**. No silent `?? "https://hub.tangle.tools"`. The product is supposed to fail-closed when misconfigured (see `apps/sidecar/src/integrations/hub-client.ts` for the canonical pattern).
- Do not implement a `getHubBaseUrl()` helper that returns "" or "/" or "localhost" as a fallback. Sloppy fallbacks corrupt every signal downstream — see `~/.claude/CLAUDE.md` "No fallbacks. Fail loud."
- For on-prem / sovereign installs, `TANGLE_HUB_URL` points at the customer-owned hub. The product code does not change.
- `HubClient` is safe to construct as a module-level singleton; it carries no per-request state. Methods are async and concurrency-safe.

If a fresh export `HubClient.fromEnv()` lands later, use it. Until then, the snippet above is the contract — every product writes the same 8 lines.

## Adversarial validators (run before claiming done)

Before opening or merging the migration PR, run every one of these against the migration branch. The skill is not complete until each one returns the asserted result.

```bash
# 1. Competing deps gone, per product:
for P in products/sandbox/api products/sandbox/cli products/intelligence/api \
         products/intelligence/web apps/sidecar; do
  test -d "$P" || continue
  echo "=== $P ==="
  grep -c '"@tangle-network/agent-integrations"' "$P/package.json" 2>/dev/null || echo 0
done
# every line must be 0

# 2. hub-sdk dep present per migrated product:
for P in <list of migrated products>; do
  grep -c '"@tangle-network/hub-sdk"' "$P/package.json"
done
# every line must be >= 1

# 3. No hand-rolled fetches to the hub:
grep -rnE '(fetch|axios|request)\([^)]*v1/hub/' --include="*.ts" --include="*.tsx" \
  products apps 2>/dev/null | grep -v "node_modules" | grep -v "packages/hub-sdk"
# must print nothing

# 4. No local hub type duplications outside the SDK:
grep -rnE "^(export )?(type|interface) Hub(Status|Connection|Tool|Exec|Policy|Token|Principal|Envelope|ErrorBody)" \
  --include="*.ts" products apps 2>/dev/null | grep -v "packages/hub-sdk"
# must print nothing

# 5. No leftover local hub-client.ts files outside the SDK:
find products apps -name "hub-client*.ts" -not -path "*/node_modules/*" \
  -not -path "*/packages/hub-sdk/*"
# must print nothing

# 6. Real adoption: every migrated product imports the SDK at least once:
for P in <list of migrated products>; do
  count=$(grep -rln "@tangle-network/hub-sdk" --include="*.ts" --include="*.tsx" "$P/src" | wc -l)
  echo "$P: $count files import hub-sdk"
done
# every count must be >= 1

# 7. The repo invariant script (if present):
test -f scripts/check-no-raw-fetch-to-hub.mjs && node scripts/check-no-raw-fetch-to-hub.mjs
# must exit 0

# 8. Typecheck and tests pass for every migrated package:
pnpm -r --filter "...[origin/develop]" check-types
pnpm -r --filter "...[origin/develop]" test
# both must exit 0
```

**Re-baseline against `origin/develop` first.** Survey B caught yesterday's check running against a stale local working tree 8 commits behind develop, leading to a false "didn't migrate" verdict for sandbox-cli and the sandbox-api phantom dep. Either `git fetch origin && git checkout origin/develop` or qualify every grep with `git show origin/develop:<path>`. A migration claim grounded in a stale tree is worthless — and dispatching subagents to "redo" already-shipped work is worse than worthless.

## Per-product applicability matrix

Not every product on a target list is a real migration candidate. Verify the product **exists on develop** and **has hub-shaped code** before opening a PR.

| Product | On develop? | Has hub-shaped code? | Action |
|---|---|---|---|
| `products/sandbox/api` | yes | phantom dep only; full bespoke integrations product is OUT OF SCOPE | drop dep; do not migrate `routes/integrations.ts` |
| `products/sandbox/cli` | yes | yes — `commands/hub.ts` + `lib/hub-client.ts` | full 5-step |
| `products/sandbox/web` | yes | no — talks to sandbox-api's bespoke `/v1/integrations`, not the hub | OUT OF SCOPE |
| `products/intelligence/api` | yes | yes — `lib/hub-client.ts` wrapper, GitHub App glue | full 5-step (already done on develop per #1469) |
| `products/intelligence/web` | yes | no — no hub / oauth / integrations files | OUT OF SCOPE until a concrete capability lands |
| `apps/sidecar` | yes | yes — `integrations/hub-client.ts` + `hub-mcp-resolver.ts` | full 5-step (done on develop per #1468) |
| `tax-agent` (sibling repo) | sibling | yes — `routes/integrations.hub.ts` on `PlatformHubClient` | cross-repo PR; requires hub-sdk parity check |
| `legal-agent` (sibling repo) | sibling | yes — `lib/.server/integrations-hub.ts` on `PlatformHubClient` | cross-repo PR |
| `creative-agent` (sibling repo) | sibling | yes — `lib/.server/integrations-hub.ts` on `PlatformHubClient` | cross-repo PR |
| `gtm-agent` (sibling repo) | sibling | yes, but uses `agent-integrations` directly, not PlatformHubClient | distinct migration; deeper than the other three |

Sibling-repo migrations (tax / legal / creative / gtm) require the canonical-client decision: is `HubClient` the substrate, or is `PlatformHubClient` the substrate that `HubClient` wraps? Do not ship a third competing client. If the answer is unresolved, stop and ask.

## Anti-pattern: shipping additive code without deletions

This is what hit us on 2026-05-30 and the reason this skill exists.

| Symptom (the yesterday failure) | Why it happened | Fix |
|---|---|---|
| New `packages/hub-sdk/src/{client,types,redaction,index}.ts` shipped clean, but `products/sandbox/cli/src/lib/hub-client.ts` still 382 lines next to it | Validation phase ran `pnpm check-types`. Typecheck cannot assert "this file must not exist." | Validation must include `test ! -f <old-path>` and `grep -c "<old-import>" | wc -l` returning 0. Bake the deletion into the gate, not the prose. |
| `products/sandbox/api/package.json` still lists `"@tangle-network/agent-integrations": "^0.29.0"` with zero imports — a pure phantom dep that the PR title claimed was removed | The PR was "additive": added `@tangle-network/hub-sdk` to other products, never touched sandbox-api's `package.json`. | Step 1 verifier (`grep -c` returns 0) must run **against the product the PR claims to migrate**, not "somewhere in the repo." |
| PR description says "migrate X to hub-sdk", but `grep -rln "@tangle-network/hub-sdk" products/X` returns 0 | The migration script was written, the deletions were not. | Step 3 verifier (`grep -rln` returns >= 1) as a CI check, not a manual one. |
| Net-additive diff stat (`+1200 / -0`) on a migration PR | The migration was framed as "add the SDK"; the kill-step was deferred to "follow-on cleanup" that never came. | A migration PR's diff stat is part of the verdict. If the diff is net-positive, the migration didn't happen. Hold the PR until the deletion lands in the same change. |
| Validation phase reported green | Typecheck + tests pass on the additive code in isolation. The redundant local client is also fine in isolation. They cannot detect duplication. | Adversarial validators above run as part of the migration PR's CI, not as an afterthought. |

The doctrine, lifted from the workspace CLAUDE.md: **"Net-additive cleanup is a failure."** A cleanup PR's diff stat is part of the verdict; use the existing helpers that *collapse* the thing you'd otherwise comment.

## Review red flags

Reject a PR claiming hub-sdk adoption if any are true:

- Diff stat is net-additive on a migration PR.
- `grep -rln "@tangle-network/hub-sdk" products/<P>` returns 0 after the PR.
- A `hub-client.ts`, `hub-client-local.ts`, or `integrations-hub.ts` file the PR claimed to delete is still in the tree.
- A `package.json` the PR claimed to clean still has `@tangle-network/agent-integrations` in `dependencies` with no compensating spec carve-out.
- Local type duplications (`HubConnection`, `HubTool`, etc.) re-declared in product code; the PR added imports without removing the local types.
- Validation section of the PR description is "typecheck + tests pass" with no `grep`/`test -f` evidence.
- A new product surface (config helper, transport wrapper, retry middleware) sits between product code and `HubClient`. Hub-sdk already handles auth headers, capability-token mint on `HUB_APPROVAL_REQUIRED`, and `HubSdkError` propagation. Wrapping it is a re-implementation in disguise.
- Sibling-repo PR migrates off `PlatformHubClient` without resolving the canonical-client question and without parity tests against the three existing PlatformHubClient consumers.

## Canonical references

- `packages/hub-sdk/src/index.ts` — full export surface (HubClient + sub-clients + every Hub* type).
- `packages/hub-sdk/src/client.ts` — `HubClient` implementation, envelope handling, `HUB_APPROVAL_REQUIRED` auto-mint flow.
- `packages/hub-sdk/src/types.ts` — wire types (the canonical home; do not duplicate).
- `apps/sidecar/src/integrations/hub-client.ts` — canonical `fromEnv`-style fail-loud pattern (`HUB_CONFIG_MISSING`).
- `apps/sidecar/src/integrations/hub-mcp-resolver.ts` — canonical example of resolving InlineProfile `connections` against the hub at session-spawn.
- `products/sandbox/cli/src/commands/hub.ts` — canonical CLI consumer; imports `HubClient`, `HubConnection`, `HubOAuthStartResponse`, `HubPolicy`, `HubPolicyDecision`, `HubStatusResponse`, `HubTool`, `HubToolSource`.
- `products/intelligence/api/src/lib/hub-client.ts` — canonical server wrapper paired with `resolveServiceTangleCredential`.
- `scripts/check-no-raw-fetch-to-hub.mjs` — repo invariant that rejects raw `fetch("/v1/hub/...")` outside the SDK.

## Rules

1. Re-baseline against `origin/develop` before the first grep. A claim grounded in a stale tree is worse than no claim.
2. Run the per-step verifier inline. Do not batch them at the end — a failed step 1 means steps 2-5 are wasted work.
3. Net-additive diffs are migration failures, no matter what typecheck says.
4. `HubClient.fromEnv`-style construction fails loud on missing `TANGLE_HUB_URL`. No defaults, no `??`, no try/catch swallow.
5. Do not add a fourth competing hub client. If the choice between `HubClient`, `PlatformHubClient`, and `agent-integrations` is unresolved, stop and ask before shipping a wrapper.
6. Append one line to `.evolve/skill-runs.jsonl` on completion with the per-product verifier counts — that is the durable record `/reflect` reads to grade this skill against the next batch.

Next: open the migration PR with the verifier output (grep counts + `test -f` exit codes) pasted into the PR description. If any verifier fails, fix the deletion and re-run before requesting review.
