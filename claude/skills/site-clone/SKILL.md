---
name: site-clone
description: Legacy site-clone alias; use bad for browser-backed cloning and visual comparison.
---

# site-clone

Use `bad`; this skill only preserves the old trigger.

- Rip design: `bad design-audit --url https://example.com --rip`
- Compare sites: `bad design-audit --url https://you.com --design-compare --compare-url https://competitor.com`
- Extract tokens: `bad design-audit --url https://example.com --extract-tokens`

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Always — this alias does no work of its own | `/bad` | the target URL, viewports, and the evidence to capture |
| The clone must be compared against the original in a browser | `/ui-test` | both URLs + the flows and breakpoints to diff |
