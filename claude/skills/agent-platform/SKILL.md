---
name: agent-platform
description: "Build a Tangle Agent Platform — a multi-tenant SaaS where users create AI agents in customizable sandboxed workspaces, train them over time, and flip a switch to monetize them as paid API endpoints. Other users buy API keys for that specific agent. Tangle takes a revenue share. Use when the user describes building an agent marketplace, multi-tenant agent platform, agent monetization, or 'users build their own agents and sell access'."
---

# Tangle Agent Platform

A reusable pattern for building multi-tenant AI agent platforms where:
- **Owners** create agents in personal workspaces with sandboxed sidecars
- **Owners** customize their agent's tools, prompts, vault, and capabilities over time
- **Owners** flip a switch to monetize → their agent becomes a paid API endpoint
- **Consumers** buy API keys to chat with someone else's trained agent
- **The platform** (Tangle) takes a revenue cut via on-chain settlement

## Core Architecture: The Sandbox IS the Agent

The fundamental insight: **the sandbox already runs the agent.** You don't need to extract or freeze it. You add a thin proxy layer in front that handles payment + security:

```
                 CONSUMER
        ┌────────────────────────┐
        │ Claude Desktop, Cursor │  ← MCP client
        │ OR                     │
        │ HTTP client w/ x402    │  ← Direct API
        └────────────┬───────────┘
                     │
                     │ POST /v1/agents/:slug/chat/completions
                     │ X-Payment-Signature: <EIP-712 SpendAuth>
                     │ (or Authorization: Bearer sk_agent_...)
                     ▼
        ┌────────────────────────────────────┐
        │  AGENT GATEWAY (proxy)             │
        │                                    │
        │  1. Resolve agent slug             │
        │  2. Verify x402 sig OR API key    │
        │  3. Apply prompt filter            │
        │     - strip private vault refs    │
        │     - block prompt injection      │
        │     - cap message length          │
        │  4. Forward to owner's sandbox    │
        │  5. Stream OpenAI-compatible      │
        │  6. Count tokens                   │
        │  7. Settle on-chain (x402) OR     │
        │     deduct credits (API key)       │
        │  8. Record usage → owner balance  │
        └────────────┬───────────────────────┘
                     │
                     │ streamSandboxPrompt(box, msg, {...})
                     ▼
        ┌────────────────────────────────────┐
        │  OWNER'S SANDBOX SIDECAR           │
        │  (the trained agent — unchanged)   │
        │                                    │
        │  - Same system prompt the owner   │
        │    uses themselves                 │
        │  - Same tools they customized     │
        │  - Same vault knowledge           │
        │  - LLM via tcloud                  │
        └────────────────────────────────────┘
```

**Why this is elegant:**
- No snapshot mechanism needed — owner keeps training, consumers get the live agent
- The sandbox already exists; the proxy is ~250 LOC
- Two interface protocols, same backend: OpenAI HTTP + MCP server
- Two payment models, same auth surface: x402 (on-chain) + API keys (Stripe)

## Working Reference Implementation

A minimal working proxy exists in `~/code/film-agent/src/routes/v1.agents.$slug.chat.completions.ts`. It demonstrates:

- `GET /v1/agents/:slug/chat/completions` — discovery (returns metadata + accepted payment methods, no auth)
- `POST` without payment → `HTTP 402` with full payment instructions (x402 + API key options)
- `POST` with `Authorization: Bearer sk_agent_...` → API key auth path
- `POST` with `X-Payment-Signature: {commitment, signature, ...}` → x402 path
- Both paths apply prompt filtering, forward to `streamSandboxPrompt(box, ...)`, return SSE in OpenAI format

### x402 Verification (already exists in tangle-router)

`~/code/tangle-router/lib/shielded/verify.ts` — `verifySpendAuthSignature()` recovers EIP-712 signer from a SpendAuth payload. The full flow (`~/code/tangle-router/app/api/chat/route.ts:201-292`):

1. Read `X-Payment-Signature` header (JSON)
2. Field validation (operator, expiry, amount > 0)
3. EIP-712 signature recovery via viem
4. Nonce replay check (Redis-backed)
5. Per-commitment rate limit (120 req/min)
6. Call `ShieldedCredits.authorizeSpend()` on-chain
7. Serve inference
8. Call `ShieldedCredits.claimPayment()` post-response

The agent gateway can import this verification module directly — no need to rebuild it.

