# bad — Browser Agent Driver CLI Skill

You are an expert operator of the `bad` CLI (Browser Agent Driver) — a general-purpose agentic browser automation tool. Use this knowledge to help users run benchmarks, design audits, showcases, experiments, and browser automation tasks.

## Quick Reference

**Project:** `~/webb/browser-agent-driver`
**Binary:** `node dist/cli.js` (dev) or `bad` (installed globally)
**Default model:** `gpt-5.4` (OpenAI)
**Config:** `browser-agent-driver.config.ts`

## Commands

### `bad run` — Execute browser automation tasks

```bash
# Single task
bad run --goal "Find the price of iPhone 16 Pro" --url https://apple.com

# From test case file
bad run --cases bench/scenarios/cases/webbench-full50-max20-timeout240.json

# With specific model and provider
bad run -g "Search for restaurants" -u https://yelp.com --model gpt-5.4 --provider openai

# Headless with stealth
bad run -g "..." -u "..." --headless --profile stealth

# Resume a failed run
bad run --resume-run <runId>

# Fork from a previous run with new goal
bad run --fork-run <runId> --goal "Now do something else"
```

**Key flags:**
- `--goal, -g` — natural language task description
- `--url, -u` — starting URL
- `--cases, -c` — JSON test case file
- `--model, -m` — LLM model (default: gpt-5.4)
- `--provider` — openai | anthropic | google | codex-cli | claude-code | sandbox-backend
- `--mode` — fast-explore (speed) | full-evidence (screenshots for verification)
- `--profile` — default | stealth | benchmark-webbench | benchmark-webbench-stealth | benchmark-webvoyager
- `--headless` — run without visible browser (default: true)
- `--max-turns` — max LLM calls per case (default: 30)
- `--timeout` — total case timeout ms (default: 600000)
- `--concurrency` — parallel workers (default: 1)
- `--vision` — enable screenshots to LLM (default: true)
- `--no-memory` — disable trajectory memory for clean runs
- `--cdp-url` — connect to existing browser via CDP
- `--storage-state` — pre-authenticated session JSON
- `--debug, -d` — verbose turn-by-turn logging
- `--json` — structured JSONL output
- `--sink, -s` — output directory

### `bad design-audit` — Design quality analysis

```bash
# Full design audit with LLM scoring
bad design-audit --url https://stripe.com --profile saas

# Extract design tokens (no LLM, pure DOM analysis)
bad design-audit --url https://linear.app --extract-tokens

# Side-by-side comparison of two sites
bad design-audit --url https://mysite.com --design-compare --compare-url https://competitor.com

# Full site rip (offline copy)
bad design-audit --url https://example.com --rip

# Multi-page audit
bad design-audit --url https://myapp.com --pages 5 --profile defi
```

**Audit profiles:**
- `general` — holistic quality (1-10 scale, Linear/Stripe = 9-10)
- `saas` — dashboard, nav, forms, empty states, loading, errors
- `defi` — trust signals, token displays, TX clarity, wallet UX
- `marketing` — hero, visual hierarchy, CTAs, social proof

**Sub-modes:**
- Default: LLM-powered scoring + findings report
- `--extract-tokens`: Pure DOM extraction — colors, typography, spacing, components, brand assets at mobile/tablet/desktop
- `--rip`: Download entire site as working offline copy (rewrites HTML/CSS references)
- `--design-compare --compare-url <url>`: Pixel diff + structural token diff between two sites

### `bad showcase` — Marketing asset capture

```bash
# Quick hero + full page screenshots
bad showcase --url https://myapp.com --format png,webp

# Scripted walkthrough
bad showcase --url https://myapp.com --script showcase-script.json --format gif,webm

# Custom captures with cropping
bad showcase --url https://myapp.com --capture hero,scroll:500,full,element:#pricing --crop "#main"

# Dark mode, retina
bad showcase --url https://myapp.com --color-scheme dark --scale 2 --viewport 1440x900
```

**Formats:** png, webp, gif, webm, demo
**Script format:** JSON with steps (scroll, click, wait, evaluate, navigate)

### `bad runs` — List historical runs

```bash
bad runs                           # all runs
bad runs --url yelp.com            # filter by domain
bad runs --session-id abc123       # filter by session
bad runs --json                    # JSON output
```

## Benchmarks & Experiments

### Running WEBBENCH-50

