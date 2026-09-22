# Handoff — ADC: what is NOT done, measured — 2026-09-04 ~07:00Z

Repo `~/webb/agent-dev-container` (main checkout detached). Open loops table: **14 rows**.
Read `2026-09-04-adc-launch-close-billing-truth.md` (reflection) + `2026-09-03-adc-prod-deploy-staging-release-wedge.md` first.

## The question this brief answers
Drew: "what isn't done yet, for real — months in, how do we get this live for customers?"

## The honest frame, verified at write time
**The product IS live and customers can use it.** Canary job "Can a customer buy a sandbox": SUCCESS in the latest run (33845217705), production AND staging, as it was 10/10 all night — create 1.5s, agent chat 6.6s, desktop control. Production serves `f77685517bdd` on both orchestrator and sandbox (consistent, deploy concluded SUCCESS — deploys land now that the benchmark is advisory).
What has eaten the months is NOT the product path. It is the operational shell: gauges that lied in both directions, releases that could not land, billing edges that leaked silently, and monitors so decayed that every session re-derives "is it working" from scratch. Tonight fixed the lying-gauge layer; the remainder is the finite list below.

## Canary red ≠ outage (current)
Run-level canary failures (6 of 6 latest) are the NEW #6850 ratio rule firing honestly on the compute-heartbeat leg: "42 failed vs 18 delivered in the window". Live split since boot (orchestrator /health, 06:50Z): delivered 3904, rejected 4941, not_found 2816, transport_error 41, zero_billed 2; lastDelivered 10s ago. "Is claimed compute reaching the ledger": SUCCESS — the charge-intent queue drains (rejected class settles ~5 min late by design via settle-batch replay, verified 2026-09-03 with an 8-sample head-advance measurement).

