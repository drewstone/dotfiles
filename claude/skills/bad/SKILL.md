---
name: bad
description: Operate the `bad` CLI (Browser Agent Driver), a general-purpose agentic browser automation tool. Use for browser automation, benchmark runs, design audits, showcases, and experiments. Triggers - "run bad", "browser agent", "design audit", "webbench", "browser benchmark", "automate this site".
---

# bad — Browser Agent Driver CLI Skill

You are an expert operator of the `bad` CLI (Browser Agent Driver) — a general-purpose agentic browser automation tool. Use this knowledge to help users run benchmarks, design audits, showcases, experiments, and browser automation tasks.

## Setup

**Check if installed:**
```bash
bad --version 2>/dev/null || echo "not installed"
```

**Install globally (npm):**
```bash
npm install -g @tangle-network/browser-agent-driver
```

**Install from source:**
```bash
git clone https://github.com/tangle-network/browser-agent-driver.git
cd browser-agent-driver
pnpm install && pnpm build
# Use: node dist/cli.js (or alias to bad)
```

**Required env vars (at least one provider):**
```bash
export OPENAI_API_KEY=sk-...          # for gpt-5.4 (default model)
# or
export ANTHROPIC_API_KEY=sk-ant-...   # for claude-sonnet-4-6
# or
export GOOGLE_GENERATIVE_AI_API_KEY=... # for Gemini models
```

**Verify:** `bad run -g "What is this page?" -u https://example.com -d`

If `bad` is not installed and can't be installed (no npm, no git access), tell the user what's needed and stop — don't fake it.

## Quick Reference

**Binary:** `bad` (global install) or `node dist/cli.js` (from source)
**Default model:** `gpt-5.4` (OpenAI)
**Config file:** `browser-agent-driver.config.ts` (optional, in project root)

## Commands

### `bad run` — Execute browser automation tasks

```bash
# Single task
bad run --goal "Find the price of iPhone 16 Pro" --url https://apple.com

# From test case file
bad run --cases ./test-cases.json

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

# Deep audit — three parallel passes (product, visual, trust/workflow/content
# tailored to the page classification)
bad design-audit --url https://myapp.com --audit-passes deep

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
- `--audit-passes <mode>`: `auto` (Layer 1 default — runs the ensemble classifier first, then a classification-tailored bundle), `standard` (1 integrated pass), `deep` (3 classification-tailored passes), `max` (all 5 passes), or a comma list like `product,visual,trust`. Each pass focuses on a different facet — product intent, visual craft, trust/risk, workflow, content/IA — and findings are merged conservatively.
- `--extract-tokens`: Pure DOM extraction — colors, typography, spacing, components, brand assets at mobile/tablet/desktop viewports. **No LLM API key needed.**
- `--rip`: Download entire site as working offline copy (rewrites HTML/CSS references)
- `--design-compare --compare-url <url>`: Pixel diff + structural token diff between two sites

**v2 multi-dim output (Layer 1 — `report.json`):**

Every `bad design-audit --json` run now emits a `v2` block alongside the legacy `pages[]` shape. The v2 block is the agent-actionable contract:

```json
{
  "schemaVersion": 1,
  "pages": [/* legacy v1 shape */],
  "v2": {
    "schemaVersion": 2,
    "pages": [
      {
        "schemaVersion": 2,
        "classification": { "type": "saas-app", "ensembleConfidence": 0.84, "signalsAgreed": true, "firstPrinciplesMode": false, "signals": [/* url + dom + llm */] },
        "scores": {
          "product_intent": { "score": 4, "range": [3, 5], "confidence": "high",   "summary": "...", "primaryFindings": ["finding-1-..."] },
          "visual_craft":   { "score": 7, "range": [6, 8], "confidence": "medium", "summary": "...", "primaryFindings": [] },
          "trust_clarity":  { "score": 6, "range": [5, 7], "confidence": "medium", "summary": "...", "primaryFindings": [] },
          "workflow":       { "score": 5, "range": [4, 6], "confidence": "medium", "summary": "...", "primaryFindings": [] },
          "content_ia":     { "score": 7, "range": [6, 8], "confidence": "high",   "summary": "...", "primaryFindings": [] }
        },
        "rollup": {
          "score": 5.4,
          "range": [4.4, 6.4],
          "confidence": "medium",
          "rule": "saas-app: product_intent*0.35 + workflow*0.30 + ...",
          "weights": { "product_intent": 0.35, "workflow": 0.30, "visual_craft": 0.15, "trust_clarity": 0.10, "content_ia": 0.10 }
        },
        "findings": [/* with stable id + dimension + kind */],
        "topFixes": ["finding-1-...", "finding-3-..."]
      }
    ]
  }
}
```

**Worked example — agent decides where to invest:**

```ts
const report = JSON.parse(fs.readFileSync('audit-results/.../report.json', 'utf-8'))
const page = report.v2.pages[0]

