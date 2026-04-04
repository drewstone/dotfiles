---
name: ui-test
description: >-
  Adversarial UI testing using the bad CLI (Browser Agent Driver). Analyzes git
  diffs to test only changed code, or explores full apps to find bugs. Runs in
  real browsers with optional wallet extension support. Use when the user says
  'test the UI', 'ui test', 'QA this', 'test my PR', 'find UI bugs',
  'adversarial test', or wants browser-based testing of frontend changes.
---

# ui-test — Adversarial UI Testing with Browser Agent Driver

You are an adversarial UI tester. Your job is to **break things**, not confirm they work. You plan tests in three rounds, dispatch sub-agents to execute them in real browsers via the `bad` CLI, then merge results into a structured report.

## Prerequisites

- `bad` CLI available (`node dist/cli.js` in `~/webb/browser-agent-driver`, or `bad` global)
- Target app running (dev server, preview build, or deployed URL)
- `OPENAI_API_KEY` set (default model: gpt-5.4)
- For wallet flows: MetaMask extension + Anvil setup (see Wallet section)

## Workflow Selection

Ask the user or infer from context:

| Trigger | Workflow |
|---------|----------|
| "test my PR", "test the diff", git changes present | **A: Diff-driven** |
| "find bugs", "QA this app", "explore" | **B: Exploratory** |
| "test in parallel", multiple independent pages | **C: Parallel** |
| "test wallet", "test SIWE", "test connect wallet" | **D: Wallet** |

---

## Phase 1: Planning (MANDATORY before any execution)

Complete ALL three rounds of planning in a single response before launching any sub-agent or running any `bad` command.

### Round 1 — Functional Tests

Identify core user flows affected by the change (or visible in the app):
- Happy path: does the primary action work?
- State transitions: does UI update correctly after actions?
- Navigation: do links/buttons go where expected?
- Data display: is content rendered correctly?

### Round 2 — Adversarial Tests

For every functional test, add adversarial variants:
- **Empty/missing input**: submit blank forms, click without filling required fields
- **Boundary input**: 500+ chars, special characters, `<script>alert('xss')</script>`, emoji, Unicode
- **Rapid interaction**: double-click submit, rapid toggle, spam Enter key
- **Interrupted flow**: navigate away mid-action, close modal during submit, back button
- **Error recovery**: trigger an error, then retry — is state preserved?
- **Keyboard-only**: complete the flow using only Tab/Enter/Escape

### Round 3 — Coverage Gaps

Check what Rounds 1-2 missed:
- **Accessibility**: axe-core violations, focus management, screen reader semantics
- **Responsive**: mobile (375px), tablet (768px), desktop (1440px) viewports
- **Console health**: JS errors, failed network requests, hydration warnings
- **Empty states**: pages with no data
- **Error boundaries**: what happens when things break?

### Planning Output

After three rounds, produce a numbered test list grouped by independence:

```
GROUP A (auth flows — sequential):
  T1: Sign in with email — happy path
  T2: Sign in with email — wrong password error
  T3: Sign in with email — empty fields
  T4: Sign out — UI resets completely (no stale state)

GROUP B (pricing page — independent):
  T5: Click plan while unauthenticated — modal opens
  T6: Click plan while authenticated — navigates to pricing
  T7: Responsive: pricing cards at 375px width
  T8: axe-core accessibility audit on pricing page

GROUP C (wallet — requires extension):
  T9: Connect wallet via SIWE — single click flow
  T10: Connect wallet — dismiss modal, retry
```

Assign step budgets:
- ~15 turns for targeted single-action checks
- ~25 turns for multi-step flows
- ~30 turns for exploratory/adversarial sequences

---

## Phase 2: Execution

### Workflow A — Diff-Driven

1. Read the git diff: `git diff develop...HEAD` (or `git diff --cached`)
2. Identify changed files and map to UI areas
3. Plan tests targeting ONLY changed areas
4. Execute via `bad run`

### Workflow B — Exploratory

1. Start at the app's entry point
2. Navigate organically, noting what looks testable
3. Apply adversarial patterns to what you find
4. Report findings with severity

### Workflow C — Parallel

Launch independent test groups as parallel sub-agents, each writing its own cases file and running `bad run --cases`.

### Workflow D — Wallet

Uses `bad` with wallet extensions for Web3 flows:

```bash
# Ensure wallet infra is running
cd ~/webb/browser-agent-driver
pnpm wallet:anvil  # start Anvil fork if not running

# Run wallet test
bad run \
  --goal "Connect wallet via SIWE, sign the message, verify authenticated state" \
  --url http://localhost:5173 \
  --wallet \
  --extension ./extensions/metamask \
  --user-data-dir ./.agent-wallet-profile \
  --wallet-auto-approve \
  --wallet-preflight \
  --no-headless \
  --max-turns 25 \
  --mode full-evidence \
  --sink ./agent-results/ui-test
```

---

## Test Case Format

Write test cases as JSON for `bad run --cases`:

```json
[
  {
    "id": "auth-signin-happy",
    "name": "Sign in with email — happy path",
    "startUrl": "http://localhost:5173",
    "goal": "Click 'Sign In', enter test@example.com / password123, submit. Verify dashboard loads with user menu visible.",
    "maxTurns": 20,
    "successCriteria": [
      { "type": "url-contains", "value": "/chat" },
      { "type": "element-visible", "selector": "[data-testid='user-menu']" }
    ]
  },
  {
    "id": "auth-signin-empty",
    "name": "Sign in — empty fields",
    "startUrl": "http://localhost:5173",
    "goal": "Open sign-in modal, click submit without entering anything. Verify error messages appear and form does not navigate away.",
    "maxTurns": 15
  }
]
```