### x402 Domain (already on-chain)

- Chain: Tangle (testnet 3799, mainnet 5845)
- Contract: `ShieldedCredits` (address in `SHIELDED_CREDITS_ADDRESS` env)
- Anonymous funding via VAnchor pool — no KYC, no email
- Consumer flow: generate ephemeral wallet → fund commitment → sign SpendAuth per request

### MCP Server Wrapper (the second protocol)

Same proxy can be exposed as an MCP server. Each MCP `tools/call` becomes an x402-protected request to the agent. The MCP server advertises one tool per agent:

```typescript
// mcp-server/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = new Server({ name: 'tangle-agent-marketplace', version: '0.1.0' })

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: await fetchPublishedAgents().then(agents =>
    agents.map(a => ({
      name: a.slug,
      description: a.description,
      inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
    }))
  ),
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const slug = req.params.name
  const message = req.params.arguments.message
  // Sign x402 + forward to gateway
  const sig = signSpendAuth({ /* ... */ })
  const res = await fetch(`https://gateway.tangle.tools/v1/agents/${slug}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Signature': JSON.stringify(sig),
    },
    body: JSON.stringify({ messages: [{ role: 'user', content: message }] }),
  })
  // Stream → collect → return
  return { content: [{ type: 'text', text: await res.text() }] }
})

await server.connect(new StdioServerTransport())
```

Claude Desktop / Cursor add this MCP server once → all published agents become callable tools, with payments handled transparently by the MCP wrapper.

## The Three Surfaces

Every Tangle agent app has three distinct surfaces:

```
┌──────────────────────────────────────────────────────────────┐
│  1. OWNER SURFACE (workspace)                                │
│  Where owners build, train, and customize their agent        │
│  - Chat UI for trial runs                                    │
│  - Vault for knowledge/files                                 │
│  - Tool registry (add/remove/customize)                      │
│  - Prompt customization                                      │
│  - Approval queue (training feedback)                        │
│  - Settings: "Publish as API" toggle                         │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ (publish)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  2. CONSUMER SURFACE (paid API)                              │
│  Where consumers pay to use someone else's trained agent     │
│  - OpenAI-compatible /v1/chat/completions endpoint           │
│  - Per-agent API keys (sk_agent_<owner>_<agent>_<random>)    │
│  - Filtered prompt gate (consumers can't access owner's      │
│    private vault data — only what owner exposes)             │
│  - Per-token billing → Stripe → owner gets %, Tangle gets %  │
│  - Rate limits per consumer key                              │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ (settlement)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  3. ADMIN SURFACE (platform)                                 │
│  Platform-level operations                                   │
│  - Marketplace listing (discoverable agents)                 │
│  - Revenue dashboards (per-agent earnings)                   │
│  - Payout system (Stripe Connect → owner bank accounts)      │
│  - Content moderation                                        │
│  - Abuse detection                                           │
└──────────────────────────────────────────────────────────────┘
```

## The Database Model

Beyond the standard agent app schema, you need:

```typescript
// Published agents (owner flips switch)
export const publishedAgents = sqliteTable('published_agent', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  ownerId: text('owner_id').notNull().references(() => users.id),
  slug: text('slug').notNull().unique(),       // "neo-noir-director"
  displayName: text('display_name').notNull(),
  description: text('description'),
  systemPromptSnapshot: text('system_prompt'), // frozen at publish time
  toolsSnapshot: text('tools', { mode: 'json' }), // frozen tools
  vaultExposureRules: text('exposure_rules', { mode: 'json' }), // what consumers can read
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  // Pricing
  pricePerToken: real('price_per_token').default(0.00002),  // owner sets
  platformFeePercent: real('platform_fee_pct').default(0.20), // Tangle's cut
})