// Find the dimension with the lowest score AND highest weight — that's
// where a fix moves the rollup the most.
const weights = page.rollup.weights
const ranked = Object.entries(page.scores)
  .map(([dim, s]) => ({ dim, score: s.score, weight: weights[dim], leverage: (10 - s.score) * weights[dim] }))
  .sort((a, b) => b.leverage - a.leverage)

console.log(`Highest-leverage dim: ${ranked[0].dim} (score ${ranked[0].score}, weight ${ranked[0].weight})`)
// → "Highest-leverage dim: product_intent (score 4, weight 0.35)"

// Pull the findings driving that dim
const findingsForDim = page.findings.filter(f => f.dimension === ranked[0].dim)
// Apply Layer 2 patches when present (Layer 1 emits findings with empty patches[]).
```

**Agent contract — when to act on what:**
- `rollup.confidence === 'low'` OR `classification.firstPrinciplesMode === true` → treat as advisory; consider re-running with `--rubric-hint <type>` if you have a strong prior.
- `classification.signalsAgreed === false` → URL/DOM/LLM disagreed; check `classification.dissent` for the alternative type before committing.
- Per-dim `range` width encodes uncertainty. Wider range → less confident the score is right.
- `topFixes` is the ROI-ordered finding-id list. Apply in order.

**Layer 2 — Patch consumption (agent loop):**

Every major/critical finding now ships `patches[]`. Apply them mechanically:

```ts
const finding = page.findings.find(f => f.id === page.topFixes[0])
const patch = finding.patches[0]

// Option A — when patch.target.filePath is set:
// 1. Apply: `git apply` the patch.diff.unifiedDiff
// 2. Verify: run patch.testThatProves.command (if set)
// 3. Rollback if verify fails: patch.rollback.kind === 'git-revert' → `git revert HEAD`

// Option B — when filePath is absent, use search-replace:
// find patch.diff.before in the file at patch.target.cssSelector
// replace with patch.diff.after
```

After applying, close the loop (Layer 4):
```bash
bad design-audit ack-patch <patchId> --pre-run-id <runId> [--applied-by agent:claude-code]
bad design-audit --url <url> --post-patch <patchId>   # re-audit, records observed delta
```

**Layer 3 — First-principles mode:**
- When `classification.firstPrinciplesMode === true` the auditor scored against 5 universal product principles (not domain-specific rubric). Treat findings as advisory — they are correct directionally but may miss domain nuances.
- Re-running with `--rubric-hint <type>` provides a prior to the ensemble if you have strong reason to believe the page type.

**Layer 4 — Close the loop (patch attribution):**
```bash
# After applying a patch, record it so the system can measure the outcome
bad design-audit ack-patch <patchId> --pre-run-id <runId>

