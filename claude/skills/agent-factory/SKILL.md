---
name: agent-factory
description: "Build a production-ready sandboxed AI agent application for any domain. Scaffolds the full Tangle stack (Cloudflare Workers + Remix + D1 + sandbox SDK + tcloud + sandbox-ui), wires chat/vault/tools/billing/auth, creates domain-specific tools and prompts, deploys infrastructure, builds eval harness, and runs real generations. Use when the user says 'build an agent for X', 'create a new agent app', 'scaffold an agent', 'new sandbox agent', or describes a domain they want an AI agent for."
---

# Agent Factory

Build a complete, production-ready sandboxed AI agent application for any user-specified domain — from zero to deployed with real generations, eval infrastructure, and full test coverage.

## What This Produces

A self-contained agent workspace where domain professionals chat with an AI partner that:
- Adapts to their role and learns their preferences over time
- Generates domain-relevant content (text, images, audio, video) via tcloud
- Manages structured work (tasks, calendar, approvals, assets)
- Stores all knowledge in a vault (KV-backed file system)
- Runs domain-specific tools inside a sandbox
- Tracks costs via credit ledger + Stripe billing

## Prerequisites

Verify before starting:
```bash
# Required repos (relative to ~/code/)
ls ~/code/agent-dev-container/products/sandbox/sdk/package.json  # Sandbox SDK
ls ~/code/tcloud/packages/tcloud/package.json                    # tcloud SDK
ls ~/code/sandbox-ui/package.json                                # UI components
ls ~/code/tangle-router                                          # AI gateway

# Required tools
which pnpm wrangler modal railway gh
```

If any dependency is missing, tell the user what to clone/install before proceeding.

## Inputs

Ask the user for:
1. **Domain** — What industry/profession? (e.g., "architecture", "music production", "journalism")
2. **Agent name** — Short slug (e.g., `arch-agent`, `music-agent`)
3. **User roles** — Who uses this? (e.g., "architect, interior designer, structural engineer")
4. **Key capabilities** — What should the agent help with? (3-5 bullet points)
5. **Tool ideas** — Domain-specific tools the agent should have (e.g., "floor-plan parser", "load calculator")

Do NOT ask about tech stack — it's always the Tangle stack. Do NOT ask about auth, billing, or deployment — those are standardized.

## Architecture (Always the Same)

```
Cloudflare Workers + D1 + KV + Durable Objects
├── Remix (React Router v7)              Web UI
├── BetterAuth                           Email/password auth
├── @tangle-network/sandbox SDK          Agent execution + file I/O
├── @tangle-network/tcloud               Creative studio (LLM, image, video, voice, transcribe)
├── Hocuspocus + Yjs                     Collaborative vault editing
├── @tangle-network/sandbox-ui           Shared component library
├── Stripe                               Billing + credit ledger
└── Domain tools                         Custom per domain
```

```
Chat pipeline (src/lib/.server/chat/):
├── build-prompt.ts      — System prompt + role adaptation + confidence scoring
├── stream-normalizer.ts — NDJSON event normalization
├── post-process.ts      — Block extraction (:::task, :::event, :::proposal, :::asset, :::generation)
└── session-broadcast.ts — Durable Object fanout
```

## Build Sequence

Execute phases sequentially. Within each phase, parallelize independent work.

### Phase 0: Plan (5 min)

1. Create project directory at `~/code/{agent-name}`
2. Write SPEC.md with domain context, user roles, capabilities, tool descriptions
3. Write CLAUDE.md with architecture, key files, testing commands, principles

Reference existing agents for patterns:
- `~/code/film-agent/CLAUDE.md` — most complete reference
- `~/code/gtm-agent/CLAUDE.md` — GTM-specific patterns
- `~/code/legal-agent/CLAUDE.md` — compliance-heavy patterns

### Phase 1: Scaffold (15 min)

**Run in parallel:**

A. **Project init:**
```bash
pnpm create react-router@latest {agent-name} --template cloudflare
cd {agent-name}
pnpm add @tangle-network/sandbox@file:../agent-dev-container/products/sandbox/sdk
pnpm add @tangle-network/sandbox-ui@file:../sandbox-ui
pnpm add @tangle-network/tcloud@file:../tcloud/packages/tcloud
pnpm add better-auth drizzle-orm sonner lucide-react
pnpm add -D drizzle-kit @cloudflare/workers-types vitest @playwright/test tsx dotenv
pnpm add @hello-pangea/dnd @tiptap/core @tiptap/react @tiptap/starter-kit
```

B. **wrangler.toml** — Copy from film-agent, update name, create D1 + KV:
```bash
CLOUDFLARE_API_TOKEN=$(cat ~/company/agent-state/secrets/cloudflare-api-token) \
  wrangler d1 create {agent-name}-db
CLOUDFLARE_API_TOKEN=$(cat ~/company/agent-state/secrets/cloudflare-api-token) \
  wrangler kv namespace create VAULT_KV
```

C. **server.ts** — Worker entry with SessionStreamDO Durable Object

### Phase 2: Database + Auth + RBAC (15 min)

**Sequential — each depends on previous:**