```bash
# Full headed run (production baseline)
node scripts/run-scenario-track.mjs \
  --cases bench/scenarios/cases/webbench-full50-max20-timeout240.json \
  --benchmark-profile webbench-stealth \
  --model gpt-5.4 \
  --modes fast-explore \
  --concurrency 3

# Headless run
node scripts/run-scenario-track.mjs \
  --cases bench/scenarios/cases/webbench-full50-max20-timeout240.json \
  --benchmark-profile webbench-stealth \
  --model gpt-5.4 \
  --modes fast-explore \
  --headless \
  --concurrency 2

# Subset of cases
node scripts/run-scenario-track.mjs \
  --cases bench/scenarios/cases/webbench-expensive5.json \
  --benchmark-profile webbench-stealth \
  --model gpt-5.4 \
  --modes fast-explore
```

### A/B Experiments

```bash
# Seeded A/B test
pnpm ab:experiment -- \
  --cases bench/scenarios/cases/webbench-full50-max20-timeout240.json \
  --control "default config" \
  --treatment "new feature" \
  --seed 42 \
  --reps 3
```

### Research Pipeline

```bash
# Two-stage hypothesis testing (screen all 1 rep, validate winners 5 reps)
pnpm research:pipeline --queue bench/research/reliability-v1.json --two-stage

# Cost estimation before running
pnpm research:pipeline --queue bench/research/reliability-v1.json --estimate

# Single hypothesis
pnpm research:pipeline --queue bench/research/reliability-v1.json --hypothesis speed-compact-first
```

### Gate Checks (CI)

```bash
pnpm bench:tier1:gate              # deterministic local (must pass 100%)
pnpm bench:tier2:gate              # staging auth flows
pnpm bench:local:smoke             # quick smoke test
pnpm bench:local:nightly           # full nightly suite
```

### Metrics & Scoring

```bash
# Generate reliability scorecard from results
pnpm reliability:scorecard -- --root ./agent-results/run-dir

# Compare runs on a scoreboard
pnpm bench:scoreboard -- --runs ./agent-results/run1,./agent-results/run2

# Historical trend
pnpm reliability:trend -- --root ./agent-results
```

## Wallet / DeFi Testing

```bash
# Full setup flow
pnpm wallet:setup          # download MetaMask
pnpm wallet:onboard        # automate first-run wizard
pnpm wallet:anvil           # start Anvil fork (100 ETH + 10 WETH + 10k USDC)
pnpm wallet:configure       # add custom RPC to MetaMask
pnpm wallet:validate        # run DeFi validation (7 cases)

# Cleanup
pnpm wallet:anvil:stop
```

**Test wallet:** `test test test test test test test test test test test junk`
**Address:** `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`

## Browser Profiles

| Profile | Headless | Stealth | Vision | Blocking | Use Case |
|---------|----------|---------|--------|----------|----------|
| `default` | yes | no | yes | analytics | General |
| `stealth` | no | yes | varies | analytics | Anti-detection |
| `benchmark-webbench` | yes | no | no | full | Speed bench |
| `benchmark-webbench-stealth` | no | yes | varies | analytics | Reach bench |
| `benchmark-webvoyager` | yes | no | yes | analytics | Evidence bench |

## Run Modes

| Mode | Vision | Screenshots | Use Case |
|------|--------|-------------|----------|
| `fast-explore` | off | off | Speed & iteration |
| `full-evidence` | on | every 3 turns | Release signoff |

## Providers

| Provider | Auth Env Var | Default Model | Notes |
|----------|-------------|---------------|-------|
| `openai` | `OPENAI_API_KEY` | `gpt-5.4` | Default. LiteLLM-compatible via `--base-url` |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` | |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | varies | |
| `codex-cli` | `OPENAI_API_KEY` | `gpt-5` | Local codex binary |
| `claude-code` | `ANTHROPIC_API_KEY` | `sonnet` | Local claude CLI |
| `sandbox-backend` | `SIDECAR_AUTH_TOKEN` | varies | Sidecar API |

## Config File

`browser-agent-driver.config.ts` — TypeScript config with full type inference:

```typescript
import { defineConfig } from '@tangle-network/browser-agent-driver'

