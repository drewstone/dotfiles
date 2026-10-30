import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readlinkSync, symlinkSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const hook = resolve("claude/hooks/host-stop-guard");

function decide(command) {
  const out = spawnSync("python3", [hook], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });
  assert.equal(out.status, 0, out.stderr);
  if (!out.stdout.trim()) return null;
  return JSON.parse(out.stdout).hookSpecificOutput;
}

function denied(command) {
  const decision = decide(command);
  assert.equal(decision?.permissionDecision, "deny", command);
  assert.match(decision.permissionDecisionReason, /runner-drain\.sh drain/);
  assert.match(decision.permissionDecisionReason, /drewstone\/tangle-devops/);
}

test("denies wsl --shutdown aimed at a Beelink and allows uptime", () => {
  denied("ssh beelink2 'wsl --shutdown'");
  assert.equal(decide("ssh beelink2 uptime"), null);
});

test("denies fleet-host stops and allows the scratch-distro drill", () => {
  for (const command of [
    "ssh beelink1 'wsl --terminate Ubuntu-24.04'",
    "ssh beelink1-wsl 'sudo reboot'",
    "ssh beelink2-wsl 'systemctl poweroff'",
    "ssh drew-gtr-pro 'systemctl halt'",
    "ssh drew-gtr-pro 'systemctl kexec'",
    "ssh beelink2 'init 0'",
    "ssh beelink2 'init 6'",
    "ssh desktop-18ir33v 'Restart-Computer'",
    "ssh beelink2 'Stop-Computer -Force'",
    "ssh beelink2 'Stop-Service WslService'",
    "ssh beelink2 'sc stop WslService'",
    "ssh beelink2 'shutdown /s /t 0'",
    "ssh beelink2 'shutdown.exe /r /t 30'",
    "ssh -o BatchMode=yes drew@100.127.22.51 wsl.exe --shutdown",
    "ssh beelink2 'bash -lc \"sudo reboot\"'",
    "ssh beelink2 'wsl -e reboot'",
  ]) denied(command);
  for (const command of [
    "ssh beelink2 'wsl --terminate Ubuntu-24.04-drill'",
    "ssh beelink2 'wsl -t Ubuntu-24.04-drill'",
    "ssh beelink2 'wsl.exe --terminate Ubuntu-24.04-drill'",
    "ssh otherhost sudo reboot",
    "echo 'wsl --shutdown on beelink2'",
    "ssh beelink2 uptime",
  ]) assert.equal(decide(command), null, command);
});

test("argv script boundaries and a -drill suffix that does not end the name", () => {
  const argv = spawnSync("python3", [hook], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: ["bash", "-lc", "ssh beelink2 wsl --shutdown"] } }),
    encoding: "utf8",
  });
  assert.equal(argv.status, 0, argv.stderr);
  const decision = JSON.parse(argv.stdout).hookSpecificOutput;
  assert.equal(decision.permissionDecision, "deny");
  for (const command of [
    "ssh beelink2 'wsl --terminate Ubuntu-drill-production'",
    "ssh beelink2 'wsl --terminate Ubuntu-drill.backup'",
  ]) denied(command);
});

test("denies a local stop when this machine is a serving fleet host", () => {
  const local = /^(?:beelink[12]|beelink\d+-wsl|drew-gtr-pro|desktop-18ir33v)$/i.test(hostname().split(".")[0]);
  const decision = decide("sudo reboot");
  if (local) denied("sudo reboot");
  else assert.equal(decision, null);
  assert.equal(decide("echo reboot"), null);
});

test("fails open on input it cannot parse and ignores other tools", () => {
  const bad = spawnSync("python3", [hook], { input: "not json", encoding: "utf8" });
  assert.equal(bad.status, 0, bad.stderr);
  assert.equal(bad.stdout.trim(), "");
  const other = spawnSync("python3", [hook], {
    input: JSON.stringify({ tool_name: "Read", tool_input: { command: "ssh beelink2 reboot" } }),
    encoding: "utf8",
  });
  assert.equal(other.status, 0);
  assert.equal(other.stdout.trim(), "");
});

test("settings route Bash through the guard and Codex install trusts it", () => {
  const settings = JSON.parse(readFileSync(resolve("claude/settings.json"), "utf8"));
  const entry = settings.hooks.PreToolUse.find((matcher) => matcher.matcher === "Bash");
  assert.ok(entry.hooks.some((item) => item.command.endsWith("/hooks/host-stop-guard")));
  const install = readFileSync(resolve("claude/install.sh"), "utf8");
  assert.match(install, /host-stop-guard/);
});

const SHAPE1 = "ssh -o BatchMode=yes -o ControlPath=none -o ConnectTimeout=10 beelink2-wsl sudo -n bash -s drain 3300";
const SHAPE2 = "WPS_FILES='wsl-lib.ps1 runner-drain.sh' WPS_TIMEOUT=7500 /home/drew/bin/unattended --name bd-wsl-worker-proof --watch -- ./run-ps1.sh beelink2 wsl-drill.ps1 -HostIndex 2 -Drill -RefusalOnly -WaitMinutes 120";
const PAYLOAD = "#!/bin/bash\n# runner-drain.sh drain [SECONDS] | undrain | status\ncase \"${1:-}\" in\n  drain)\n    systemctl stop actions.runner.example.service ;;\n  undrain)\n    echo undrained ;;\n  status)\n    echo status-ok ;;\nesac\n";
const entry = resolve("runner-cover/host-stop-guard.py");
const COVER = JSON.stringify([
  { name: "deploy-beelink2-adc-01", status: "online", labels: ["ci-deploy"], group: 12 },
  { name: "release-beelink2-adc-02", status: "online", labels: ["ci-release"], group: 12 },
  { name: "deploy-beelink1-adc-01", status: "online", labels: ["ci-deploy"], group: 5 },
  { name: "release-beelink1-adc-02", status: "online", labels: ["ci-release"], group: 5 },
]);

