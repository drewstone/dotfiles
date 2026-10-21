# Beelink deploy memory isolation — 2026-10-21

Owner: `adc-deploy-runner-priority`; release owner: b5. The outcome is zero deploy-job kills under concurrent gate load. The memory policy is served by [`beelink-memory-policy`](../cgroup/beelink-memory-policy); the existing [`host/install.sh --gate-priority-only`](../install.sh) installs and applies it without restarting Actions runners. Read current values with the policy's `--check`, not from this dated record.

## The reported incident was not shown to be OOM

Agent-container production run [39626488314](https://github.com/tangle-network/agent-container/actions/runs/39626488314) failed before shipping. The 15:30–15:45Z WSL kernel journal, retained kernel log and current kernel ring contained no matching OOM entry. Before this lane's synthetic test, `memory.events` reported zero `oom` / `oom_kill` in deploy, CI and both gate cgroups. There is no retained per-minute memory sample for that window; current free memory is not historical evidence.

| Job | Actual evidence |
| --- | --- |
| Deploy Preflight, 119313833708 | `deploy-ref-current` reported `gateExit=137`; the step ran 15:37:53–15:38:15Z. |
| D1 Converge, 119313834034 | `deploy-ref-read read=origin/main attempt=1 transport_exit=137 elapsed_seconds=21`, at 15:40:08Z. |
| Build Agent Runtime, 119313833997 | At 15:42:28Z, `ERR_PNPM_CANNOT_RESOLVE_WORKSPACE_PROTOCOL`: `@products/intelligence-api` was not installed in the image's pack context. BuildKit exited 1. |

The deploy-ref reader's source at agent-container `origin/develop` (`414a93e3dc` at investigation) is `scripts/lib/host-agent-rollout-placement.sh`: line 74 gives Git fetch a 20-second budget; line 95 invokes `timeout --signal=KILL`. The observed 21-second transport exit is consistent with that deadline, not evidence that the kernel OOM-killed the deploy. The exact cause of the slow Git transport is unmeasured. b5 retains the fetch-deadline and image-pack dependency repairs with their existing release/image owners; this memory change does not claim to repair them.

## The independently confirmed protection gap

Before application, normal and dev gate groups were uncapped and had peaked at about 53.1 and 24.1 GiB respectively. Deploy runner services had no memory floor. Release Type Check and deploy services shared a 32 GiB ancestor; adding a floor alone would not prevent that ancestor from exhausting. Rootless image containers also use the production account's user manager, outside deploy service cgroups.

The policy caps both gate groups, caps release service compilation, protects both ADC deploy services and their ancestor path, and carries the shared production Docker floor through its daemon and actual container-scope paths. The ancestor allowance retains the former deploy allowance plus two capped release jobs. A release runner's observed 8.62 GiB peak informed the compilation cap. Future Docker scopes inherit their slice default; existing scopes are updated with runtime properties, without retaining configuration for each container ID.

The installer refuses a new cap below current usage before applying changes. A second apply is idempotent. Inactive loaded units have no cgroup and are handled at boot; an inactive Docker user manager is explicitly deferred and fails a complete `--check`. No runner registration, stop or restart is required.

These are reclaim floors and local caps, not preallocated physical memory or immunity to every global/ancestor OOM. The total of independent caps is not a host-wide admission budget. [Kernel memory controller semantics](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html#memory), [systemd resource controls](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html).

## Proof

The public integration boundary is [`tests/beelink-deploy-memory.integration.sh`](../../tests/beelink-deploy-memory.integration.sh). It checks actual gate admission and the installed policy, proves default inheritance through a new user scope and a real rootless Docker container, then runs two disposable load services: a capped gate allocator and a deploy canary in the real deploy ancestor. The allocator must have systemd result `oom-kill`; the deploy canary must complete after it and the deploy ancestor's OOM counter must not increase. Maximum combined synthetic allocation is 192 MiB; it never exhausts the real aggregate gate or the host.

Initial owner apply / second apply / effective check / bounded kernel proof passed on both Beelinks at `dc22f197f34383a574f229f5700e4c8a5df241f3`:

- `beelink1-46bd707802fd6f039a22748c90806b91`, exit 0.
- `beelink2-496ff1fa5ab396fb549ff68a3cb31ded`, exit 0.

Final runtime `423a7bd5c99be09eeeaeeeb4b3181bdd1df2c2ec`, including new transient scope and real Docker-container inheritance, passed owner apply, second apply, effective check and the bounded proof on both hosts:

- `beelink1-bdc93655244d12b1722dc572d2c3fdd1`, exit 0; command CPU 1.3 s.
- `beelink2-83d72f5d47b8fc6789f31ab7885386c4`, exit 0; command CPU 0.9 s.

Each printed `PASS gate_result=oom-kill gate_exit=1 deploy_survived=true deploy_oom_delta=0 max_test_memory=192MiB`. `gate_exit=1` is the systemd-run wrapper status; `Result=oom-kill` identifies the kernel termination. Effective policy and second applies passed independently, and no Actions runner was restarted by the installer. Earlier independent review approved the base policy; the final review covers the Docker default/inventory race fix.

No Actions workflow was dispatched, cancelled or deployed by this lane. No install, build or test suite ran on GTR. Actual future production runs remain b5's live acceptance sample; the canary is not a claim that a production deployment shipped.