// Consumer API keys (issued by owners)
export const agentApiKeys = sqliteTable('agent_api_key', {
  id: text('id').primaryKey(),
  publishedAgentId: text('agent_id').notNull().references(() => publishedAgents.id),
  consumerId: text('consumer_id').references(() => users.id), // null = anonymous
  keyHash: text('key_hash').notNull(),         // hash of the actual key
  keyPrefix: text('key_prefix').notNull(),     // sk_agent_xxx (visible)
  spendingLimitCents: integer('spending_limit_cents'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
})

// Usage events (for billing)
export const agentUsage = sqliteTable('agent_usage', {
  id: text('id').primaryKey(),
  apiKeyId: text('api_key_id').references(() => agentApiKeys.id),
  publishedAgentId: text('agent_id').references(() => publishedAgents.id),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costCents: integer('cost_cents'),            // total cost
  ownerEarnedCents: integer('owner_earned_cents'),
  platformFeeCents: integer('platform_fee_cents'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

// Owner payout balances
export const ownerBalances = sqliteTable('owner_balance', {
  ownerId: text('owner_id').primaryKey().references(() => users.id),
  pendingCents: integer('pending_cents').default(0),
  paidOutCents: integer('paid_out_cents').default(0),
  stripeConnectAccountId: text('stripe_connect_account_id'),
})
```

## The Routes

### Owner-facing (existing pattern + new)
- `/app/:workspaceId/*` — All existing workspace pages
- `/app/:workspaceId/publish` — **NEW** — Publish wizard, set pricing, exposure rules
- `/app/:workspaceId/marketplace` — **NEW** — View their agent's marketplace listing
- `/app/:workspaceId/earnings` — **NEW** — Revenue dashboard
- `/app/:workspaceId/api-keys` — **NEW** — Manage consumer API keys

### Consumer-facing (new public surface)
- `/marketplace` — Browse all published agents
- `/agents/:slug` — Public landing page for an agent
- `/agents/:slug/playground` — Try the agent (anonymous, rate-limited)
- `/agents/:slug/api-keys` — Buy/manage API keys for this agent

### Public API (consumer surface)
- `POST /v1/agents/:slug/chat/completions` — OpenAI-compatible chat
- `POST /v1/agents/:slug/messages` — Anthropic-compatible
- `GET /v1/agents/:slug/info` — Agent metadata, pricing
- All authenticated with `Authorization: Bearer sk_agent_...`

## The Filtered Prompt Gate

When a consumer chats with a published agent, you must:

1. **Strip private vault references** — owner's vault is theirs, consumers only see what's been explicitly exposed via `vaultExposureRules`
2. **Block prompt injection attempts** — consumers can't override the system prompt
3. **Enforce rate limits per consumer key**
4. **Inject consumer context** — but never owner's personal data
5. **Track tokens for billing**

```typescript
// src/lib/.server/published-agent.ts
export async function executePublishedAgentRequest(params: {
  agentSlug: string
  consumerKey: string
  messages: ChatMessage[]
}) {
  // 1. Resolve agent + verify key
  const agent = await getPublishedAgent(params.agentSlug)
  const key = await verifyAgentApiKey(agent.id, params.consumerKey)
  if (!key) throw new Error('Invalid API key')

  // 2. Apply filtered prompt gate
  const filteredMessages = filterConsumerMessages(params.messages, agent.exposureRules)

  // 3. Use FROZEN system prompt (not owner's current — what they published)
  const systemPrompt = agent.systemPromptSnapshot

  // 4. Use FROZEN tools (not owner's current)
  const tools = agent.toolsSnapshot

  // 5. Stream from sandbox with these locked params
  const stream = streamSandboxPrompt(box, filteredMessages, {
    systemPrompt,
    tools,
    sessionId: `consumer:${key.id}`,  // separate session from owner
  })

  // 6. Track usage for billing
  let inputTokens = 0, outputTokens = 0
  for await (const event of stream) {
    // count tokens
  }

  // 7. Atomic billing
  await recordUsage({
    apiKeyId: key.id,
    publishedAgentId: agent.id,
    inputTokens,
    outputTokens,
    pricePerToken: agent.pricePerToken,
    platformFeePercent: agent.platformFeePercent,
  })
}
```

## Revenue Settlement

Two models supported:

### Model A: Stripe Connect (off-chain)
- Owners onboard with Stripe Connect Express
- Platform charges consumer's card on usage
- Stripe automatically splits: owner gets X%, platform gets Y%
- Payouts to owner bank account weekly

### Model B: Tangle on-chain (decentralized)
- Owners register their agent as a Tangle Blueprint operator
- Consumers pay via on-chain credits (USDC, ETH, TNT)
- Operator (= owner) settles payouts via smart contract
- Platform takes cut via fee accrual to platform address
- No KYC, no bank accounts, fully permissionless

Implementation: use **tcloud's shielded mode** with `ProductTokenIssuer` for token issuance, plus a settlement contract on Tangle.

## Build Sequence

### Phase 0: Start with `/agent-factory`
Build the base agent app first using the existing `/agent-factory` skill. This produces the owner surface.

### Phase 1: Add publish flow (1 hour)
1. Add `publishedAgents` table to schema
2. Create `/app/:workspaceId/publish` UI — publish wizard with pricing, exposure rules
3. Create snapshot mechanism — freezes current system prompt + tools
4. Create `agentApiKeys` table + key generation utility

### Phase 2: Build consumer API (2 hours)
1. Create `routes/v1/agents/[slug]/chat/completions.ts` — OpenAI-compatible
2. Implement filtered prompt gate (`src/lib/.server/published-agent.ts`)
3. Implement key verification + rate limiting per key
4. Wire token tracking + cost calculation

### Phase 3: Build marketplace (2 hours)
1. `/marketplace` — public listing page (no auth required)
2. `/agents/:slug` — agent landing page with description, pricing, sample prompts
3. `/agents/:slug/playground` — anonymous trial (rate-limited, capped tokens)
4. `/agents/:slug/api-keys` — purchase + manage keys (Stripe checkout)

### Phase 4: Revenue + payouts (3 hours)
1. `agentUsage` + `ownerBalances` tables
2. Stripe Connect Express onboarding flow
3. Webhook handlers for payment events
4. Owner earnings dashboard
5. Payout schedule (weekly cron)

### Phase 5: Tangle on-chain (optional, 4 hours)
1. Register agent as Tangle Blueprint operator
2. Use tcloud shielded mode for anonymous consumer payments
3. Settlement contract for revenue distribution
4. Marketplace shows both Stripe and on-chain pricing

## The Key Insight

The platform's core value: **owners build something once, then earn passively**. The agent they trained is their work product. When they're done customizing it, they flip a switch and it becomes an asset that generates revenue.

This turns "building an AI agent" from "I have to keep using it myself" into "I built a useful thing other people can rent."

Examples:
- A film director builds a "neo-noir cinematography assistant" → other directors pay $0.10/conversation to ask it for shot advice
- A tax expert builds an "S-corp filing helper" → small businesses pay $5 to file their forms
- A grant writer builds a "NIH grant editor" → researchers pay $10 to refine their proposals

The platform takes 20% (or whatever the spirit moves), the owner keeps 80%. Tangle network handles compute + settlement.

## What `/agent-factory` Already Gives You

- ✅ Multi-tenant workspaces with RBAC (owner/admin/member/viewer)
- ✅ Per-workspace sandbox sidecars (the agent's "body")
- ✅ Vault for owner's private knowledge
- ✅ Tool registry (customizable per workspace)
- ✅ Approval queue (training feedback loop)
- ✅ Stripe billing + credit ledger
- ✅ tcloud integration (LLM, image, video, voice)

## What `/agent-platform` Adds

- 🆕 Publish flow (snapshot, freeze, expose)
- 🆕 Consumer API surface (`/v1/agents/:slug/...`)
- 🆕 Per-agent API keys + rate limits
- 🆕 Filtered prompt gate (security boundary)
- 🆕 Marketplace UI (browse, discover)
- 🆕 Revenue tracking + payouts (Stripe Connect or on-chain)
- 🆕 Owner earnings dashboard

## Anti-Patterns

- ❌ Don't expose owner's vault to consumers — use exposure rules
- ❌ Don't let consumers override the system prompt — use snapshot
- ❌ Don't share sessions between owner and consumers — separate by `sessionId`
- ❌ Don't trust consumer-provided tool definitions — use snapshot
- ❌ Don't bill for failed requests — only successful completions
- ❌ Don't allow free abuse — enforce rate limits + spending caps per key
- ❌ Don't pay out unverified earnings — Stripe Connect requires KYC

## Skill Composition

After running `/agent-platform`:
- Run `/agent-factory` first if you don't have a base agent
- Run `/verify` to confirm all 5 phases work
- Run `/evolve` targeting "consumer can sign up → buy key → make request → owner sees revenue"
- Run `/handoff` to document the platform-specific patterns

## References

Existing code that demonstrates these patterns:
- `~/code/film-agent` — Owner surface (workspace, vault, tools, tcloud)
- `~/code/tangle-router` — Consumer API surface (`/v1/chat/completions`, API keys, rate limiting, billing)
- `~/code/agent-dev-container/products/sandbox/sdk/src/auth/index.ts` — `ProductTokenIssuer` for scoped tokens
