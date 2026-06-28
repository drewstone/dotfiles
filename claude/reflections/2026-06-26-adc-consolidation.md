# Reflect: agent-dev-container — consolidation audit + session
Date: 2026-06-26

## Scope
Long multi-thread session: staging model-token outage → local-preflight system → audit of rapid merges → XDG lift (#2769) → this consolidation hunt.

## Run grade: 8.5/10
- Goal achievement 9 — every ask shipped + merged (#2730/2735/2736/2738/2741/2745/2746→2751/2763/2769) and 2 broken develop gates fixed in passing.
- Code quality 9 — extractions are tested + behavior-preserving; verification gates caught 3 wrong hypotheses (secret-emptied, DEV_AUTH_BYPASS, audit mediums all downgraded on verify).
- Efficiency 7 — auto-merge stranded a fix once (#2736→#2738 re-land); I introduced a small dup (readBoolEnv) during #2736 that this audit caught. Workflow rate-limited once (finished by hand).
- Discernment 9 — correctly did NOT copy XDG to every harness (they're already consolidated via cli-base).

## Consolidation opportunities (ranked, grep-verified)
1. `sleep` → @repo/shared — 13+ identical reimpls, none shared. S, now.
2. CI invariant test-harness → scripts/lib — 16/16 check-*.test.mjs duplicate test/assert/tmpdir+spawnSync (3429 lines). S/M, now.
3. deploy.yml composite actions — SEED_PRODUCTS jq ×5, ssh-agent ×3. M, later.
4. readBoolEnv + resolveEgressEnabled → shared — 2× + 17 flag sites. S, now.
5. Egress credential-swap contract — 12 files/3 services; design pass not quick lift. L.
NEGATIVE: harnesses already consolidated via cli-base — don't chase.

## Patterns
- "Fix the class, not the instance" recurred (model-credentials #2736, XDG #2769, preflight catching broken gates).
- Rapid-merge env broke develop gates twice (AGENTS/CLAUDE parity, sdk-arch allowlist) — the local preflight is the systemic fix.
- My own extraction seeded a micro-dup (readBoolEnv) — extractions need a "did I just duplicate a trivial util?" check.

## Next
Lift #1 (sleep) + #2 (test-harness) are S-effort clean wins. #5 (egress contract) needs a design pass before touching.