# Re-audit — system auto-detects the pending ack-patch and records observed delta
bad design-audit --url <url> --post-patch <patchId>
```
If you skip ack-patch + re-audit, the patch's `estimatedDeltaConfidence` stays `untested` forever. Attribution data is what upgrades patches from `untested` to `high` after N≥30 applications.

**Layer 5 — Pattern library (cold-start):**
```bash
bad patterns query --category leaderboard --page-type saas-app
bad patterns show pattern:leaderboard:linear-tier
```
The library is empty until ~6 weeks of fleet attribution data accumulates. When patterns exist, findings include `matchedPatterns[]` with fleet evidence (N, successRate, medianDimDelta). Prefer pattern-backed patches over novel ones.

**Layer 6 — Audience / modality / regulatory hints:**
```bash
bad design-audit --url ... --audience clinician --regulatory hipaa --modality tablet
bad design-audit --url ... --audience kids --audience-vulnerability minor-facing
```
These load additional rubric fragments (audience-clinician.md, regulatory-hipaa.md, etc.) that score beyond standard page-type heuristics. If the classifier infers the audience from page content, hints are redundant but harmless.

**Layer 7 — Ethics floor:**
- If `result.ethicsViolations.length > 0` the rollup score is capped regardless of polish.
- `critical-floor` violations cap rollup at 4. `major-floor` caps at 6.
- `result.preEthicsScore` shows what the LLM originally scored before the cap.
- **Patches cannot lift a score above the ethics cap until the violation is remediated.** Fix ethics violations FIRST.
- Test-only bypass: `--skip-ethics` (logged and warned).

**Layer 8 — Modality dispatch:**
```bash
bad design-audit --url <url> --modality html   # default, Playwright-based
bad design-audit --url <url> --modality ios    # not yet implemented; see RFC-002 Layer 8
bad design-audit --url <url> --modality android
```
Only `html` is live. `ios` and `android` stubs throw `NotImplementedError` with a clear message.

**Telemetry — every audit emits learning data:**
- Per-page envelope with classification, score, findings, ROI, prompt/rubric hash, token cost lands in `~/.bad/telemetry/<repo>/<date>.jsonl`.
- Per-run summary + per-evolve-round envelopes go to the same sink.
- Optional remote collector: set `BAD_TELEMETRY_ENDPOINT` (and `BAD_TELEMETRY_BEARER` for auth).
- Disable: `BAD_TELEMETRY=0`.
- Roll up across the fleet: from the bad source repo, `pnpm telemetry:rollup` (filter with `--repo <name>` or `--kind design-audit-page`).

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

### `bad auth` — Authentication management

```bash
# Interactive: opens browser, you log in, saves session state
bad auth save --url https://app.example.com --storage-state .auth/session.json

# Validate saved state
bad auth check --storage-state .auth/session.json

# Headless login (CI/CD)
bad auth login --url https://app.example.com/login \
  --fill "email=ci@test.com" --fill "password=$SECRET" \
  --wait-for "url:*/dashboard*" \
  --storage-state .auth/session.json

# Cookie injection
bad auth login --url https://app.example.com \
  --cookie "session=$TOKEN" \
  --storage-state .auth/session.json
```

**`--fill` smart selectors:** `email=foo` resolves to `input[name="email"], input[type="email"], #email`. Use full CSS selectors for custom elements: `--fill "#my-input=value"`.

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
| `cli-bridge` | `CLI_BRIDGE_BEARER` | `codex/gpt-5.5` | Local cli-bridge HTTP proxy (`CLI_BRIDGE_URL`) |
| `codex-cli` | `OPENAI_API_KEY` | `gpt-5` | Local codex binary |
| `claude-code` | `ANTHROPIC_API_KEY` | `sonnet` | Local claude CLI |
| `sandbox-backend` | `SIDECAR_AUTH_TOKEN` | varies | Sidecar API |

## Fleet telemetry expectations

`bad` writes telemetry by default — every project that calls `bad design-audit` or `bad run` automatically contributes to a fleet-wide learning corpus stored at `~/.bad/telemetry/<repo>/<date>.jsonl`. When you run `bad` from any new repo, do NOT disable telemetry; the data is what lets the prompts improve over time.

Useful env knobs:
- `BAD_TELEMETRY=0` — disable (only when explicitly required, e.g. air-gapped CI).
- `BAD_TELEMETRY_DIR=/path` — override the local sink directory.
- `BAD_TELEMETRY_ENDPOINT=https://collector` — additional remote sink for centralised dashboards.
- `BAD_TELEMETRY_BEARER=...` — bearer token for the remote endpoint.

To inspect what's been collected: `cd ~/code/browser-agent-driver && pnpm telemetry:rollup` — filters available via `--repo`, `--kind`, `--since`, `--until`, `--json`.

When the user asks about prompt-evolution / GEPA / "improve the audit prompt itself", run from the bad source repo:

```bash
pnpm design:gepa:smoke                                # 30s, no LLM, deterministic
pnpm design:gepa --target pass-focus                  # default population=4 generations=2
pnpm design:gepa --target conservative-score-weights --mutator deterministic
pnpm design:gepa --target few-shot-example --mutator reflective
```

