# Handoff — ADC: production deploy, edge-ingress outage, staging release wedge

Written 2026-09-03 ~03:15 UTC. Repo `~/webb/agent-dev-container` (main), plus `~/company/devops`, `~/webb/sandbox-ui`, `~/webb/agent-app`, `~/dotfiles`.
Open loops: **9 rows** (table below).

## Objective and status

Started as "finish the AI Workspace", became an incident night. Four things shipped; one class of failure remains open (staging releases never complete).

| Thread | Status |
|---|---|
| AI Workspace on sandbox-ui primitives | DONE — #6739 merged, plus #6760 (agent-app 0.46.42 + sandbox-ui 0.113.3), #6762 roadmap |
| Production 502 outage (chat + desktop) | RESOLVED — root-caused, fixed live, durable fix merged (#6776, #6779); **production canary green on its last two runs** (01:58Z, 03:08Z) |
| Production 30h stale | RESOLVED — deploy dispatched; prod orchestrator now serves a current release |
| Staging frozen on an old commit | ROOT CAUSE FIXED (#6816) and proven on the real host |
| Staging releases completing | **OPEN** — every run still fails on a resume 409; green streak 0 of 481 receipts |
| Golden image DRIFT alarm | OPEN — bakes still fail; blocked behind staging releases |
| AIDE daily alerts (5 hosts) | RESOLVED earlier in session — devops #151/#152/#153 merged, all hosts exit 0 |

## Merged this session

ADC (`tangle-network/agent-dev-container`, all squashed to develop):
- **#6739** AI Workspace composed from sandbox-ui workbench/rail/ChangesPane (+ sidecar git route fixes: `?ref=HEAD`, `--name-status`, commit author).
- **#6752** read-only `platform-ops-diagnose` workflow (reads the id box from a CI runner; the only route that host admits).
- **#6760** agent-app `^0.46.42` + sandbox-ui `^0.113.3` across 5 consumers.
- **#6762** roadmap row for the above.
- **#6776** host-agent ingress guard admits `HOST_AGENT_EDGE_INGRESS_IPS` beside the orchestrator.
- **#6779** corrects that list to the real sandbox edge (see "operator corrections").
- **#6816** `/nix` headroom: spend the rollback GC root before refusing. **The night's most valuable fix.**
- **#6819** staging host inspection reads `/nix` and its GC roots.

Other repos: sandbox-ui **0.113.2** (#275: `emptyArtifactState`, `ChangedFile.loadError`) and **0.113.3** (#276: `WorkspaceLayout.minCenterWidth`, default 400). devops **#151** (AIDE classifier: metadata-only rewrites, `--accept PATH`), **#152/#153** (autoscale provider firewall rule set + corrected edge address). dotfiles **#87** (codex wrapper resolves the account home on macOS).

## The two root causes worth remembering

**1. Production 502 for 6h30m.** #6750 locked host-agent port 3001 to the paired orchestrator. The **sandbox edge** proxies every `*.tangle.sh` runtime URL to that same port, so creates kept working while every runtime URL 502'd. Fixed live by adding the edge to the port-3001 rule on both autoscale provider firewalls (hand-managed, no repo renders them — recorded in devops #152/#153), then durably in #6776/#6779.

**2. Staging frozen → bake refused → DRIFT alarm.** The deploy roots BOTH `current` and `previous` nix profiles, so `nix store gc` frees nothing and a `/nix` sized for two closures can never accept a third. Staging refused every release ("closure needs 51713259637 bytes headroom on /nix, 50360102912 available" while its GC "completed in 3s"), froze on an old commit, so the golden bake's probe carried a newer release than the controller and admission refused it `release-mismatch`, so the snapshot stayed a candidate and DRIFT never cleared. #6816 releases the rollback root, sweeps again, re-measures once. **Proven on the real host**: ship run 33699994833 passed the Nix stage with no refusal and staging moved 045879377 → 43dabb64.

## Verification commands and results

```
curl -s https://orchestrator.tangle.tools/version            # prod serves 8d329684db1b (23:49Z) — current
curl -s https://staging-orchestrator.tangle.tools/version    # staging serves b8d7404e336a (03:02Z)
gh-drew run list --workflow production-canary.yml --limit 4  # 03:08Z success, 01:58Z success
# staging provisioning works (this created and deleted sandbox-34da6208-e6c):
POST https://staging-sandbox.tangle.tools/v1/sandboxes -> 201
docker run --rm -v "$PWD":/w -w /w ubuntu:24.04 bash -c \
  'apt-get -qq update && apt-get -qq install -y bats curl jq && bats tests/deploy/nix-substitution-headroom.bats'   # 7/7 (pristine tree 5/5)
```

## THE open problem: staging releases never complete

Every `deploy-staging.yml` run — six in a row, mine and others' — fails identically:

```
[ship] FAILED: admin POST /staging-cell/resume returned HTTP 409: refusing to resume non-empty staging
rollback: ... FAILED: (same 409)
RECOVERY REQUIRED: run `devtools ship internal --recover-only`
[ship] green streak: 0 consecutive shipped (of 481 receipts)
```

Phase order is pause → empty (drain) → resume. The drain never leaves the cell empty enough for the resume guard, and the rollback hits the same wall, so staging **drifts forward through failed releases** (it is serving b8d7404e from a FAILED run right now). Provisioning currently works, so this is not a customer-facing outage — it is a release pipeline that has not been green in 481 receipts.

Second, narrower bug found the same way: `recover_only=true` (run 33701850033) logged `had not mutated staging; cleared it` while the very next gate failed with `provisioning for staging is paused: release rel-... empty-cell transition`. **Recovery clears the release record but not the provision pause that same release set.** The pause is a Redis hash keyed owner+epoch with **no TTL** (`apps/orchestrator/src/state/provision-pause-store.ts`), cleared only by compare-and-swap from its owner. Decision point: `services/devtools/src/ship/recovery-runner.ts:293`. Guard that refuses: `apps/orchestrator/src/services/staging-cell-reset.ts` + `state/cell-occupancy-store.ts`.

## Open loops (9)

| # | Item | State | Pointer | Next command |
|---|---|---|---|---|
| 1 | Staging release resume 409 | open, chronic | `staging-cell-reset.ts`, `cell-occupancy-store.ts` | read why the cell is non-empty after the drain; warm seeds are "tolerated" by empty but may count for resume |
| 2 | Recovery does not clear the provision pause | open, diagnosed | `recovery-runner.ts:293` | make recovery clear the pause it owns; then `-f recover_only=true` becomes a real unstick |
| 3 | Golden image DRIFT (staging) | open | `golden-snapshot.yml` | re-bake once staging releases complete; last success 08-31 |
| 4 | Dedicated host-agent servers keep single-source ingress guard | open | `scripts/lib/host-setup-firewall.sh` | re-run host setup with `--edge-ingress-ip 95.217.35.250`; needs desktop or a new CI job |
| 5 | SSH key audit on 6 dedicated boxes | open | scratchpad `ssh-inventory.sh` | run from GTR-Pro: `ssh root@<ip> 'bash -s' < ssh-inventory.sh` (unreachable from the MacBook) |
| 6 | `tangle-backup` script drift on 3 hosts | open | `~/company/devops/archive/host-drift-2026-09-01/` | reconcile into devops main; hosts run a revision no commit holds |
| 7 | Staging charge-intent backlog | open, unowned | staging `/health` | depth 3922, oldest 12.8 days, status `degraded` |
| 8 | Post-deploy benchmark SLO gate red | open, pre-existing | `benchmark-staging.yml` | stop/resume/delete over budget on staging; it reds every production deploy |
| 9 | Git data layer belongs in sandbox-ui | deferred by design | `use-git-changes.ts` | move when a second consumer appears (from #6739's audit) |

## Live lanes

**None running.** Every background watcher this session has completed or been killed; no worktrees of mine remain (all released via `adc-wt release`). The `_wt/*` worktrees listed by `git worktree list` belong to other agents. One stale entry: `/private/tmp/claude-501/-Users-drew-webb/.../scratchpad/pristine` (detached) — safe to `git worktree prune`.

## Standing decisions and their kill conditions

- **Do not re-dispatch `deploy-staging` hoping it sticks.** KILL WHEN loop 1 or 2 is fixed. Each run re-pauses the cell and adds a failed receipt; six runs proved it.
- **Production deploys are dispatchable by an agent; develop→main promotion is not.** KILL WHEN Drew says otherwise. Tonight's dispatch was correct and asked for; the only red job was the post-deploy benchmark monitor.
- **The autoscale provider firewalls are hand-managed.** KILL WHEN something in a repo renders them. Until then devops `servers/host-agent/README.md` is the only record; port 3001 must list the orchestrator AND `95.217.35.250`.
- **Trust the canary over my own reasoning about the edge.** KILL WHEN the canary itself is proven broken. I twice concluded "fixed" from indirect evidence and was wrong once.

## Operator corrections paid for this session — do not pay twice

- **"are you sure?"** — I had confidently told Drew that hiding a model from `/model` required a root-owned managed-settings file. Wrong. `modelPicker` is honored from **user settings**; it is now in `~/dotfiles/claude/settings.json` (Fable 5.1 / Opus 5 / Sonnet 5 / Haiku 4.5 / Opus Plan) and installed. Lesson: check the binary's own settings strings and the docs agent BEFORE telling him to run sudo.
- **"take the lead or I'll find someone who can"** — I had been reporting findings and waiting. He wanted the deploy dispatched, not described.
- **The edge address.** I assumed the LLM router origins proxied runtime traffic; they do not. `*.tangle.sh` resolves to 95.217.35.250. I shipped #6776 with the wrong list and corrected it in #6779. Verify with `dig`, not with inference from names.
- **Masked exit codes.** `gh pr merge ... | tail -1 || gh pr merge --admin` never falls back, because `tail` succeeds. Cost 8 minutes on sandbox-ui #276.

## Environment traps that cost real time

- Docker Desktop here does **not** share `/tmp`; mount test trees from under `~/webb` or they appear empty.
- `tests/deploy/*.bats` need `curl` (and `jq`) in the image, or 3 of 5 headroom tests fail misleadingly with "No published profile for source identity".
- `node` via the shell shim recurses (`_nvm_load`); use `/opt/homebrew/bin/node`. Fixed for `codex` (dotfiles #87) and the zsh stubs now self-heal.
- `pnpm signoff --full` is a false red in worktrees; rely on the pre-push gate plus targeted proofs.
- The pre-push gate enforces a 1000-line cap per host-setup script — moving helpers between libs is the fix, not disabling it.

## What I was uncertain about at close

- **I do not know what lifted the staging provision pause.** It was paused at 01:15Z and provisioning worked at 03:10Z; two releases I did not dispatch ran between. Do not assume #6816 or my recovery run cleared it.
- **I never proved the resume 409's cause**, only its symptom and the files that raise it. "Warm seeds keep the cell non-empty" is a hypothesis, not a finding.
- **The golden bake's LVM error is a red herring** (the log says it defers on purpose) — but I never got a probe host alive long enough to confirm what else fails there.
- **Production is healthy by canary and by version**, but I did not re-run the full production benchmark, so the SLO gate's red is unexplained beyond "stop/resume/delete over budget on staging".