export default defineConfig({
  model: 'gpt-5.4',
  provider: 'openai',
  headless: true,
  maxTurns: 20,
  timeoutMs: 240000,
  memory: { enabled: true },
  supervisor: { enabled: true },
  resourceBlocking: { blockAnalytics: true },
})
```

## Development

```bash
pnpm build                  # compile TypeScript
pnpm lint                   # type-check
pnpm check:boundaries       # architecture boundaries
pnpm test                   # vitest (549 tests)
```

**Important:** `pnpm exec bad` doesn't work in dev. Use `node dist/cli.js` directly.

## Output & Reporting

Results go to `--sink` directory (default: `./agent-results`):
- `report.json` — structured results with per-case metrics
- `report.md` — markdown summary
- `report.xml` — JUnit for CI
- `_videos/` — browser recordings (webm)
- `suite/manifest.json` — artifact index

## Key Metrics

- **Pass rate** — primary quality signal
- **Turns** — LLM calls per case (efficiency)
- **Cost** — USD per case (input + output tokens × model rate)
- **Duration** — wall clock time
- **Waste metrics** — repeated queries, verification rejections, error turns

## Authentication & Session Management

### Capturing Auth State (Interactive Login → Reusable JSON)

```bash
# Opens a browser, you log in manually, then it saves cookies + localStorage
bad auth save --url https://app.example.com --storage-state .auth/example-session.json

# Validate the saved state
bad auth check --storage-state .auth/example-session.json
bad auth check .auth/example-session.json app.example.com   # also verify origin
```

The saved file is Playwright's standard storage state format:
```json
{
  "cookies": [{ "name": "session", "value": "abc123", "domain": ".example.com", ... }],
  "origins": [{ "origin": "https://app.example.com", "localStorage": [...] }]
}
```

### Headless Login for CI/CD (`bad auth login`)

```bash
# Form-based login (headless, no interaction)
bad auth login --url https://app.example.com/login \
  --fill "email=ci@test.com" --fill "password=$SECRET" \
  --wait-for "url:*/dashboard*" \
  --storage-state .auth/session.json

# Cookie injection (for API tokens, SSO tokens, etc.)
bad auth login --url https://app.example.com \
  --cookie "session=$TOKEN" \
  --storage-state .auth/session.json

# Multiple cookies
bad auth login --url https://app.example.com \
  --cookie "session=$TOKEN" --cookie "csrf=$CSRF" \
  --storage-state .auth/session.json

# Wait for a specific element instead of URL
bad auth login --url https://app.example.com/login \
  --fill "email=ci@test.com" --fill "password=$SECRET" \
  --wait-for "[data-testid='dashboard']" \
  --wait-timeout 15000
```

**`--fill` smart selectors:** `email=foo` resolves to `input[name="email"], input[type="email"], #email`. Use full CSS selectors for custom elements: `--fill "#my-input=value"`.

**CI/CD pattern (GitHub Actions):**
```yaml
- name: Generate fresh auth state
  run: |
    bad auth login --url ${{ secrets.APP_URL }}/login \
      --fill "email=${{ secrets.CI_EMAIL }}" \
      --fill "password=${{ secrets.CI_PASSWORD }}" \
      --wait-for "url:*/dashboard*" \
      --storage-state .auth/session.json
- name: Run tests
  run: bad run --cases ./tests.json --storage-state .auth/session.json
```

### Using Auth State in Runs

```bash
# Single task with pre-authenticated session
bad run -g "Change notification settings" -u https://app.example.com \
  --storage-state .auth/session.json

# Benchmark with auth (all cases share the session)
bad run --cases ./auth-cases.json --storage-state .auth/session.json

# Config file approach
# browser-agent-driver.config.ts:
#   storageState: '.auth/session.json'
```

**Gotchas:**
- State is applied once at context creation — does not auto-refresh expired tokens
- Captures cookies + localStorage + sessionStorage — not IndexedDB
- Works with both fresh and persistent contexts
- Default save path: `.auth/storage-state.json` (override with `--storage-state`)

### Persistent Chrome Profiles (Survive Across Runs)

```bash
# General-purpose persistent profile (cookies, localStorage, extensions persist)
bad run -g "Continue shopping" -u https://amazon.com --profile-dir ./my-chrome-profile

# Same profile, different task — picks up where you left off
bad run -g "Check order status" -u https://amazon.com --profile-dir ./my-chrome-profile

# Wallet mode (forces concurrency=1, enables extension loading)
bad run -g "Swap ETH for USDC" -u https://app.uniswap.org \
  --wallet \
  --extension ./extensions/metamask \
  --user-data-dir ./.agent-wallet-profile
```

