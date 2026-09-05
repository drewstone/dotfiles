# Infrastructure producer discovery

Use the title, incident key, run URL, and source revision in the alert to find the current producer.
Search the current repository when a filename or title has changed.

| Alert family | Source to inspect |
|---|---|
| Platform canary, deploy, drift, heartbeat, entitlement, or fleet coverage | [agent-dev-container workflows](https://github.com/tangle-network/agent-dev-container/tree/develop/.github/workflows) and [shared alert action](https://github.com/tangle-network/agent-dev-container/tree/develop/.github/actions/infra-alert) |
| Backup failure | [devops backup alert](https://github.com/drewstone/tangle-devops/blob/main/servers/platform/tangle-backup-alert.sh), the referenced host unit, and the owning backup policy |
| AIDE integrity change | [reviewed integrity procedure](https://github.com/drewstone/tangle-devops/tree/main/servers/_shared/aide) and the host journal |
| CI runner health | [runner health check](https://github.com/drewstone/tangle-devops/blob/main/tangle/scripts/runner-healthcheck.sh) |
| Upstream provider or model error | [router alert producer](https://github.com/tangle-network/tangle-router/blob/main/lib/ops-alert.ts) |

For restricted hosts, inspect the current [allowed administration sources](https://github.com/drewstone/tangle-devops/blob/main/servers/_shared/host-firewall/sources.tsv).
Use the maintained [platform diagnosis workflow](https://github.com/tangle-network/agent-dev-container/blob/develop/.github/workflows/platform-ops-diagnose.yml) when it provides the needed read-only probe.
Read its current host and probe inputs before dispatch.
An SSH timeout from an unapproved source does not establish host failure.

Check the repository's actual default branch and environment branch policy when a scheduled job cannot run.
Inspect suppression and resolution logic before interpreting silence.
For integrity alerts, explain changed paths before accepting a new baseline.
For backup connection failures after firewall changes, test the required network path before blaming the backup store.
