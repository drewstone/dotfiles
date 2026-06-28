---
name: site-clone
description: Legacy shim for site ripping/cloning. Use /bad and `bad design-audit` for rip, token extraction, visual comparison, and browser-backed clone evidence.
---

# site-clone

Use `bad`; this skill only preserves the old trigger.

- Rip design: `bad design-audit --url https://example.com --rip`
- Compare sites: `bad design-audit --url https://you.com --design-compare --compare-url https://competitor.com`
- Extract tokens: `bad design-audit --url https://example.com --extract-tokens`

## Then consider

- `bad` for command details and evidence capture.