function host(command, stdin, env = {}) {
  const out = spawnSync("python3", [entry, "--host"], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, HOST_STOP_COMMAND: command, HOST_STOP_RUNNERS_JSON: "", HOST_STOP_HOST: "", HOST_STOP_DRY_RUN: "", ...env },
  });
  return out;
}

test("host entry allows status and refuses a drain that would drop the last production host", () => {
  const status = host("bash -s status", PAYLOAD);
  assert.equal(status.status, 0, status.stderr);
  const undrain = host("bash -s undrain", PAYLOAD);
  assert.equal(undrain.status, 0, undrain.stderr);
  const drained = host(SHAPE1, PAYLOAD, { HOST_STOP_RUNNERS_JSON: COVER, HOST_STOP_HOST: "beelink2" });
  assert.equal(drained.status, 125, drained.stderr);
  assert.match(drained.stderr, /ci-deploy/);
  assert.match(drained.stderr, /ci-release/);
  assert.match(drained.stderr, /12, 13 and 14/);
  const hidden = host("ssh -o BatchMode=yes -o ControlPath=none -o ConnectTimeout=10 beelink2-wsl sudo -n bash -s work 3300", PAYLOAD);
  assert.equal(hidden.status, 125, hidden.stderr);
  assert.match(hidden.stderr, /GitHub runner status unreachable/);
  const argvOnly = host(SHAPE1, "echo ok\n");
  assert.equal(argvOnly.status, 0, argvOnly.stderr);
  const drill = host(SHAPE2, "", { HOST_STOP_RUNNERS_JSON: COVER, HOST_STOP_HOST: "beelink2" });
  assert.equal(drill.status, 125, drill.stderr);
  const cutover = host(SHAPE1, PAYLOAD, { HOST_STOP_RUNNERS_JSON: COVER, HOST_STOP_HOST: "beelink1", HOST_STOP_DRY_RUN: "1", HOST_STOP_PARENT: "powershell.exe -File C:\\ProgramData\\tangle-wall\\wsl\\wsl-window.ps1 -HostIndex 2" });
  assert.equal(cutover.status, 0, cutover.stderr);
  assert.equal(cutover.stdout, "allowed\n");
  const noRelease = JSON.stringify([{ name: "deploy-beelink2-adc-01", status: "online", labels: ["ci-deploy"], group: 12 }]);
  const gap = host(SHAPE1, PAYLOAD, { HOST_STOP_RUNNERS_JSON: noRelease, HOST_STOP_HOST: "beelink1" });
  assert.equal(gap.status, 125, gap.stderr);
  assert.match(gap.stderr, /ci-release/);
});

test("sudo bash wrapper allows a status verb, refuses an uncovered drain, and dry-runs an allowed one", () => {
  const dir = mkdtempSync(join(tmpdir(), "host-stop-bash-"));
  const bash = join(dir, "bash");
  symlinkSync(entry, bash);
  const status = spawnSync(bash, ["-s", "status"], { input: PAYLOAD, encoding: "utf8" });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(status.stdout, "status-ok\n");
  const bypass = spawnSync(bash, ["-s", "status"], {
    input: "echo should-not-run\n# runner-drain.sh\nsystemctl stop actions.runner.example.service\n",
    encoding: "utf8",
  });
  assert.equal(bypass.status, 125, bypass.stderr);
  assert.equal(bypass.stdout, "");
  const denied = spawnSync(bash, ["-s", "drain"], {
    input: PAYLOAD,
    encoding: "utf8",
    env: { ...process.env, HOST_STOP_RUNNERS_JSON: COVER, HOST_STOP_HOST: "beelink2" },
  });
  assert.equal(denied.status, 125, denied.stderr);
  assert.match(denied.stderr, /ci-deploy/);
  assert.equal(denied.stdout, "");
  const allowed = spawnSync(bash, ["-s", "drain"], {
    input: "echo drained\n# runner-drain.sh systemctl stop actions.runner.example.service\n",
    encoding: "utf8",
    env: { ...process.env, HOST_STOP_RUNNERS_JSON: COVER, HOST_STOP_HOST: "beelink1", HOST_STOP_DRY_RUN: "1" },
  });
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(allowed.stdout, "allowed\n");
  const ok = spawnSync(bash, ["-s"], { input: "echo ok\n", encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout, "ok\n");
  assert.equal(readlinkSync(resolve("host/sbin/bash")), "../../runner-cover/host-stop-guard.py");
  assert.match(readFileSync(resolve("host/sudoers.d/zz-agent-blast-guard"), "utf8"), /HOST_STOP_BASH/);
  assert.match(readFileSync(resolve("host/sudoers.d/zz-agent-blast-guard"), "utf8"), /HOST_STOP_DRY_RUN/);
});

test("a held stdin runs instead of waiting for the stream to close", async () => {
  const dir = mkdtempSync(join(tmpdir(), "host-stop-open-"));
  const bash = join(dir, "bash");
  symlinkSync(entry, bash);
  const child = spawn(bash, ["-s", "--", "kept"], { stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.write("echo gate-ok\n");
  const out = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("held stdin hung"));
    }, 3000);
    child.stdout.on("data", (buf) => {
      clearTimeout(timer);
      resolve(buf.toString());
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  child.kill("SIGKILL");
  assert.equal(out, "gate-ok\n");
});