## NOT DONE — the real list (ranked by customer impact)
| # | Item | State | Evidence | Next command / fix |
|---|---|---|---|---|
| 1 | Heartbeat live path majority-fails: rejected 4941 (settles late, by design-flaw) + not_found 2816 (pre-fix branch children never bill until recreated — #6864 journals only NEW children) | open, alarmed honestly now | /health computeHeartbeat 06:50Z | two fixes: (a) present settlement evidence on FIRST attempt (kills the 403 storm at root — `d1-usage-service.ts:2306` gate), (b) one-shot backfill/restart of pre-fix branch children |
| 2 | Promotion cancels in-flight deploy ⇒ half-deployed prod (Worker+D1 ahead of fleet, ~2h on 09-03; 8 of last 12 deploys cancelled) | open, ops task filed w/ 3 data points | jobs of run 33811135689; 6/6 vs curl split | make deploy mutating stages non-cancellable once entered, or rollback-on-cancel; interim: hold-promotion label (proven 09-04) |
| 3 | Partner onboarding docs point at DEAD hostnames: `platform.tangle.tools` (no DNS) in `products/intelligence/PARTNERS.md` signin/keys links; `api.tangle.tools` default in `intelligence/api/src/server.ts:197` | open — customers sent to nowhere | dig NOERROR-empty (09-03 audit) | fix links to id.tangle.tools; kill the dead default |
| 4 | Verification fleet decayed: release-verification red (Firecracker node-pty gate), live-e2e failing in 0s (broken workflow), alarm-heartbeat (meta-monitor) failing 13s, env-readiness red, staging-readiness 3/3 fail | open | run list per workflow 09-04 | triage each: fix or explicitly retire; a monitor red >7d is a decision nobody made |
| 5 | Entitlement notServed:1 — a PAYING customer not served ≥2 days | open, issue #6742, 0 comments | id/health entitlementDrift | human reads the subscription row; needs platform DB access |
| 6 | Staging charge-intent backlog depth 3922 / oldest 12.8d (09-03 reading, unverified since; prod-side gauge+alarm shipped in #6849/#6863 but staging depth unknown) | open | 09-03 brief loop 7 | curl staging-sandbox /health, read all three queues |
| 7 | deploy-platform post-deploy smoke reds on CONCURRENT_LIMIT (shared smoke account capped at 1 session) | open | runs 33811052322, 33807340849 | dedicated smoke identity or session cleanup before smoke |
| 8 | Canary + deploy share starved ci-linux (12) while 3 ci-release idle | open, 2 ops tasks (split correctly) | org runners API 09-03 | move canary to ci-release; map ci-heavy before touching deploy |
| 9 | Dedicated host-agent boxes still single-source ingress guard | untouched since 09-03 | 09-03 brief loop 4 | re-run host setup `--edge-ingress-ip 95.217.35.250` via CI job |
| 10 | SSH key audit on 6 dedicated boxes | untouched | 09-03 loop 5 | from GTR-Pro: `ssh root@<ip> 'bash -s' < ssh-inventory.sh` |
| 11 | tangle-backup script drift on 3 hosts (running a revision no commit holds) | untouched | 09-03 loop 6 | reconcile `~/company/devops/archive/host-drift-2026-09-01/` into devops main |
| 12 | toml advisory residual: @effect/cli pins toml ^3.0.0 through latest 0.77.0 | tracked upstream, dated disposition | #6876 body | watch upstream; nothing local |
| 13 | git data layer → sandbox-ui when 2nd consumer appears | deferred by design | 09-03 loop 9 | none until trigger |
| 14 | `gh pr edit --add-label` silently no-ops (Projects-classic GraphQL deprecation) — any automation using it is broken repo-wide | open, workaround known | label read-back 09-04 | use REST `POST issues/N/labels`; grep workflows for pr edit --add-label |

## The 2-week shape to "trustably live" (recommendation, not a promise)
Week 1 — money + landing: item 1 (both fixes), item 2 (non-cancellable stages), item 6 (staging backlog read + drain). Exit: heartbeat delivered > failed; 5 consecutive deploys land.
Week 2 — trust + front door: item 4 (monitor triage, fix-or-retire each), items 3+5+7 (onboarding path + entitlement + platform smoke). Exit: zero red monitors older than 7 days; a partner can follow PARTNERS.md end to end.
Items 8–11 ride alongside as single-PR/ops tasks.

## Live lanes
**None.** Every watcher/agent from this session is terminal. Cut #6895 (Release 20260904, f37cd1b34..5e21d043c) is open and unheld — normal machinery, no action of mine pending on it.

## Standing decisions + kill conditions
- Benchmark is advisory on deploys (#6848). KILL WHEN a real perf regression ships that the advisory would have caught — then make it a verdict job with a calibrated threshold instead.
- hold-promotion is the manual guard for deploy convergence. KILL WHEN item 2 ships.
- Rejected-heartbeat 403s are "working as designed" (settle ~5 min late). KILL WHEN item 1a ships evidence-on-first-attempt — then any 403 is a real fault again.
- @effect/cli toml stays 3.x. KILL WHEN upstream declares ^4 or a repo test exercises its TOML parsing.

## Operator corrections paid this session — do not pay twice
- "customers are not being billed" — said to Drew, wrong twice over; the truth needed measurement (late-settle + narrow leak). Lead with the measured claim or say "unverified".
- Five wrong-layer reads (run-status vs jobs, platform vs orchestrator surface, truncated line, cancel-submitted≠cancelled, false causation). Rule: claim from the layer the claim is about; re-read after every mutation.
- Sent a peer session hunting phantom wedged runners; the load was my own release CI. Check your own footprint first.

## Uncertain at close
- Why the #6875 promotion's cancel killed the force-dispatch but not my auto-dispatch (concurrency bucketing by inputs is a guess).
- Whether not_found 2816 is ALL pre-fix branch children or hides a second sub-class — needs one id traced end to end.
- Whether live-e2e/alarm-heartbeat fail for content reasons or broken workflow files (0s/13s durations suggest the latter).
