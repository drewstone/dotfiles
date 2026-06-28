---
name: bad
description: Browser Agent Driver CLI operator for browser automation, UI/design audits, auth state, showcases, and benchmark runs. Triggers: "run bad", "browser agent", "design audit", "webbench", "automate this site".
---

# bad

Use the `bad` CLI for real browser work: automation, evidence capture, design audits, site rips, auth-state setup, showcases, and browser benchmarks.
Do not fake browser results; every claim must come from a run artifact, screenshot, DOM extract, trace, or saved report.

## Start

1. Verify the binary: `bad --version`.
2. If missing, install `@tangle-network/browser-agent-driver` or run it from source; stop if neither is available.
3. Run `bad --help` or the specific subcommand help before relying on flags.
4. Prefer a narrow first run over a broad audit; expand only after the command and target are proven.

## Commands

- `bad run` executes a browser task from a goal, URL, or case file.
- `bad design-audit` scores product/visual/trust issues, extracts tokens, compares sites, or rips a page.
- `bad showcase` captures hero shots, full-page screenshots, walkthroughs, dark mode, and retina assets.
- `bad auth` captures, validates, or injects authenticated browser state.
- `bad runs` lists historical runs and helps resume or fork prior work.

See `references/full-reference.md` for the full CLI command catalog, auth patterns, config shape, and examples.

## Operating Rules

- For UI or design claims, inspect actual screenshots or extracted DOM/style data.
- For authenticated flows, validate the auth state before running the test or benchmark.
- For site ripping or clone prep, use `bad design-audit --rip` or the current equivalent from `bad design-audit --help`.
- For benchmark work, record provider, model, mode, profile, case count, pass/fail counts, wall time, and artifact path.
- For patch validation, re-audit after the patch and compare against the prior run.

## Then consider

- `ui-test` when the task is specifically QA of a product UI or PR.
- `product-design-audit` when the user wants redesign decisions, not only browser evidence.
