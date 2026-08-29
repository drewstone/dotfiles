---
name: site-clone
description: Inspect and reproduce a site with direct browser evidence and visual comparison.
---

# site-clone

Use Playwright or the repository's browser test stack directly.

- Capture the reference at desktop and mobile widths.
- Inspect the live DOM, computed styles, assets, and interaction states.
- Implement with the target repository's components and tokens.
- Compare screenshots at the same viewport and fix visible differences.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| The clone must be compared against the original in a browser | `/ui-test` | both URLs + the flows and breakpoints to diff |
