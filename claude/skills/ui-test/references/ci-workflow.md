# CI Workflow Integration

## GitHub Actions — UI Test Gate

Add to any repo to run adversarial UI tests on every PR.

### Minimal Workflow (no wallet)

```yaml
name: UI Test Gate

on:
  pull_request:
    types: [opened, synchronize, ready_for_review]
  workflow_dispatch:
    inputs:
      url:
        description: 'Target URL (default: localhost preview build)'
        required: false

jobs:
  ui-test:
    if: github.event.pull_request.draft == false
    runs-on: [self-hosted, staging-runner]
    timeout-minutes: 15

    steps:
      - name: Checkout app
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # need full history for diff

      - name: Checkout browser-agent-driver
        uses: actions/checkout@v4
        with:
          repository: tangle-network/browser-agent-driver
          path: .bad
          token: ${{ secrets.CROSS_REPO_READ_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install bad CLI
        run: cd .bad && npm ci && npm run build

      - name: Build and start preview
        run: |
          pnpm install && pnpm build
          pnpm preview &
          sleep 5
          curl --retry 10 --retry-delay 2 -sf http://localhost:4173 > /dev/null
        env:
          NODE_ENV: production

      - name: Generate test cases from diff
        id: plan
        run: |
          # Extract changed files
          git diff origin/${{ github.base_ref }}...HEAD --name-only > /tmp/changed-files.txt

          # Generate test cases (Claude Code or static mapping)
          # For now, use a static smoke suite
          cat > /tmp/ui-test-cases.json << 'CASES'
          [
            {
              "id": "smoke-homepage",
              "name": "Homepage loads without errors",
              "startUrl": "http://localhost:4173",
              "goal": "Verify the homepage loads completely. Check for: visible main content, no console errors, no broken images, all navigation links present.",
              "maxTurns": 10
            },
            {
              "id": "smoke-auth-gate",
              "name": "Protected routes redirect to login",
              "startUrl": "http://localhost:4173/settings",
              "goal": "Navigate to /settings without being logged in. Verify redirect to login or sign-in modal appears. No crash, no blank page.",
              "maxTurns": 10
            }
          ]
          CASES

      - name: Run UI tests
        run: |
          node .bad/dist/cli.js run \
            --cases /tmp/ui-test-cases.json \
            --headless \
            --max-turns 20 \
            --concurrency 2 \
            --mode full-evidence \
            --sink ./ui-test-results
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Parse results and comment on PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs')
            const path = './ui-test-results/report.json'

            if (!fs.existsSync(path)) {
              core.warning('No report.json found — tests may not have run')
              return
            }

            const report = JSON.parse(fs.readFileSync(path, 'utf8'))
            const results = report.results || []
            const passed = results.filter(r => r.verdict === 'PASS').length
            const failed = results.filter(r => r.verdict === 'FAIL').length
            const total = results.length
            const rate = total > 0 ? Math.round((passed / total) * 100) : 0

            let body = `## UI Test Results\n\n`
            body += `**Tests:** ${total} | **Passed:** ${passed} | **Failed:** ${failed} | **Pass rate:** ${rate}%\n\n`

            if (failed > 0) {
              body += `### Failures\n\n`
              for (const r of results.filter(r => r.verdict === 'FAIL')) {
                body += `- **${r.testCase.name}**: ${r.agentResult?.result || 'No details'}\n`
              }
              body += `\n`
            }

            body += `\n---\n*Tested by [browser-agent-driver](https://github.com/tangle-network/browser-agent-driver)*`

            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body
            })

      - name: Upload artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ui-test-evidence
          path: ui-test-results/
          retention-days: 14

      - name: Fail if tests failed
        run: |
          FAILED=$(cat ui-test-results/report.json | jq '[.results[] | select(.verdict == "FAIL")] | length')
          if [ "$FAILED" -gt 0 ]; then
            echo "::error::$FAILED UI test(s) failed"
            exit 1
          fi
```

### With Wallet Tests

Add to the workflow above, after the non-wallet tests:

```yaml
      - name: Setup wallet infra
        if: contains(steps.plan.outputs.needs_wallet, 'true')
        run: |
          cd .bad
          pnpm wallet:setup
          pnpm wallet:onboard
          pnpm wallet:anvil &
          sleep 3
          pnpm wallet:configure

      - name: Run wallet UI tests
        if: contains(steps.plan.outputs.needs_wallet, 'true')
        run: |
          node .bad/dist/cli.js run \
            --cases /tmp/ui-test-wallet-cases.json \
            --wallet \
            --extension .bad/extensions/metamask \
            --user-data-dir .bad/.agent-wallet-profile \
            --wallet-auto-approve \
            --wallet-preflight \
            --no-headless \
            --max-turns 25 \
            --mode full-evidence \
            --sink ./ui-test-results/wallet
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Stop wallet infra
        if: always() && contains(steps.plan.outputs.needs_wallet, 'true')
        run: cd .bad && pnpm wallet:anvil:stop || true
```

## bad-app Integration

For projects using bad-app as a control plane, trigger runs via the CI API:

```yaml
      - name: Trigger bad-app run
        run: |
          curl -X POST https://browser.tangle.tools/api/ci/trigger \
            -H "Authorization: Bearer ${{ secrets.BAD_APP_CI_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{
              "repo": "${{ github.repository }}",
              "pr": ${{ github.event.pull_request.number }},
              "commitSha": "${{ github.sha }}",
              "targetUrl": "http://localhost:4173",
              "cases": "smoke"
            }'
```

This queues runs through bad-app's executor (sidecar-backed), which posts results back as a PR comment via GitHub webhooks.