1. **Schema** (`src/lib/.server/db/schema.ts`):
   - Auth tables: users, sessions, accounts, verifications (BetterAuth standard, camelCase)
   - Workspace tables: workspaces (type: personal/company/project/department), workspaceMembers (RBAC: owner/admin/member/viewer)
   - Chat tables: threads, messages
   - Domain tables: tasks, events, assets, proposedActions, generations
   - Billing: creditLedger, analyticsEvents
   - **Add domain-specific tables** based on user's requirements

2. **Auth** (`src/lib/.server/auth.ts`, `auth-utils.ts`):
   - BetterAuth config with D1 adapter
   - requireUser() helper
   - Session middleware

3. **RBAC** (`src/lib/.server/workspace-access.ts`):
   - requireWorkspaceAccess(workspaceId, userId, minRole)
   - Permission hierarchy: owner(3) > admin(2) > member(1) > viewer(0)
   - getWorkspaceMember(), listUserWorkspaces()

### Phase 3: Chat Pipeline (20 min)

Copy the 4-file pattern from film-agent, customize for domain:

1. **build-prompt.ts** — System prompt assembly:
   - Base directive (domain-specific personality and expertise)
   - Workspace context injection (config, stage, format)
   - Role adaptation (different context per user role)
   - Approval confidence history
   - Recent rejection injection
   - Learned style rules from vault
   - Available tools documentation
   - tcloud capabilities documentation

2. **stream-normalizer.ts** — Copy verbatim from film-agent (domain-agnostic)

3. **post-process.ts** — Block extraction:
   - `:::proposal` → proposedActions table
   - `:::task` → tasks table
   - `:::event` → events table
   - `:::asset` → assets table
   - `:::generation` → generations table
   - `:::config` → workspace config update
   - Auto-journal after 4+ messages
   - Credit deduction (atomic INSERT...SELECT)

4. **session-broadcast.ts** — Copy verbatim (domain-agnostic)

### Phase 4: Sandbox + Domain Tools (20 min)

**Run in parallel:**

A. **Sandbox service** (`src/lib/.server/sandbox/index.ts`):
   - ensureWorkspaceSandbox() — per-workspace sandbox provisioning
   - streamSandboxPrompt() — streaming agent prompt
   - runSandboxPrompt() — blocking prompt (for crons)
   - Pass TCLOUD_API_KEY + TCLOUD_BASE_URL to sandbox env

B. **Domain tools** (`src/lib/.server/sandbox/tools.ts`):
   - Create 5-8 domain-specific CLI tools as inline scripts
   - Mount at `/usr/local/bin/{domain}-{tool-name}`
   - Each tool: reads stdin/args → processes → outputs JSON/text
   - Examples from film-agent: parse-script, breakdown, schedule, budget

C. **tcloud client** (`src/lib/.server/tcloud.ts`):
   - Singleton pattern with spending limits
   - baseURL from TCLOUD_BASE_URL env (default: router.tangle.tools)

D. **Vault service** (`src/lib/.server/vault.ts`):
   - KV-backed file storage with path validation
   - Read/write/delete/list operations
   - Frontmatter parsing
   - Scaffold template with 20-30 domain-relevant vault files

### Phase 5: API Routes (15 min)

Create all API routes (action + loader pattern):

**Run in parallel — all independent:**
- `api.chat.ts` — Streaming chat (POST with ReadableStream)
- `api.workspaces.ts` — CRUD
- `api.tasks.ts` — CRUD with filtering
- `api.events.ts` — CRUD with date range
- `api.approvals.ts` — List + approve/reject
- `api.vault.ts` — Tree listing + file CRUD
- `api.generations.ts` — Query generations
- `api.generate.ts` — Direct tcloud generation (image/video/speech/transcription)
- `api.members.ts` — Invite/remove/update roles
- `api.threads.ts` — CRUD
- `api.auth.$.ts` — BetterAuth catch-all

Register all in `src/routes.ts`.

### Phase 6: UI Routes (25 min)

Build all UI shells using sandbox-ui components:

**Run in parallel — all independent:**

1. **Root + App shell** — TopBar, workspace selector, auth redirect
2. **Workspace layout** — Left sidebar nav (Chat, Studio, Tasks, Calendar, Inbox, Vault, Settings) with badge counts
3. **Chat** — Thread list sidebar, streaming messages (ChatMessage, ChatInput, ThinkingIndicator), auto-scroll, abort
4. **Studio** — Generation gallery with filter tabs, detail modal, relative time, "Open in Vault" links
5. **Tasks** — Drag-drop kanban (@hello-pangea/dnd), create/edit/delete dialogs, priority badges, due dates
6. **Calendar** — Month grid with event dots, day detail panel, prev/next navigation, month/list toggle, create/edit/delete
7. **Inbox** — Confidence stats cards, pending proposals with approve/reject, rejection reason textarea, resolved history
8. **Vault** — File tree sidebar with search, file viewer with frontmatter parsing, edit mode, create/delete files
9. **Settings** — General config, domain-specific fields, member management, danger zone

