# Reflect: agent-dev-container runtime scaling and provider parity
Date: 2026-04-24

## Run Grade: 8.8/10
| Dimension | Score | Evidence |
|---|---:|---|
| Goal achievement | 9 | PR #845 was opened from develop with modular autoscale providers, host-capacity batch semantics, shared Nix profile resolution, host-agent egress startup fixes, and Firecracker runtime parity. Docker host-agent E2E, Docker Nix integration, and real Firecracker E2E passed. |
| Code quality | 9 | Shared profile logic moved into `@repo/shared`, provider selection is modular, batch capacity math is explicit, egress registration fails closed, and Firecracker health stayed authenticated instead of weakening sidecar auth. |
| Efficiency | 7 | The session recovered well after context loss, but the branch bundled several concerns and spent time debugging stale rootfs, missing `iproute2`, and auth health mismatches that should become preflight checks. |
| Self-correction | 9 | Failures were not dismissed as pre-existing. Root causes were isolated: broken `/nix/profile/bin` symlink, stale rootfs, missing loopback tooling, and unauthenticated Firecracker health probes. |
| Learning | 9 | The run produced concrete architecture and operational learnings, especially that provider abstractions are not done until one-host canaries prove credentials, teardown, pricing, and host-agent registration. |
| Overall | 8.8 | Strong runtime proof for Docker/host-agent/Firecracker paths, but not a 10 until paid cloud provider canaries and spend guardrails run end-to-end. |

## Session Flow Analysis
1. Lost session recovery -> reconstruct prior PR state, preserve original dirty checkout, continue in isolated worktree -> PR #845 pushed from a clean branch.
2. Scaling question -> correct the mental model from "5000 hosts" to "5000 sandboxes divided by host capacity" -> batch scale-up now computes required hosts from sandbox slots.
3. Provider strategy -> compare Hetzner and spot VM direction -> add reusable Hetzner/GCP/AWS/Azure provider interfaces and cheapest-provider selection.
4. Nix architecture -> reject per-container ad hoc installs -> resolve one host-baked Nix profile into a stable store-backed mount shared by Docker, host-agent, and Firecracker.
5. Real E2E hardening -> run actual Docker and Firecracker paths -> fix runtime defects instead of adding mocks or test bypasses.
6. Publish discipline -> run targeted gates, format/type/build checks, commit, push, and open draft PR -> remaining boundary is provider canary, not local runtime proof.

## Project Health
Trajectory: improving. The runtime architecture is converging on shared capabilities instead of separate driver folklore.

Test coverage: meaningful on touched paths. The important gates were real Docker host-agent egress, Docker Nix profile integration, and real Firecracker VM boot/health. The missing proof is paid cloud lifecycle canary coverage.

Architecture: cleaner than before. Shared Nix profile resolution is now canonical, egress registration moved to the correct lifecycle point, and autoscale provider selection is explicit. The risk is PR breadth: autoscale provider selection, runtime parity, Nix profile, and Firecracker rootfs changes are coupled in one branch.

Next highest-value action: build a spend-capped provider canary harness that creates one host per enabled provider, waits for host-agent registration, schedules 1-5 real sandboxes, captures artifacts, and tears down with a hard cost ceiling.

## Cross-Project Patterns
- The operator consistently rejects fake success, silent fallbacks, and "pre-existing failure" framing. The working style must prove real paths or explicitly name the boundary.
- Tangle projects repeatedly need shared primitives before scale: profile mounting, auth, SSE, driver capability flags, and cleanup semantics become expensive when each runtime reimplements them.
- Cost and reliability questions are product questions, not just infra questions. A 5000-sandbox run needs pricing, spend gates, trace capture, artifact retention, and scoring before it needs more hosts.
- Big branches become necessary when runtime boundaries are wrong, but the follow-up should split validation and rollout into narrow PRs.

## Skill Effectiveness
- `github:yeet` was effective for publishing once the branch was already validated. It should be paired with a pre-PR evidence checklist so the PR body includes exact gates, commit SHA, and honest boundaries.
- The dotfiles `reflect` skill is useful but not registered in the active Codex skill list. That caused an extra discovery step. It should be installed or linked into the agent-visible skills directory.
- The repo's AGENTS discipline is working: targeted real-infra tests found actual runtime bugs that unit mocks would not have caught.

## Product Signals
- Customers running large agent evaluations will pay for "capacity as a verified batch primitive": request N sandbox slots, get price, capacity plan, run, artifacts, traces, and teardown guarantees.
- Provider arbitrage is valuable only if it is safe. "Cheapest provider" must include hard spend caps, quota checks, boot latency, failure rate, host capacity, and cleanup success rate.
- The artifact/query story is the durable product value. The proposed 5000-sandbox run is not just compute; it is a data factory for traces, filesystem snapshots, harness outcomes, and model-improvement signals.

## Proposed Automations
- Add `tangle-admin capacity canary --providers hetzner,gcp-spot,aws-spot,azure-spot --sandboxes 1 --max-usd X` to prove create/register/run/capture/teardown per provider.
- Add `tangle-admin batch quote --sandboxes 5000 --duration 1h --host-capacity N` that emits provider-ranked cost, host count, quota requirements, and expected teardown liability.
- Add rootfs/profile preflight to catch missing guest tools, stale rootfs images, broken Nix symlinks, and unauthenticated health probes before Firecracker E2E starts.
- Add PR evidence generation that writes exact commands, counts, artifacts, and known boundaries into the PR body before ready-for-review.

## Action Items
1. Build the provider canary harness with spend caps and artifact output.
2. Run one-host canaries for configured providers before broad scale testing.
3. Add live or cached pricing inputs with timestamped quote artifacts.
4. Split follow-up PRs by rollout surface: provider canary CLI, pricing/quote UX, large-batch artifact capture, and PR #845 review fixes.
5. Register the dotfiles `reflect` skill with the active Codex skills path so future "reflect" requests do not require manual discovery.

Next: run `/pursue` with thesis: "large sandbox runs need a spend-capped provider canary and quote path before scale." Baseline is PR #845 plus zero paid-provider E2E canaries; success is one real host create/register/run/capture/teardown per enabled provider under a hard max USD ceiling.
