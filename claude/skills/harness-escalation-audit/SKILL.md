---
name: harness-escalation-audit
description: Audit how coding backends surface permissions, questions, plans, hooks, and MCP.
---

# harness-escalation-audit

Refresh the per-harness user-interaction-escalation capability map. Source of truth
is `docs/processes/harness-user-escalation.md` (the dated two-mode matrix); this
skill re-runs the research that fills it and updates the dates so staleness is
visible. Evidence-required — the codex 0.142.x drift shipped because a capability
was *assumed*, so every cell needs a source.

## When to run

- A new harness/adapter lands under `packages/sdk-provider-*`.
- A harness bumps a major version (its CLI flags / MCP / hook surface may change).
- Any matrix row's **Audited** date is > 90 days old.
- The user wants to know what's wired / wireable / blocked, or whether a user can
  bring their own harness or extension.

## Process

1. **Enumerate harnesses** — every `packages/sdk-provider-<name>/` plus the
   `INTERACTIVE_BINARY` map in
   `apps/sidecar/src/interactive/interactive-session-manager.ts`.

2. **Fan out one research agent per harness** (a `Workflow` with `agentType: 'Explore'`,
   one parallel agent per harness, structured output). Each agent MUST, for its
   harness, produce evidence — no claim without a source:
   - read our adapter under `packages/sdk-provider-<harness>/src/`;
   - run the real CLI: `<bin> --help`, `<bin> mcp --help`, `<bin> --version`
     (binaries resolve on `PATH` or `/nix/profile/bin`);
   - WebSearch/WebFetch the harness's **official** docs for: MCP support
     (does the agent *call* tools, not just register them), tool-approval /
     permission callbacks, hooks, plugins/extensions, plan mode, and the
     headless-vs-interactive invocations.
   Return per kind (permission / question / plan) **× mode** (headless /
   interactive): `native-hook(<method>)` | `mcp` | `extension` | `none` | `unknown`,
   each with a citation + a confidence (`low` ⇒ say "unverified", never guess).

3. **Synthesize** — rebuild the matrix; re-derive the tiers (1 wired · 2 capable-via
   MCP/hook · 2-ext capable-via-extension-no-MCP · 3 structurally blocked); re-test
   the "generic interaction MCP server" enabler against the data (which harnesses it
   reaches vs needs a native hook vs an extension shim vs is impossible).

4. **Update the doc** — refresh each row + its **Audited** date, the tiers, the
   enabler section, the BYO answer, and the open live-tests. Reconcile against
   `interaction-coverage.md` (declared kinds) and fix any divergence.

5. **Verify** — run `node scripts/check-processes.mjs`; commit on a branch; open a
   PR via `gh-drew`.

## The shape of the answer

Two run modes per harness: **headless** (structured broker, remote app answers — the
hard surface) and **interactive** (native TUI in a PTY, human answers — works for
free where a TUI exists). The matrix's value is the headless column. The single
highest-leverage build is a generic interaction MCP server
(`request_permission`/`ask_user`/`request_plan` → the broker); it is a *majority*
unlock, paired with native hooks (codex/opencode/acp permission) and an extension
shim for the MCP-refusers (pi, openclaw).

## Then consider

- After updating the matrix, if a harness moved into Tier 2 (capable, unwired),
  surface it as a candidate for the next wiring PR and note it on `ROADMAP.md`.
- If an open live-test is now closeable (e.g. acp MCP-injection, amp/forge MCP
  call-semantics), run that one e2e before trusting the cell.