**`--profile-dir` vs `--user-data-dir`:**
- `--profile-dir` — general persistent profile, supports concurrency > 1
- `--user-data-dir` — wallet/extension mode, forces concurrency=1
- Both are Chromium-only (no Firefox/WebKit)

### Connecting to an Existing Browser (CDP)

```bash
# Launch Chrome with remote debugging
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Connect bad to it (uses existing cookies, extensions, everything)
bad run -g "Export my data" -u https://app.example.com --cdp-url http://localhost:9222

# Also works via environment variable
export BROWSER_ENDPOINT=http://localhost:9222
bad run -g "..." -u "..."
```

CDP auto-discovers the WebSocket URL from the HTTP endpoint. Works with Chrome, Brave, Edge, Firefox (via `browserType.connect()`).

**Best for:** Sites where you're already logged in, debugging with DevTools open, connecting to remote browsers.

### Multi-Actor Sessions (Programmatic API)

```typescript
import { MultiActorSession } from '@tangle-network/browser-agent-driver'

const session = await MultiActorSession.create(browser, {
  actors: {
    admin:   { storageState: '.auth/admin.json' },
    partner: { storageState: '.auth/partner.json' },
    user1:   { setup: async (page) => { /* custom login flow */ } },
  },
  agentConfig: { model: 'gpt-5.4' }
})

// Each actor has isolated cookies/storage
await session.actor('admin').run({ goal: 'Invite partner user' })
await session.actor('partner').run({ goal: 'Accept invitation' })
```

### Proxy & Network Configuration

```typescript
// browser-agent-driver.config.ts
export default defineConfig({
  browserArgs: [
    '--proxy-server=http://proxy.example.com:8080',
    // Or DNS-level redirect (used for wallet RPC interception)
    '--host-resolver-rules=MAP api.example.com 127.0.0.1:8443',
  ]
})
```

No dedicated `--proxy` flag — use `browserArgs` in config or pass `--browser-args` on CLI.

### Session Continuity Across Runs

```bash
# Tag runs with a session ID — shares history context
bad run -g "Search for hotels" -u https://booking.com --session-id trip-planning
bad run -g "Now book the cheapest one" -u https://booking.com --session-id trip-planning

# Resume a crashed/timed-out run from where it left off
bad run --resume-run abc123

# Fork from a completed run with a new goal
bad run --fork-run abc123 --goal "Now check out with PayPal"
```

### Auth Strategy Decision Tree

| Scenario | Approach |
|----------|----------|
| One-time login, reuse across runs | `pnpm auth:save-state` → `--storage-state` |
| Need extensions (MetaMask, etc.) | `--user-data-dir` + `--extension` |
| Already logged in via Chrome | `--cdp-url http://localhost:9222` |
| Multi-user workflows | `MultiActorSession` (programmatic API) |
| Persistent sessions across days | `--profile-dir ./my-profile` |
| CI/automated (no interactive login) | `--storage-state` from pre-captured JSON |
| DeFi / wallet testing | `--wallet` + full wallet setup flow |

## Common Patterns

**Audit a live app while building:**
```bash
bad design-audit --url http://localhost:3000 --profile saas --pages 3
```

**Extract competitor design tokens:**
```bash
bad design-audit --url https://competitor.com --extract-tokens --output ./competitor-tokens
```

**Compare your app to a competitor:**
```bash
bad design-audit --url http://localhost:3000 --design-compare --compare-url https://competitor.com
```

**Run a quick task and see results:**
```bash
bad run -g "Find the cheapest flight from NYC to LA on Dec 25" -u https://google.com/flights -d
```

**Benchmark with stealth (for anti-bot sites):**
```bash
node scripts/run-scenario-track.mjs --cases my-cases.json --benchmark-profile webbench-stealth --model gpt-5.4
```

**Authenticated task on a SaaS app:**
```bash
bad run -g "Create a new project called 'Q2 Launch'" \
  -u https://app.linear.app \
  --storage-state .auth/linear-session.json \
  --profile stealth
```

**Multi-step workflow with session continuity:**
```bash
bad run -g "Add items to cart" -u https://shop.example.com --session-id checkout-flow
bad run -g "Complete checkout with saved payment" -u https://shop.example.com --session-id checkout-flow
```