**Component imports from sandbox-ui:**
```tsx
import { Button, Card, CardContent, Badge, Input, Label, Textarea,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  EmptyState, Skeleton, Tabs, TabsList, TabsTrigger,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@tangle-network/sandbox-ui'
import { ChatMessage, ChatInput, ThinkingIndicator } from '@tangle-network/sandbox-ui/chat'
```

### Phase 7: Feedback Loops (10 min)

Create 4 feedback modules in `src/lib/.server/feedback/`:

1. **learn-style.ts** — Rejection patterns → persistent style rules in vault
2. **measure.ts** — Generation approval rates → scorecard per asset type
3. **retrospective.ts** — Full workspace self-diagnosis
4. **skill-learner.ts** — Thread patterns → learned workflows in vault

### Phase 8: Infrastructure + Deploy (10 min)

**Run in parallel:**

A. **Environment:**
   - `.env.example` with all required vars
   - `.dev.vars` with real keys from `~/company/agent-state/secrets/` + Railway
   - Get TCLOUD_API_KEY from tangle-router Railway project
   - Get ANTHROPIC_API_KEY from Railway variables

B. **Cloudflare resources:**
   ```bash
   CLOUDFLARE_API_TOKEN=$(cat ~/company/agent-state/secrets/cloudflare-api-token)
   wrangler d1 create {agent-name}-db
   wrangler kv namespace create VAULT_KV
   ```
   Update wrangler.toml with real IDs.

C. **Stripe** (if billing needed):
   - Credit cost definitions
   - Checkout + portal helpers
   - Webhook handler

### Phase 9: Test Infrastructure (15 min)

**Run in parallel:**

A. **vitest.config.ts** + unit tests:
   - Post-process block extraction tests (all :::block types)
   - tcloud integration tests (chat, image, speech, models)

B. **playwright.config.ts** + E2E smoke tests:
   - Landing page, login, workspace CRUD
   - All workspace pages load (chat, studio, tasks, calendar, inbox, vault, settings)

C. **Eval harness** (`eval/`):
   - `run.ts` — Entry point with modes (scenarios/registry/all)
   - `scenarios.ts` — Real tcloud generations (chat, image, speech, video)
   - `registry.ts` — Prompt quality tests (role adaptation, structured output, safety)

### Phase 10: Verify + Ship (10 min)

1. Run `pnpm tsc --noEmit` — fix any type errors
2. Run `pnpm vitest run` — all unit tests pass
3. Run `pnpm tsx eval/run.ts scenarios` — real generations succeed
4. Run `pnpm tsx eval/run.ts registry` — prompt quality passes
5. Generate digest with all artifacts, upload media, create gist
6. Commit everything, push to GitHub

## Skill Composition

At the end of a successful build:
- Run `/verify` to confirm everything works
- Run `/reflect` to extract learnings for future builds
- Run `/capture-decisions` to record architectural choices
- Run `/handoff` to produce a session transfer doc

If the build needs iteration:
- Run `/evolve` targeting specific quality metrics
- Run `/diagnose` on failing tests
- Run `/converge` if CI is failing

## Domain Adaptation Checklist

When customizing for a new domain, these are the ONLY things that change:

- [ ] System prompt in `build-prompt.ts` (personality, expertise, terminology)
- [ ] Role definitions (what roles exist, how context adapts per role)
- [ ] Vault scaffold template (what files are auto-created per workspace)
- [ ] Domain tools (5-8 CLI scripts for domain-specific operations)
- [ ] Domain reference data (`src/lib/{domain}/reference.ts`)
- [ ] Domain-specific DB tables (beyond the shared skeleton)
- [ ] Workspace config fields (Settings UI, :::config extraction)
- [ ] Empty state copy (welcome messages, suggestion prompts)
- [ ] Credit costs (relative pricing for different operations)

Everything else — auth, RBAC, chat pipeline, streaming, post-processing, vault, billing, UI components, drag-drop, calendar grid, approval queue — is identical across all agents.

## Anti-Patterns

- Don't build auth from scratch — BetterAuth handles it
- Don't create custom UI components — use sandbox-ui
- Don't write a custom streaming parser — copy stream-normalizer.ts
- Don't implement your own billing — use the Stripe + credit ledger pattern
- Don't stub tools — write real implementations or skip them
- Don't mock tcloud in tests — use real API calls against router.tangle.tools
- Don't deploy without real D1/KV IDs in wrangler.toml
- Don't skip the eval harness — it's how you prove the agent works

## Reference Projects

| Project | Path | Notes |
|---------|------|-------|
| Film Agent | ~/code/film-agent | Most complete reference (chat, studio, vault, tools, eval, tcloud) |
| GTM Agent | ~/code/gtm-agent | GTM-specific (content, analytics, integrations) |
| Legal Agent | ~/code/legal-agent | Compliance-heavy (e-filing, signatures, cap table) |
| Sandbox SDK | ~/code/agent-dev-container/products/sandbox/sdk | Agent execution SDK |
| Sandbox UI | ~/code/sandbox-ui | Shared component library |
| tcloud | ~/code/tcloud/packages/tcloud | AI generation SDK (LLM, image, video, voice) |
| Tangle Router | ~/code/tangle-router | Multi-provider AI gateway (router.tangle.tools) |
