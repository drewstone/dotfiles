---
name: slack-alerts
description: Read #infra-alerts and #router-alerts yourself, map every recurring message to the code or host unit that posts it, fix the cause, and prove the next post is green. Use when Drew says "resolve slack errors", "the slack messages never get updated", "I still see X in infra alerts", or asks whether an alert is real.
---

# slack-alerts

**Read the channels first. Never ask for a paste.** The Slack MCP tools are wired into every session: `slack_read_channel` reads a channel by id, `slack_read_thread` a thread, `slack_search_public_and_private` across channels. A summary Drew types is a lossy copy of a channel you can read yourself.

| channel | id | who posts there |
|---|---|---|
| `#infra-alerts` | `C0B9LBV73HU` | agent-dev-container GitHub workflows, through `.github/actions/infra-alert` |
| `#router-alerts` | `C0BBK4C512T` | host systemd units on the dedicated boxes, CI runner health, the router's upstream-error alerts |

`slack_read_channel` returns newest first and 40 messages fit one call. Read at least 40 per channel, then cluster by the bold title: the same title recurring daily is one problem, not many.

## The one rule

**A webhook message cannot be edited or deleted.** "Make the old messages go away" means: change or stop the producer, then watch the NEXT post. Every fix below ends with a link to the post that proves it, or with the absence of the daily repeat across one full cycle.

## Producer map

Titles are the bold first line of the message. The fix lives in the producer, never in Slack.

| title contains | producer | cadence | how to verify a fix |
|---|---|---|---|
| `Lifecycle waterfall` (was `Create waterfall`) | agent-dev-container `.github/workflows/lifecycle-waterfall.yml` + `scripts/lifecycle-waterfall-{probe,slack,verdict}.mjs` | every 6h, `production-canary` env | dispatch it with `gh-drew workflow run lifecycle-waterfall.yml`; a dispatch always posts |
| `Production canary` | agent-dev-container `production-canary.yml` | every 10 min | next run posts `RESOLVED` under the same alarm key |
| `coordinate-production-release`, `Production deploy failed`, `Stale build on production`, `Host asset drift`, `Production watchdogs` | agent-dev-container release and deploy alarms (`coordinate-production-release`, `deploy.yml`, `serving-staleness-alarm.yml`, `host-drift-alarm.yml`, `alarm-heartbeat.yml`) | on release and hourly | the ledger issue the alarm opened closes with one `RESOLVED` post |
| `Entitlement drift on id.tangle.tools` | agent-dev-container `entitlement-drift-alarm.yml`; remedy is `platform-admin audit-entitlements` | hourly | the counter line stops saying `NOT SELF-CLEARING` |
| `runtime intrusion detection`, `Falco` | agent-dev-container `fleet-falco-coverage.yml`, `fleet-falco-remediate.yml` | every 6h | `Every registered production docker host runs Falco` |
| `compute-heartbeat leg` | agent-dev-container orchestrator health alarm | hourly | `is delivering` post |
| `Tangle backup failure on <host>` | the host's `tangle-backup*.service` (`OnFailure=tangle-backup-alert@.service`); code in devops `scripts/tangle-backup.sh`, alert in `servers/platform/tangle-backup-alert.sh` | nightly ~03:30Z | the next nightly run logs `snapshot` and no alert; repository inventory is `tangle/policies/backup-policy.md` |
| `Tangle AIDE file integrity alert on <host>` | the host's `tangle-aide-check.timer` (02:00 daily); devops `servers/_shared/aide/` | nightly | after a reviewed `aide-verified-rebaseline.sh`, the next check exits 0 and posts nothing |
| `CI Runner Alert` | devops `tangle/scripts/runner-healthcheck.sh` | hourly | `CI Runner Alert RESOLVED` |
| `Production OK · ai.tangle.tools` | blueprint-agent production canary (`tangle-ops status` reads it) | hourly | not an error |
| provider or model named, `runbook` link | tangle-router `lib/ops-alert.ts` (coalesced, 20 posts/h cap) | on upstream error | the coalesce window closes quietly |

## The hosts are not reachable from this Mac

The dedicated hosts admit SSH only from `admin-gtr` (Drew's GTR box) and the two CI runners (devops `servers/_shared/host-firewall/sources.tsv`). `ssh root@<host>` from the laptop times out and that is the firewall working, not a dead host.

Read a host through CI instead: agent-dev-container `.github/workflows/platform-ops-diagnose.yml` runs read-only probes (`backup`, `firewall`, `aide`, `ssh-access`) on a chosen host from a runner the firewall admits.

```bash
gh-drew workflow run platform-ops-diagnose.yml -f host=production-orchestrator-01 -f probe=backup
gh-drew run list --workflow platform-ops-diagnose.yml --limit 3
gh-drew run view <run-id> --log
```

A change on a host (re-baseline, firewall rule, unit restart) goes through a reviewed devops change and the deploy path, never through a probe.

## Procedure

1. Read both channels (40+ messages each). Cluster by title. Note the newest timestamp per cluster and whether a `RESOLVED` follows.
2. For each open cluster, open the producer from the map. Read its last run log (`gh-drew run view --log`) or the host journal through the probe. Name the cause in one line with the log line that proves it.
3. Fix the cause in the producer's repo. agent-dev-container PRs target `develop`; devops changes go to `main`. A change to an alarm's message text is a producer change too.
4. Prove it on the real path: dispatch the workflow, or wait for the next scheduled run, and link the post. For a host unit, link the probe run whose journal shows the unit succeeding.
5. Report per cluster: title, cause, fix (PR), proof (post or run link). A cluster you could not close says what blocked it.

## Traps

- **A scheduled workflow runs from the default branch.** In agent-dev-container that is `develop`. A job with `environment: production` admits `main` only, so a scheduled alarm that needs it dies silently. Check the environment's branch policy before trusting a cron.
- **Renaming a workflow file orphans its alarm ledger.** The `infra-alert` action keys incidents by `alarm-key`; keep the key when the file moves, or the old incident never resolves.
- **A dispatch always posts; a scheduled run may withhold.** The waterfall verdict mutes a scheduled run that stayed inside its 7-day baseline. Silence after a schedule is not a broken workflow; read the run's step summary.
- **AIDE re-baselining is manual by design.** The apt hook is inert on purpose so a package upgrade cannot bless a change. `aide-verified-rebaseline.sh --dry-run` classifies every path; only explained paths may be accepted, and `/etc/ssh/sshd_config` outside the allowlist is a real finding until a reviewer reads the diff.
- **Backups fail on the wire before they fail on disk.** Every restic repository is reached over SSH between hosts. A `repository access failed destination=primary` line after a firewall change is the firewall, not restic; the `firewall` probe shows whether the client's address is admitted on 22.

## Then consider

- `tangle-ops` when a cluster is a red production canary or a deploy failure: it reads the failing step, not the job.
- `deploy-proof` when the fix shipped and the question is whether production serves it.