Targets are the knobs the loop is allowed to mutate this run. Reports land in `.evolve/gepa/<runId>/`. Promotion is human-in-the-loop: review `gen-N.md`, paste the winning payload into `src/design/audit/evaluate.ts` defaults.

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

## Authentication Patterns

### Using Auth State in Runs

```bash
# Single task with pre-authenticated session
bad run -g "Change notification settings" -u https://app.example.com \
  --storage-state .auth/session.json

# Benchmark with auth (all cases share the session)
bad run --cases ./auth-cases.json --storage-state .auth/session.json
```

**Gotchas:**
- State is applied once at context creation — does not auto-refresh expired tokens
- Captures cookies + localStorage + sessionStorage — not IndexedDB
- Default save path: `.auth/storage-state.json` (override with `--storage-state`)

### Persistent Chrome Profiles

```bash
# General-purpose persistent profile (cookies, localStorage, extensions persist)
bad run -g "Continue shopping" -u https://amazon.com --profile-dir ./my-chrome-profile

# Wallet mode (forces concurrency=1, enables extension loading)
bad run -g "Swap ETH for USDC" -u https://app.uniswap.org \
  --wallet \
  --extension ./extensions/metamask \
  --user-data-dir ./.agent-wallet-profile
```

- `--profile-dir` — general persistent profile, supports concurrency > 1
- `--user-data-dir` — wallet/extension mode, forces concurrency=1
- Both are Chromium-only (no Firefox/WebKit)

### Connecting to an Existing Browser (CDP)

```bash
# Connect to browser with remote debugging enabled
bad run -g "Export my data" -u https://app.example.com --cdp-url http://localhost:9222

# Also works via environment variable
export BROWSER_ENDPOINT=http://localhost:9222
bad run -g "..." -u "..."
```

CDP auto-discovers the WebSocket URL from the HTTP endpoint. Works with Chrome, Brave, Edge.

### Session Continuity

```bash
# Tag runs with a session ID — shares history context
bad run -g "Search for hotels" -u https://booking.com --session-id trip-planning
bad run -g "Now book the cheapest one" -u https://booking.com --session-id trip-planning

# Resume a crashed/timed-out run
bad run --resume-run <runId>

# Fork from a completed run with a new goal
bad run --fork-run <runId> --goal "Now check out with PayPal"
```

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

await session.actor('admin').run({ goal: 'Invite partner user' })
await session.actor('partner').run({ goal: 'Accept invitation' })
```

### Auth Strategy Decision Tree

| Scenario | Approach |
|----------|----------|
| One-time login, reuse across runs | `bad auth save` → `--storage-state` |
| Need extensions (MetaMask, etc.) | `--user-data-dir` + `--extension` |
| Already logged in via Chrome | `--cdp-url http://localhost:9222` |
| Multi-user workflows | `MultiActorSession` (programmatic API) |
| Persistent sessions across days | `--profile-dir ./my-profile` |
| CI/automated (no interactive login) | `--storage-state` from `bad auth login` |
| DeFi / wallet testing | `--wallet` + `--extension` |

## Common Patterns

**Audit a live app while building:**
```bash
bad design-audit --url http://localhost:3000 --profile saas --pages 3
```

**Extract competitor design tokens:**
```bash
bad design-audit --url https://competitor.com --extract-tokens
```

**Compare your app to a competitor:**
```bash
bad design-audit --url http://localhost:3000 --design-compare --compare-url https://competitor.com
```

**Run a quick task and see results:**
```bash
bad run -g "Find the cheapest flight from NYC to LA on Dec 25" -u https://google.com/flights -d
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

**CI/CD pattern (GitHub Actions):**
```yaml
- name: Install bad CLI
  run: npm install -g @tangle-network/browser-agent-driver

- name: Generate auth state
  run: |
    bad auth login --url ${{ secrets.APP_URL }}/login \
      --fill "email=${{ secrets.CI_EMAIL }}" \
      --fill "password=${{ secrets.CI_PASSWORD }}" \
      --wait-for "url:*/dashboard*" \
      --storage-state .auth/session.json

- name: Run test cases
  run: bad run --cases ./e2e-cases.json --storage-state .auth/session.json --sink ./results

- name: Upload results
  uses: actions/upload-artifact@v4
  with:
    name: browser-agent-results
    path: ./results/
```