Save to `.context/ui-test-cases.json` (or a path the user specifies).

---

## Execution Commands

### Single targeted test
```bash
bad run \
  --goal "Navigate to /pricing while logged out. Verify it shows sign-in modal, not a crash." \
  --url http://localhost:5173/pricing \
  --headless \
  --max-turns 15 \
  --mode full-evidence \
  --sink .context/ui-test-results
```

### Full test suite
```bash
bad run \
  --cases .context/ui-test-cases.json \
  --headless \
  --max-turns 25 \
  --concurrency 2 \
  --mode full-evidence \
  --sink .context/ui-test-results
```

### Authenticated tests
```bash
# First capture auth state
bad auth login \
  --url http://localhost:5173 \
  --fill "email=test@example.com" --fill "password=password123" \
  --wait-for "url:*/chat*" \
  --storage-state .context/ui-test-auth.json

# Then run with auth
bad run \
  --cases .context/ui-test-cases.json \
  --storage-state .context/ui-test-auth.json \
  --headless \
  --sink .context/ui-test-results
```

---

## Assertion Protocol

Every test must produce a verdict with evidence. The `bad` CLI handles this via:

1. **Success criteria** in the test case JSON (strongest — deterministic)
2. **Goal verification** by the agent (LLM reviews final state vs goal)
3. **Artifact evidence** in the report (screenshots, video, runtime logs)

### Interpreting Results

Read `report.json` from the sink directory:

```bash
cat .context/ui-test-results/report.json | jq '.results[] | {id: .testCase.id, verdict, turnsUsed, durationMs}'
```

For failures, check:
- `.agentResult.result` — what the agent observed
- `.agentResult.turns[-1].state.url` — final URL
- `.agentResult.turns[-1].state.snapshot` — final page state
- `manifest.json` — video recordings and screenshots

### Evidence Hierarchy (strongest to weakest)

1. **Success criteria match** — URL contains, element visible, element text equals
2. **Runtime log** — console errors, failed requests, JS exceptions
3. **Goal verification** — LLM confirms goal achieved with evidence
4. **Screenshot/video** — visual confirmation of state

---

## Report Generation

After all tests complete, read the results and produce a summary:

```
## UI Test Report — [PR title or app name]

**Date:** YYYY-MM-DD
**Target:** http://localhost:5173
**Tests:** 12 | Passed: 9 | Failed: 2 | Skipped: 1 | Pass rate: 75%

### Failures

#### T3: Sign in — empty fields (FAIL)
- **Expected:** Error messages appear on empty submit
- **Actual:** Form submitted with no validation, 500 error in console
- **Evidence:** console error `POST /api/auth 400`, no client-side validation
- **Severity:** High — users can submit empty auth forms
- **Video:** .context/ui-test-results/auth-signin-empty/recording.webm

#### T7: Responsive pricing at 375px (FAIL)
- **Expected:** Cards stack vertically, no horizontal overflow
- **Actual:** Cards overflow viewport, horizontal scroll visible
- **Evidence:** screenshot shows content clipped at right edge
- **Severity:** Medium — mobile users see broken layout

### Passes

| Test | Turns | Duration |
|------|-------|----------|
| T1: Sign in happy path | 8 | 12.3s |
| T2: Sign in wrong password | 6 | 9.1s |
| ... | ... | ... |
```

If the user wants HTML, generate a standalone `.context/ui-test-report.html` with embedded screenshots (base64).

---

## Sub-Agent Dispatch (for parallel execution)

When using Claude Code's Agent tool for parallel groups:

```
Launch sub-agent for GROUP A with prompt:
"Run these UI tests using bad CLI against http://localhost:5173.
Write test cases to /tmp/ui-test-group-a.json, then execute:

bad run --cases /tmp/ui-test-group-a.json --headless --max-turns 25 --mode full-evidence --sink .context/ui-test-results/group-a

Tests to run:
T1: [goal]
T2: [goal]
T3: [goal]

Read report.json after completion and report results as:
PASS|T1|<evidence>
FAIL|T2|<expected> -> <actual>
PASS|T3|<evidence>"
```

Each sub-agent:
1. Writes its test cases JSON
2. Runs `bad run --cases`
3. Reads `report.json`
4. Reports structured results

Main agent merges all sub-agent results into the final report.

---

## Diff-to-Test Mapping

When analyzing a git diff, map changed files to test areas:

| Changed files | Test focus |
|---------------|-----------|
| `**/auth/**`, `SignIn*`, `SignUp*` | Auth flows, session state, sign-out cleanup |
| `**/pricing/**`, `PricingDialog*` | Plan selection, Stripe redirect, unauth behavior |
| `**/wallet/**`, `*SIWE*`, `*Ethereum*` | Wallet connect, SIWE signing, disconnect |
| `**/chat/**`, `Chat.tsx` | Message send/receive, streaming, code blocks |
| `**/*.css`, `**/ui/**`, `*layout*` | Responsive, spacing, dark mode, component rendering |
| `**/api.**`, `loader`, `action` | Data loading, form submissions, error states |
| `sessionStorage*`, `localStorage*` | State persistence across navigation, tab close |
| `**/hooks/**`, `*store*` | State management, reactivity, stale closures |

---

## Anti-Patterns

- Do NOT plan inside sub-agents — all planning happens in the main agent
- Do NOT run `bad` without `--sink` — artifacts are your evidence
- Do NOT skip adversarial tests — happy path passing means nothing if edge cases crash
- Do NOT test with `--no-vision` for UI verification — you need screenshots
- Do NOT run wallet tests in headless mode — extensions require visible browser
- Do NOT assume auth state — always capture or verify before authenticated tests
- Do NOT merge results without reading `report.json` — check actual verdicts, not just exit codes
