---
name: site-clone
description: "Merged into /bad. Ripping or cloning a site's design is now a flag on the bad CLI: `bad design-audit --url <site> --rip` (extract the design), and `--design-compare --compare-url <competitor>` to diff against another site. Use /bad."
---

# site-clone — merged into /bad

Site ripping/cloning now lives in the **`bad`** CLI (Browser Agent Driver):

- `bad design-audit --url https://example.com --rip` — rip the site's design
- `bad design-audit --url https://you.com --design-compare --compare-url https://competitor.com` — compare two sites
- `bad design-audit --url https://example.com --extract-tokens` — pull the design tokens

See the **`bad`** skill for the full command surface.
